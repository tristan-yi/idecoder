"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { SimOutcome, SimScenario } from "@/lib/review/types";

export function ScenarioConsole({
  scenarios,
  outcome,
}: {
  scenarios: SimScenario[];
  outcome: SimOutcome | null;
}) {
  return (
    <div className="h-full overflow-y-auto bg-panel px-3 py-3 font-mono text-[12.5px]">
      {outcome?.compileError && (
        <pre className="mb-3 whitespace-pre-wrap rounded-md border border-hard/40 bg-hard/10 p-2 text-hard">
          {outcome.compileError}
        </pre>
      )}

      {!outcome && (
        <p className="text-mute">
          Run the scenarios to see which parts of the flow work. They exercise
          the real chain: handler, API helper, route, store.
        </p>
      )}

      <ul className="space-y-1.5">
        {scenarios.map((scenario) => {
          const result = outcome?.scenarios.find((s) => s.id === scenario.id);
          const Icon = !result ? Circle : result.pass ? CheckCircle2 : XCircle;
          const tone = !result
            ? "text-mute"
            : result.pass
              ? "text-easy"
              : "text-hard";

          return (
            <li key={scenario.id}>
              <div className={`flex items-start gap-1.5 ${tone}`}>
                <Icon size={13} className="mt-0.5 shrink-0" />
                <span className="text-zinc-200">{scenario.name}</span>
              </div>
              {result && !result.pass && (
                <div className="mt-0.5 space-y-0.5 pl-5 text-[11.5px]">
                  {result.error && <div className="text-hard">{result.error}</div>}
                  {result.assertions
                    .filter((a) => !a.pass)
                    .map((a) => (
                      <div key={a.name} className="text-mute">
                        {a.name}
                        {a.detail ? ` — ${a.detail}` : ""}
                      </div>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {outcome && outcome.logs.length > 0 && (
        <pre className="mt-3 whitespace-pre-wrap border-t border-line pt-2 text-mute">
          {outcome.logs.join("\n")}
        </pre>
      )}
    </div>
  );
}
