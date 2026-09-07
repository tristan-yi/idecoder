import type { RunOutcome } from "./types";

export type TraceInfo = {
  line: number | null;
  column: number | null;
  type: string | null;
  message: string;
  snippet: string | null;
  headline: string;
};

const PY_FILE = /File "solution\.py", line (\d+)/;
const JS_FILE = /solution\.js:(\d+)(?::(\d+))?/;
const JS_PAREN = /\(solution\.js:(\d+):(\d+)\)/;
const LINE_HEAD = /^Line (\d+)\s*[·:]\s*(.*)$/;
const EXC =
  /^(?:Uncaught )?([A-Za-z_][\w.]*(?:Error|Exception|Warning|Exit))\s*:\s*(.*)$/;

export function parseTrace(text: string): TraceInfo {
  const raw = String(text || "").trim();
  const empty: TraceInfo = {
    line: null,
    column: null,
    type: null,
    message: raw,
    snippet: null,
    headline: raw || "Error",
  };
  if (!raw) return empty;

  const lines = raw.split("\n");
  let line: number | null = null;
  let column: number | null = null;
  let snippet: string | null = null;
  let type: string | null = null;
  let message = raw;

  const head = lines[0].match(LINE_HEAD);
  if (head) {
    line = Number(head[1]);
    const rest = head[2];
    const exc = rest.match(EXC);
    if (exc) {
      type = exc[1];
      message = exc[2];
    } else {
      message = rest;
    }
    const next = lines[1];
    if (
      next &&
      /^\s+/.test(next) &&
      !next.includes("File ") &&
      !next.includes("Traceback")
    ) {
      snippet = next.trim();
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const py = lines[i].match(PY_FILE);
    const js = lines[i].match(JS_FILE) || lines[i].match(JS_PAREN);
    if (py) {
      line = Number(py[1]);
      const next = lines[i + 1];
      if (next && /^\s+/.test(next) && !next.includes("File ")) {
        snippet = next.trim();
      }
    } else if (js) {
      line = Number(js[1]);
      if (js[2]) column = Number(js[2]);
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const exc = lines[i].trim().match(EXC);
    if (exc) {
      type = exc[1];
      message = exc[2];
      break;
    }
  }

  const loc = line != null ? `Line ${line}` : null;
  const err = type ? `${type}: ${message}` : message;
  const headline = loc ? `${loc} · ${err}` : err || "Error";
  return { line, column, type, message, snippet, headline };
}

export function firstErrorTrace(outcome: RunOutcome | null): TraceInfo | null {
  if (!outcome) return null;
  const texts: string[] = [];
  for (const result of outcome.results ?? []) {
    if (result.error) texts.push(result.error);
    for (const step of result.steps ?? []) {
      if (step.error) texts.push(step.error);
    }
  }
  if (outcome.stderr) texts.push(outcome.stderr);
  for (const text of texts) {
    const info = parseTrace(text);
    if (info.line != null || info.type || info.message) {
      if (info.line != null || info.type) return info;
    }
  }
  return texts[0] ? parseTrace(texts[0]) : null;
}
