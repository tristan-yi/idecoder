import type { RunOutcome, TestResult } from "./types";

export type Verdict =
  | "Accepted"
  | "Wrong Answer"
  | "Runtime Error"
  | "Compile Error"
  | "Time Limit Exceeded";

const COMPILE = /SyntaxError|IndentationError|TabError|TypeScript compile error/i;

export function outcomeVerdict(outcome: RunOutcome): Verdict | null {
  if (outcome.timedOut) return "Time Limit Exceeded";
  if (outcome.results) {
    if (outcome.results.every((result) => result.pass)) return "Accepted";
    if (outcome.results.some((result) => Boolean(result.error))) {
      return "Runtime Error";
    }
    return "Wrong Answer";
  }
  if (!outcome.ok && outcome.stderr) {
    return COMPILE.test(outcome.stderr) ? "Compile Error" : "Runtime Error";
  }
  return null;
}

export function caseVerdict(result: TestResult): "passed" | "Wrong Answer" | "Runtime Error" {
  if (result.pass) return "passed";
  if (result.error) return "Runtime Error";
  return "Wrong Answer";
}

export function valueKind(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `array (length ${value.length})`;
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return typeof value;
}
