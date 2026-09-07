"use client";

import type { Example, RunOutcome, TestCase, TestResult } from "@/lib/types";
import {
  caseVerdict,
  outcomeVerdict,
  valueKind,
  type Verdict,
} from "@/lib/verdict";

function dump(value: unknown) {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function verdictClass(verdict: Verdict | "passed") {
  return verdict === "Accepted" || verdict === "passed" ? "text-easy" : "text-hard";
}

function Trace({ text }: { text: string }) {
  return (
    <pre className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-hard">
      {text}
    </pre>
  );
}

function CaseBlock({
  result,
  test,
}: {
  result: TestResult;
  test?: TestCase;
}) {
  const steps = result.steps?.filter(Boolean) ?? [];
  const verdict = caseVerdict(result);
  const kindMismatch =
    !result.pass &&
    !result.error &&
    valueKind(result.actual) !== valueKind(result.expected);
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        result.pass ? "border-easy/30 bg-easy/10" : "border-hard/30 bg-hard/10"
      }`}
    >
      <div className={verdictClass(verdict)}>
        Case {result.index + 1} · {verdict === "passed" ? "Accepted" : verdict}
      </div>
      {result.call ? (
        <div className="text-zinc-300">
          <span className="text-mute">Input: </span>
          {result.call}
        </div>
      ) : test ? (
        <div className="text-zinc-300">
          <span className="text-mute">Input: </span>
          {dump(test.args)}
        </div>
      ) : null}
      {steps.length > 1 ? (
        <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
          {steps.map((step, i) => (
            <li key={i} className={step.pass ? "text-zinc-300" : "text-hard"}>
              <div>
                <span className="text-mute">{i + 1}. </span>
                {step.call}{" "}
                <span className={step.pass ? "text-easy" : "text-hard"}>
                  {step.pass ? "ok" : step.error ? "Runtime Error" : "Wrong Answer"}
                </span>
              </div>
              <div className="pl-4 text-[12px] leading-5">
                <div>
                  <span className="text-mute">Expected: </span>
                  {dump(step.expected)}
                </div>
                <div>
                  <span className="text-mute">Output: </span>
                  {dump(step.actual)}
                </div>
                {step.error ? <Trace text={step.error} /> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <div className="text-zinc-300">
            <span className="text-mute">Expected: </span>
            {dump(result.expected)}
          </div>
          <div className="text-zinc-300">
            <span className="text-mute">Output: </span>
            {dump(result.actual)}
          </div>
        </>
      )}
      {kindMismatch ? (
        <div className="mt-1 text-[12px] leading-5 text-hard">
          Type mismatch: expected {valueKind(result.expected)}, got{" "}
          {valueKind(result.actual)}.
        </div>
      ) : null}
      {result.error ? <Trace text={result.error} /> : null}
      {result.note ? (
        <div className="mt-1 text-[12px] leading-5 text-mute">{result.note}</div>
      ) : null}
    </div>
  );
}

export function ConsolePane({
  examples,
  tests,
  outcome,
  mode,
}: {
  examples: Example[];
  tests: TestCase[];
  outcome: RunOutcome | null;
  mode: "tests" | "run";
}) {
  const results = outcome?.results;
  const failed = results?.filter((r) => !r.pass).length ?? 0;
  const passed = results?.filter((r) => r.pass).length ?? 0;
  const verdict = outcome ? outcomeVerdict(outcome) : null;

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs uppercase tracking-wider text-mute">
        <span>Console</span>
        {verdict && (
          <span className={verdictClass(verdict)}>{verdict}</span>
        )}
        {results && (
          <span className={failed ? "text-hard" : "text-easy"}>
            {passed}/{results.length} passed
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-6">
        {!outcome && (
          <div className="space-y-3 text-zinc-300">
            {examples.map((example, i) => (
              <div key={i}>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-mute">
                  Case {i + 1}
                </div>
                <div>
                  <span className="text-mute">Input: </span>
                  {example.input}
                </div>
                <div>
                  <span className="text-mute">Expected: </span>
                  {example.output}
                </div>
                {example.explanation ? (
                  <div className="text-mute">
                    <span>Note: </span>
                    {example.explanation}
                  </div>
                ) : null}
              </div>
            ))}
            {examples.length === 0 && (
              <p className="text-mute">
                Run your code or tests to see output here.
              </p>
            )}
          </div>
        )}

        {outcome && results && (
          <div className="space-y-3">
            {results.map((result) => (
              <CaseBlock
                key={result.index}
                result={result}
                test={tests[result.index]}
              />
            ))}
          </div>
        )}

        {outcome && !results && (
          <div>
            {verdict && (
              <p className={`mb-2 ${verdictClass(verdict)}`}>{verdict}</p>
            )}
            {mode === "tests" && outcome.stdout && (
              <p className="mb-2 text-mute">
                No structured test results. Showing raw output.
              </p>
            )}
            {outcome.stdout && (
              <pre className="whitespace-pre-wrap text-zinc-200">
                {outcome.stdout}
              </pre>
            )}
            {outcome.stderr && <Trace text={outcome.stderr} />}
            {!outcome.stdout && !outcome.stderr && (
              <p className="text-mute">Finished with no output.</p>
            )}
          </div>
        )}

        {outcome?.stdout && results && (
          <pre className="mt-3 whitespace-pre-wrap text-mute">{outcome.stdout}</pre>
        )}
        {outcome?.stderr && results && <Trace text={outcome.stderr} />}
      </div>
    </div>
  );
}
