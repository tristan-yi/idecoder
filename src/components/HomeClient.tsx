"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  GitPullRequestArrow,
  Loader2,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { SettingsModal } from "./SettingsModal";
import { UserMenu } from "./UserMenu";
import { requestProblem } from "@/lib/api";
import type { AppUser } from "@/lib/auth/types";
import { LIVE_PAD_PROBLEM } from "@/lib/live-pad";
import { SAMPLE_PROBLEMS, SAMPLE_PROMPTS } from "@/lib/samples";
import { loadSettings } from "@/lib/settings";
import { makeSession } from "@/lib/session";
import { deleteRemotePad, fetchMyPads, type PadListItem } from "@/lib/pads-remote";
import { deleteSession, saveSession } from "@/lib/storage";

const STEPS = [
  "Reading your prompt…",
  "Drafting examples…",
  "Writing starter code…",
  "Building hidden tests…",
];

export function HomeClient({
  user,
  admin,
}: {
  user: AppUser;
  admin?: boolean;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverConfigured, setServerConfigured] = useState(false);
  const [pads, setPads] = useState<PadListItem[]>([]);

  useEffect(() => {
    fetch("/api/generate")
      .then((r) => r.json())
      .then((d) => setServerConfigured(Boolean(d.configured)))
      .catch(() => setServerConfigured(false));
    void fetchMyPads().then(setPads);
  }, []);

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1800);
    return () => clearInterval(timer);
  }, [generating]);

  function openPad(session: ReturnType<typeof makeSession>) {
    saveSession(session);
    queueMicrotask(() => router.push(`/pad/${session.id}`));
  }

  function openSample(id: string) {
    const problem = SAMPLE_PROBLEMS[id];
    const sample = SAMPLE_PROMPTS.find((p) => p.id === id);
    if (!problem) return;
    openPad(makeSession(sample?.prompt ?? problem.title, problem));
  }

  async function generate() {
    const text = prompt.trim();
    if (!text || generating) return;

    const settings = loadSettings();
    if (!settings.apiKey && !serverConfigured) {
      setSettingsOpen(true);
      setError("Add an API key to generate a pad from a custom question.");
      return;
    }

    setGenerating(true);
    setError("");
    setStep(0);
    try {
      const problem = await requestProblem({ prompt: text, mode: "create" });
      openPad(makeSession(text, problem));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-dvh bg-ink text-zinc-100">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint font-mono text-sm font-bold text-ink">
            id
          </span>
          <span className="text-sm font-semibold tracking-wide">idecoder</span>
        </div>
        <div className="flex items-center gap-1">
          {admin ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-mute hover:bg-white/5 hover:text-white"
            >
              <Activity size={16} />
              Insights
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-mute hover:bg-white/5 hover:text-white"
          >
            <Settings size={16} />
            Settings
          </button>
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">
          <Sparkles size={12} className="text-mint" />
          Always-on practice pad
        </p>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Paste a question. Get a live coding pad.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-mute">
          Drop in an interview prompt or a rough idea. idecoder turns it into a
          LeetCode-style problem on the left and a CoderPad editor on the right.
          Pads live on your account. Share the URL when you want someone else to
          join — they sign in as themselves.
        </p>

        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Implement LRU Cache with O(1) get and put. Or paste a full interview question…"
            rows={8}
            className="w-full resize-y rounded-xl border border-line bg-panel px-4 py-3 text-[15px] leading-7 outline-none placeholder:text-zinc-600 focus:border-mint/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-40"
            >
              {generating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {generating ? STEPS[step] : "Create pad"}
            </button>
            <button
              type="button"
              onClick={() => openPad(makeSession("Live pair pad", LIVE_PAD_PROBLEM))}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium hover:border-mint/40"
            >
              <Users size={16} className="text-mint" />
              Start a live pad
            </button>
            <span className="text-xs text-mute">
              Your pads stay on this account. Share a link only when you want a pair.
            </span>
          </div>
        </form>

        {error && (
          <p className="mt-3 rounded-lg border border-hard/30 bg-hard/10 px-3 py-2 text-sm text-hard">
            {error}
          </p>
        )}

        <Link
          href="/review"
          className="mt-8 flex items-start gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 hover:border-mint/40"
        >
          <GitPullRequestArrow size={18} className="mt-0.5 shrink-0 text-mint" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              AI-assisted review practice
            </span>
            <span className="mt-0.5 block text-[13px] leading-5 text-mute">
              A different drill: an unfamiliar full-stack codebase, a vague bug
              report, and an AI assistant that is confidently wrong some of the
              time. Scored on what you catch.
            </span>
          </span>
        </Link>

        <div className="mt-6 flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => openSample(sample.id)}
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-zinc-300 hover:border-mint/40 hover:text-white"
            >
              Try {sample.label}
            </button>
          ))}
        </div>

        {pads.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 text-sm font-medium text-mute">Your pads</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
              {pads.map(({ session, owner }) => (
                <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/pad/${session.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-medium">
                      {session.problem.title}
                    </div>
                    <div className="text-xs text-mute">
                      {session.problem.difficulty}
                      {owner ? "" : " · joined"} ·{" "}
                      {new Date(session.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  {owner ? (
                    <button
                      type="button"
                      onClick={() => {
                        void deleteRemotePad(session.id).then((ok) => {
                          if (!ok) return;
                          deleteSession(session.id);
                          setPads((current) =>
                            current.filter((item) => item.session.id !== session.id),
                          );
                        });
                      }}
                      className="rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-hard"
                      aria-label={`Delete ${session.problem.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={() => setError("")}
      />
    </div>
  );
}
