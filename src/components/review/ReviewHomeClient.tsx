"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, Loader2, Settings, Shuffle, Trash2 } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { requestSeed } from "@/lib/review/api";
import { makeReviewSession } from "@/lib/review/session";
import { TEMPLATES } from "@/lib/review/templates";
import {
  deleteReviewSession,
  getReviewSnapshot,
  getServerReviewSnapshot,
  reviewSessionsFromSnapshot,
  saveReviewSession,
  subscribeReviewSessions,
} from "@/lib/review/storage";
import { tally } from "@/lib/review/scoring";

export function ReviewHomeClient() {
  const router = useRouter();
  const raw = useSyncExternalStore(
    subscribeReviewSessions,
    getReviewSnapshot,
    getServerReviewSnapshot,
  );
  const sessions = useMemo(() => reviewSessionsFromSnapshot(raw), [raw]);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function start(templateId?: string) {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const seed = await requestSeed(templateId);
      const session = makeReviewSession(seed);
      saveReviewSession(session);
      queueMicrotask(() => router.push(`/review/${session.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build a codebase");
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-mute hover:text-white"
        >
          <ChevronLeft size={16} />
          Pads
        </Link>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-white"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        AI-assisted review practice
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-mute">
        You drop into an unfamiliar full-stack codebase with a vague bug report
        and an AI assistant. The assistant is competent and confident, and it is
        wrong some of the time. You are scored on whether you notice, not on
        whether the code eventually runs.
      </p>

      <button
        type="button"
        onClick={() => void start()}
        disabled={starting}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-50"
      >
        {starting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Shuffle size={16} />
        )}
        {starting ? "Building a codebase…" : "Start a random session"}
      </button>

      {error && (
        <p className="mt-3 rounded-md border border-hard/40 bg-hard/10 px-3 py-2 text-sm text-hard">
          {error}
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">
          Or pick the shape of the bug
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => void start(template.id)}
              disabled={starting}
              className="rounded-lg border border-line bg-panel px-3 py-3 text-left text-[13px] leading-5 hover:border-mint/40 disabled:opacity-50"
            >
              {template.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-mute">
          The domain, the naming and the ticket copy change every time, so the
          codebase stays unfamiliar.
        </p>
      </section>

      {sessions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">
            Recent sessions
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {sessions.map((session) => {
              const counts = tally(session.proposals, session.verdicts);
              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 bg-panel px-3 py-2.5"
                >
                  <Link
                    href={`/review/${session.id}`}
                    className="min-w-0 flex-1"
                  >
                    <div className="truncate text-sm">{session.task.title}</div>
                    <div className="truncate text-xs text-mute">
                      {session.domainLabel} · {counts.caught}/{counts.plantedTotal}{" "}
                      caught
                      {session.report ? " · scored" : ""}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteReviewSession(session.id)}
                    aria-label="Delete session"
                    className="rounded p-1.5 text-mute hover:bg-white/5 hover:text-hard"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
