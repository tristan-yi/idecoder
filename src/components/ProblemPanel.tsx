"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";
import type { Problem } from "@/lib/types";

const difficultyClass: Record<Problem["difficulty"], string> = {
  Easy: "text-easy",
  Medium: "text-medium",
  Hard: "text-hard",
};

export function ProblemPanel({
  problem,
  onSimilar,
  similarLoading,
}: {
  problem: Problem;
  onSimilar?: () => void;
  similarLoading?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto bg-panel px-5 py-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{problem.title}</h1>
          <span className={`text-sm font-medium ${difficultyClass[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
        </div>
        {onSimilar && (
          <button
            type="button"
            onClick={onSimilar}
            disabled={similarLoading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-ink px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-mint/40 hover:text-white disabled:opacity-50"
          >
            {similarLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} className="text-mint" />
            )}
            Similar question
          </button>
        )}
      </div>
      {((problem.warnings && problem.warnings.length > 0) ||
        (problem.generationNotes && problem.generationNotes.length > 0)) && (
        <div
          className={`mb-5 rounded-lg border px-3 py-2.5 text-sm ${
            problem.warnings && problem.warnings.length > 0
              ? "border-medium/40 bg-medium/10 text-zinc-200"
              : "border-mint/30 bg-mint/10 text-zinc-200"
          }`}
        >
          <div
            className={`mb-1.5 flex items-center gap-1.5 font-medium ${
              problem.warnings && problem.warnings.length > 0 ? "text-medium" : "text-mint"
            }`}
          >
            {problem.warnings && problem.warnings.length > 0 ? (
              <AlertTriangle size={14} />
            ) : (
              <Info size={14} />
            )}
            {problem.warnings && problem.warnings.length > 0
              ? "Review tests before practicing"
              : "Tests were auto-corrected"}
          </div>
          <p className="mb-2 text-[12.5px] leading-5 text-mute">
            {problem.warnings && problem.warnings.length > 0
              ? "The generated examples and test arrays disagreed. Fix the items below before treating this pad as final."
              : "The example text and raw test data did not match, so the test arrays were updated to follow the written explanation."}
          </p>
          {problem.generationNotes && problem.generationNotes.length > 0 && (
            <ul className="mb-2 list-disc space-y-1 pl-4 text-[12.5px] leading-5 text-zinc-300">
              {problem.generationNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {problem.warnings && problem.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-5 text-zinc-300">
              {problem.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {problem.topics.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {problem.topics.map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-line bg-ink px-2 py-0.5 text-[11px] text-mute"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
      <div className="problem-md">
        <Markdown remarkPlugins={[remarkGfm]}>{problem.description}</Markdown>
      </div>
      {problem.examples.map((example, i) => (
        <section key={i} className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Example {i + 1}:</h2>
          <div className="rounded-lg border border-line bg-ink px-3 py-3 font-mono text-[13px] leading-6">
            <div>
              <span className="text-mute">Input: </span>
              {example.input}
            </div>
            <div>
              <span className="text-mute">Output: </span>
              {example.output}
            </div>
            {example.explanation && (
              <div className="mt-1 text-[12.5px] text-mute">
                Explanation: {example.explanation}
              </div>
            )}
          </div>
        </section>
      ))}
      {problem.constraints.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Constraints:</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {problem.constraints.map((c) => (
              <li key={c}>
                <code className="rounded bg-ink px-1 py-0.5 font-mono text-[13px]">
                  {c}
                </code>
              </li>
            ))}
          </ul>
        </section>
      )}
      {problem.followUps && problem.followUps.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Follow-up:</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {problem.followUps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
