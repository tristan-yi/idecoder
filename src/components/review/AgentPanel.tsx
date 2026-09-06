"use client";

import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { ProposalReview } from "./ProposalReview";
import type {
  AgentProposal,
  ChatMessage,
  ExplanationGrade,
  ReviewDecision,
  ReviewVerdict,
} from "@/lib/review/types";

const STARTERS = [
  "Walk me through what happens when the form is submitted.",
  "Where would the fix for this ticket go?",
  "Implement the missing piece.",
];

export function AgentPanel({
  messages,
  proposals,
  verdicts,
  grades,
  draft,
  onDraftChange,
  onSend,
  onVerdict,
  sending,
  blocked,
  error,
}: {
  messages: ChatMessage[];
  proposals: AgentProposal[];
  verdicts: ReviewVerdict[];
  grades: ExplanationGrade[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onVerdict: (proposalId: string, decision: ReviewDecision, explanation: string) => void;
  sending: boolean;
  blocked: boolean;
  error: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line px-3 text-[12.5px] font-medium">
        <Sparkles size={13} className="text-mint" />
        Assistant
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="rounded-lg border border-line bg-ink p-3">
            <p className="text-[13px] leading-6 text-mute">
              Ask about the codebase, or ask for code. Anything it writes has to
              clear your review before it lands in your files.
            </p>
            <div className="mt-2 space-y-1">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => onDraftChange(starter)}
                  className="block w-full rounded border border-line px-2 py-1.5 text-left text-[12.5px] text-zinc-300 hover:border-mint/40 hover:text-white"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const proposal = message.proposalId
            ? proposals.find((p) => p.id === message.proposalId)
            : null;
          const verdict = proposal
            ? (verdicts.find((v) => v.proposalId === proposal.id) ?? null)
            : null;

          if (message.role === "user") {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-white/10 px-3 py-2 text-[13px] leading-6">
                  {message.content}
                </div>
              </div>
            );
          }

          return (
            <div key={message.id} className="space-y-2">
              <div className="problem-md text-[13px] leading-6">
                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
              </div>
              {proposal && (
                <ProposalReview
                  proposal={proposal}
                  verdict={verdict}
                  grade={
                    grades.find((g) => g.proposalId === proposal.id) ?? null
                  }
                  onSubmit={(decision, explanation) =>
                    onVerdict(proposal.id, decision, explanation)
                  }
                />
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center gap-2 text-[13px] text-mute">
            <Loader2 size={13} className="animate-spin" />
            Thinking…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-hard/40 bg-hard/10 px-3 py-2 text-[12.5px] text-hard">
            {error}
          </div>
        )}

        <div ref={bottom} />
      </div>

      <div className="shrink-0 border-t border-line p-2">
        {blocked && (
          <p className="mb-1.5 px-1 text-[11.5px] text-medium">
            Submit your review above before asking for anything else.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!blocked && !sending) onSend();
              }
            }}
            rows={2}
            disabled={blocked}
            placeholder={blocked ? "Blocked until you review" : "Ask anything about this codebase"}
            className="min-h-0 flex-1 resize-none rounded-md border border-line bg-ink px-3 py-2 text-[13px] outline-none placeholder:text-mute focus:border-mint/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={blocked || sending || !draft.trim()}
            aria-label="Send"
            className="rounded-md bg-mint p-2 text-ink hover:bg-mint/90 disabled:opacity-40"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
