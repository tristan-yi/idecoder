"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClipboardList, HelpCircle, Loader2 } from "lucide-react";
import type { Tally } from "@/lib/review/scoring";
import type { ReviewSession } from "@/lib/review/types";

export function TaskPanel({
  session,
  counts,
  scenariosPassing,
  scenariosTotal,
  onFinish,
  finishing,
}: {
  session: ReviewSession;
  counts: Tally;
  scenariosPassing: number;
  scenariosTotal: number;
  onFinish: () => void;
  finishing: boolean;
}) {
  const [showQuestions, setShowQuestions] = useState(false);
  const { task } = session;

  return (
    <div className="h-full overflow-y-auto bg-panel px-5 py-5">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-mute">
        <ClipboardList size={13} />
        {session.domainLabel}
      </div>
      <h1 className="text-lg font-semibold leading-snug tracking-tight">
        {task.title}
      </h1>
      <p className="mt-1 text-xs text-mute">
        {task.reporter} in {task.channel}
      </p>

      <div className="problem-md mt-4">
        <Markdown remarkPlugins={[remarkGfm]}>{task.body}</Markdown>
      </div>

      {task.acceptanceHints.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">What they expect</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {task.acceptanceHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <HelpCircle size={14} className="text-mute" />
          Clarifying questions
        </h2>
        {showQuestions ? (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {task.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-line bg-ink px-3 py-3">
            <p className="text-[13px] leading-6 text-mute">
              This report leaves {task.openQuestions.length} things genuinely
              undecided. Work out what you would ask before you look.
            </p>
            <button
              type="button"
              onClick={() => setShowQuestions(true)}
              className="mt-2 text-[13px] text-mint hover:underline"
            >
              Show what was left open
            </button>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-line bg-ink px-3 py-3">
        <h2 className="mb-2 text-sm font-semibold">This session</h2>
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-mute">Suggestions reviewed</dt>
            <dd>{counts.reviewed}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Defects caught</dt>
            <dd>
              {counts.caught} / {counts.plantedTotal}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Scenarios passing</dt>
            <dd>
              {scenariosPassing} / {scenariosTotal}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11.5px] leading-5 text-mute">
          Roughly half the planted defects do not turn a scenario red. Green
          scenarios are not a review.
        </p>
        <button
          type="button"
          onClick={onFinish}
          disabled={finishing || counts.reviewed === 0}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] hover:bg-white/5 disabled:opacity-40"
        >
          {finishing && <Loader2 size={13} className="animate-spin" />}
          Finish and score
        </button>
      </section>
    </div>
  );
}
