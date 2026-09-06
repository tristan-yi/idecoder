"use client";

import { X } from "lucide-react";
import type { SessionReport } from "@/lib/review/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11.5px] text-mute">{label}</div>
    </div>
  );
}

export function ReportModal({
  report,
  onClose,
}: {
  report: SessionReport | null;
  onClose: () => void;
}) {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-panel p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Session review</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-mute hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="defects caught"
            value={`${report.caught}/${report.plantedTotal}`}
          />
          <Stat label="reviewed" value={String(report.reviewedTotal)} />
          <Stat label="false alarms" value={String(report.falseAlarms)} />
        </div>

        {report.summary && (
          <p className="mt-4 text-[13.5px] leading-6 text-zinc-200">
            {report.summary}
          </p>
        )}

        {report.strengths.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-easy">
              Working well
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-zinc-300">
              {report.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {report.improvements.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-medium">
              Work on this
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-zinc-300">
              {report.improvements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {report.grades.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-sm font-semibold">
              On each explanation
            </h3>
            <ul className="space-y-2">
              {report.grades.map((grade, index) => (
                <li
                  key={grade.proposalId}
                  className="rounded-lg border border-line bg-ink px-3 py-2"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-mute">
                    <span className="text-zinc-300">Suggestion {index + 1}</span>
                    <span>clarity {grade.clarity}/5</span>
                    {grade.referencedConvention && (
                      <span className="text-mint">cited the convention</span>
                    )}
                    {grade.checkedEdgeCases && (
                      <span className="text-mint">named an edge case</span>
                    )}
                    <span className={grade.caught ? "text-easy" : "text-hard"}>
                      {grade.caught ? "correct call" : "wrong call"}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-5 text-zinc-300">
                    {grade.note}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
