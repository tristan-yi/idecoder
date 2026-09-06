"use client";

import { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { AlertTriangle, Check, PencilLine, ShieldCheck, X } from "lucide-react";
import { EDITOR_OPTIONS, THEME, defineTheme } from "./monaco";
import { CATEGORY_LABELS } from "@/lib/review/mutations";
import { fileLanguage } from "@/lib/review/types";
import type {
  AgentProposal,
  ExplanationGrade,
  ReviewDecision,
  ReviewVerdict,
} from "@/lib/review/types";

const DECISIONS: { id: ReviewDecision; label: string; icon: typeof Check }[] = [
  { id: "accept", label: "Accept", icon: Check },
  { id: "modify", label: "Accept with changes", icon: PencilLine },
  { id: "reject", label: "Reject", icon: X },
];

function DiffView({ proposal }: { proposal: AgentProposal }) {
  const [path, setPath] = useState(proposal.edits[0]?.path ?? "");
  const edit = proposal.edits.find((e) => e.path === path) ?? proposal.edits[0];
  if (!edit) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-stretch overflow-x-auto border-b border-line bg-panel">
        {proposal.edits.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => setPath(item.path)}
            className={`whitespace-nowrap border-r border-line px-3 py-1.5 text-[12px] ${
              item.path === edit.path ? "bg-[#0e1116] text-white" : "text-mute"
            }`}
          >
            {item.path}
          </button>
        ))}
      </div>
      <div className="h-64 bg-[#0e1116]">
        <DiffEditor
          height="100%"
          theme={THEME}
          language={fileLanguage(edit.path)}
          original={edit.before}
          modified={edit.after}
          beforeMount={defineTheme}
          options={{
            ...EDITOR_OPTIONS,
            readOnly: true,
            renderSideBySide: false,
            renderOverviewRuler: false,
          }}
          loading={
            <div className="flex h-full items-center justify-center text-sm text-mute">
              Loading diff…
            </div>
          }
        />
      </div>
    </div>
  );
}

export function ProposalReview({
  proposal,
  verdict,
  grade,
  onSubmit,
}: {
  proposal: AgentProposal;
  verdict: ReviewVerdict | null;
  /** Present only after the session has been graded, and outranks the heuristic. */
  grade?: ExplanationGrade | null;
  onSubmit: (decision: ReviewDecision, explanation: string) => void;
}) {
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [explanation, setExplanation] = useState("");

  const tooShort = explanation.trim().length < 15;

  if (verdict) {
    const planted = proposal.planted;
    return (
      <div className="rounded-lg border border-line bg-ink p-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] text-mute">
          <span className="rounded border border-line px-1.5 py-0.5 capitalize text-zinc-300">
            {verdict.decision}
          </span>
          <span>you said: {verdict.explanation}</span>
        </div>

        {planted ? (
          <div className="rounded-md border border-hard/40 bg-hard/10 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-hard">
              <AlertTriangle size={14} />
              {CATEGORY_LABELS[planted.category]}
              <span className="ml-auto text-[11px] font-normal text-mute">
                {(grade ? grade.caught : verdict.caughtHeuristic)
                  ? "you flagged this"
                  : "you missed this"}
              </span>
            </div>
            <p className="text-[13px] text-zinc-200">{planted.label}</p>
            <p className="mt-1 text-[12.5px] leading-5 text-mute">
              {planted.explanation}
            </p>
            <pre className="mt-2 overflow-x-auto rounded border border-line bg-[#0e1116] p-2 font-mono text-[11.5px] text-zinc-300">
              {planted.file}:{planted.line}
              {"\n"}
              {planted.after.trim() || "(the guard was removed)"}
            </pre>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md border border-mint/40 bg-mint/10 p-3 text-[13px] text-mint">
            <ShieldCheck size={14} />
            This suggestion was clean.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-medium/40 bg-medium/5 p-3">
      <p className="mb-2 text-[12px] font-medium text-medium">
        Review this before it touches your files.
      </p>

      <DiffView proposal={proposal} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {DECISIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDecision(id)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] ${
              decision === id
                ? "border-mint bg-mint/15 text-white"
                : "border-line text-zinc-300 hover:bg-white/5"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <textarea
        value={explanation}
        onChange={(event) => setExplanation(event.target.value)}
        rows={3}
        placeholder="Why? Name what is wrong, or why you are confident it is right."
        className="mt-2 w-full resize-none rounded-md border border-line bg-ink px-3 py-2 text-[13px] outline-none placeholder:text-mute focus:border-mint/50"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-mute">
          {tooShort ? "A sentence or two, at least." : "\u00a0"}
        </span>
        <button
          type="button"
          disabled={!decision || tooShort}
          onClick={() => decision && onSubmit(decision, explanation.trim())}
          className="rounded-md bg-mint px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-mint/90 disabled:opacity-40"
        >
          Submit review
        </button>
      </div>
    </div>
  );
}
