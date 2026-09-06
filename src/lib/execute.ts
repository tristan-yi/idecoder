import type { LanguageId, RunOutcome, TestCase } from "./types";
import { buildHarness, parseResults } from "./harness";
import { NO_RUNNER_MESSAGE, languageMeta } from "./languages";
import { runPython, type PythonStage } from "./python";

function runJavascript(code: string, timeoutMs = 4000): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const workerSrc = `
      self.onmessage = (e) => {
        const logs = [];
        const errors = [];
        const cons = {
          log: (...a) => logs.push(a.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" ")),
          error: (...a) => errors.push(a.map(String).join(" ")),
          warn: (...a) => logs.push(a.map(String).join(" ")),
          info: (...a) => logs.push(a.map(String).join(" ")),
        };
        try {
          const fn = new Function("console", e.data.code);
          fn(cons);
          self.postMessage({ ok: true, stdout: logs.join("\\n"), stderr: errors.join("\\n") });
        } catch (err) {
          self.postMessage({ ok: false, stdout: logs.join("\\n"), stderr: String(err) });
        }
      };
    `;
    const blob = new Blob([workerSrc], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        stdout: "",
        stderr: "Timed out after 4s (possible infinite loop).",
        results: null,
        timedOut: true,
      });
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      const parsed = parseResults(e.data.stdout || "");
      resolve({
        ok: e.data.ok && !e.data.stderr,
        stdout: parsed.cleaned,
        stderr: e.data.stderr || "",
        results: parsed.results,
      });
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        stdout: "",
        stderr: err.message || "Worker failed",
        results: null,
      });
    };
    worker.postMessage({ code });
  });
}

/** Strips the types out so the plain JavaScript worker can run it. */
async function runTypescript(source: string): Promise<RunOutcome> {
  let js: string;
  try {
    const { transform } = await import("sucrase");
    js = transform(source, {
      transforms: ["typescript"],
      disableESTransforms: true,
    }).code;
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: `TypeScript compile error: ${err instanceof Error ? err.message : String(err)}`,
      results: null,
    };
  }
  return runJavascript(js);
}

async function runPythonOutcome(
  source: string,
  onProgress?: (stage: PythonStage) => void,
): Promise<RunOutcome> {
  const run = await runPython(source, onProgress);
  const parsed = parseResults(run.stdout || "");
  return {
    ok: run.ok && !run.stderr,
    stdout: parsed.cleaned,
    stderr: run.stderr || "",
    results: parsed.results,
    timedOut: run.timedOut,
  };
}

export async function executeCode(options: {
  language: LanguageId;
  code: string;
  functionName: string;
  tests: TestCase[] | null;
  onProgress?: (stage: PythonStage) => void;
}): Promise<RunOutcome> {
  const meta = languageMeta(options.language);

  if (meta.runner === "none") {
    return {
      ok: false,
      stdout: "",
      stderr: NO_RUNNER_MESSAGE,
      results: null,
    };
  }

  const source = buildHarness(
    options.language,
    options.code,
    options.functionName,
    options.tests,
  );

  if (options.language === "javascript") return runJavascript(source);
  if (options.language === "typescript") return runTypescript(source);
  return runPythonOutcome(source, options.onProgress);
}
