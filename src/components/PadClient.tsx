"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckSquare, ChevronLeft, Loader2, Play, Settings, Sparkles } from "lucide-react";
import { CodePane } from "./CodePane";
import { ConsolePane } from "./ConsolePane";
import { NotesPane } from "./NotesPane";
import { PresenceBar } from "./PresenceBar";
import { ProblemPanel } from "./ProblemPanel";
import { SettingsModal } from "./SettingsModal";
import { Split } from "./Split";
import { UserMenu } from "./UserMenu";
import { codeKey, META_KEY, NOTES_KEY } from "@/lib/collab/fields";
import { useCollab } from "@/lib/collab/use-collab";
import { executeCode } from "@/lib/execute";
import { LANGUAGES, NO_RUNNER_MESSAGE, languageMeta } from "@/lib/languages";
import { warmPython, type PythonStage } from "@/lib/python";
import { requestProblem } from "@/lib/api";
import type { AppUser } from "@/lib/auth/types";
import { fetchPadWithRetry, publishPad } from "@/lib/pads-remote";
import { makeSession } from "@/lib/session";
import {
  getServerSessionsSnapshot,
  getSessionsSnapshot,
  saveSession,
  sessionsFromSnapshot,
  subscribeSessions,
} from "@/lib/storage";
import type { LanguageId, RunOutcome, Session, TestCase } from "@/lib/types";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const WIDE = "(min-width: 640px)";

function useWideLayout() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export function PadClient({ id, user }: { id: string; user: AppUser }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const wide = useWideLayout();
  const rawSessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    getServerSessionsSnapshot,
  );
  const localSession = useMemo(
    () => sessionsFromSnapshot(rawSessions).find((item) => item.id === id) ?? null,
    [rawSessions, id],
  );
  const session = localSession;
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  });

  const [looked, setLooked] = useState(false);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [http, setHttp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState<"run" | "tests" | "submit" | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [consoleMode, setConsoleMode] = useState<"run" | "tests">("tests");
  const [activeTests, setActiveTests] = useState<TestCase[]>([]);
  const [mobileTab, setMobileTab] = useState<"problem" | "notes" | "code">("code");
  const [leftTab, setLeftTab] = useState<"problem" | "notes">("problem");
  const [similarLoading, setSimilarLoading] = useState(false);
  const [banner, setBanner] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareHint, setShareHint] = useState("");
  const [pyStage, setPyStage] = useState<PythonStage | null>(null);
  const showPyStage = (stage: PythonStage) =>
    setPyStage(stage === "downloading" || stage === "starting" ? stage : null);
  const runRef = useRef<(kind: "run" | "tests" | "submit") => Promise<void>>(
    async () => {},
  );

  const collab = useCollab(
    readyId === id && session ? id : null,
    session,
    http,
    user,
  );
  const { doc, awareness, status, peers, synced, setName } = collab;

  function persist(next: Session) {
    saveSession(next);
  }

  const language = session?.language ?? "javascript";
  const liveCode =
    doc && synced ? doc.getText(codeKey(language)).toString() : null;
  const code = liveCode ?? session?.codeByLanguage[language] ?? "";
  const shownTests =
    activeTests.length > 0 ? activeTests : (session?.problem.exampleTests ?? []);

  async function run(kind: "run" | "tests" | "submit") {
    if (!session || running) return;
    const meta = languageMeta(session.language);
    if (meta.runner === "none") {
      setConsoleMode(kind === "run" ? "run" : "tests");
      setOutcome({
        ok: false,
        stdout: "",
        stderr: NO_RUNNER_MESSAGE,
        results: null,
      });
      return;
    }

    setRunning(kind);
    setConsoleMode(kind === "run" ? "run" : "tests");
    setPyStage(null);
    try {
      const tests =
        kind === "run"
          ? null
          : kind === "submit"
            ? [...session.problem.exampleTests, ...session.problem.hiddenTests]
            : session.problem.exampleTests;
      setActiveTests(tests ?? session.problem.exampleTests);
      const source =
        doc?.getText(codeKey(session.language)).toString() ||
        session.codeByLanguage[session.language] ||
        "";
      const result = await executeCode({
        language: session.language,
        code: source,
        functionName: session.problem.functionName,
        tests,
        onProgress: showPyStage,
      });
      setOutcome(result);
    } finally {
      setRunning(null);
      setPyStage(null);
    }
  }

  async function generateSimilar() {
    if (!session || similarLoading) return;
    setSimilarLoading(true);
    setBanner("");
    try {
      const problem = await requestProblem({
        prompt: `similar to ${session.problem.title}`,
        mode: "similar",
        source: session.problem,
      });
      const next = makeSession(
        `Similar to ${session.problem.title}`,
        problem,
        session.language,
      );
      saveSession(next);
      queueMicrotask(() => router.push(`/pad/${next.id}`));
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Could not generate a similar question");
      setSimilarLoading(false);
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setShareHint(
        status === "live"
          ? "Anyone signed in with this link can join live."
          : "Copied. Another tab on this computer will sync; live sharing across devices needs the server database.",
      );
      window.setTimeout(() => setCopied(false), 1600);
      window.setTimeout(() => setShareHint(""), 3200);
    } catch {
      setCopied(false);
      setShareHint(`Copy this link: ${url}`);
    }
  }

  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runRef.current("tests");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (language === "python") warmPython(showPyStage);
  }, [language]);

  useEffect(() => {
    if (!hydrated || localSession) return;
    let cancelled = false;
    void fetchPadWithRetry(id)
      .then((found) => {
        if (cancelled) return;
        if (found) saveSession({ ...found, id });
        setLooked(true);
      })
      .catch(() => {
        if (!cancelled) setLooked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, id, localSession]);

  useEffect(() => {
    const current = sessionRef.current;
    if (!current) return;
    let cancelled = false;
    void publishPad(current).then((result) => {
      if (cancelled) return;
      setHttp(result === "ok");
      setReadyId(current.id);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.id]);

  useEffect(() => {
    if (!doc) return;
    let timer: ReturnType<typeof setTimeout>;
    const persistFromDoc = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const current = sessionRef.current;
        if (!current) return;
        const nextLanguage =
          (doc.getMap(META_KEY).get("language") as LanguageId | undefined) ||
          current.language;
        const codeByLanguage = { ...current.codeByLanguage };
        for (const lang of LANGUAGES) {
          const value = doc.getText(codeKey(lang.id)).toString();
          if (value) codeByLanguage[lang.id] = value;
        }
        saveSession({
          ...current,
          language: nextLanguage,
          codeByLanguage,
          notes: doc.getText(NOTES_KEY).toString(),
        });
      }, 400);
    };
    doc.on("update", persistFromDoc);
    return () => {
      clearTimeout(timer);
      doc.off("update", persistFromDoc);
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    const meta = doc.getMap(META_KEY);
    const apply = () => {
      const next = meta.get("language") as LanguageId | undefined;
      const current = sessionRef.current;
      if (!next || !current || next === current.language) return;
      persist({
        ...current,
        language: next,
        codeByLanguage: {
          ...current.codeByLanguage,
          [next]:
            current.codeByLanguage[next] ??
            current.problem.starterCode[next] ??
            "",
        },
      });
    };
    meta.observe(apply);
    apply();
    return () => meta.unobserve(apply);
  }, [doc]);

  if (!hydrated || (!session && !looked)) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-mute">
        {hydrated ? "Joining pad…" : "Loading pad…"}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-medium">Pad not found</p>
        <p className="max-w-sm text-sm text-mute">
          This pad is not in this browser and was not found on the server. Ask
          your pair for a fresh share link.
        </p>
        <Link href="/" className="text-sm text-mint hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  const problemPane = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-line bg-panel px-3 py-1">
        <button
          type="button"
          onClick={() => setLeftTab("problem")}
          className={`rounded-md px-3 py-1 text-sm ${leftTab === "problem" ? "bg-white/10" : "text-mute"}`}
        >
          Problem
        </button>
        <button
          type="button"
          onClick={() => setLeftTab("notes")}
          className={`rounded-md px-3 py-1 text-sm ${leftTab === "notes" ? "bg-white/10" : "text-mute"}`}
        >
          Notes
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {leftTab === "problem" ? (
          <ProblemPanel
            problem={session.problem}
            onSimilar={() => void generateSimilar()}
            similarLoading={similarLoading}
          />
        ) : (
          <NotesPane
            ytext={doc && synced ? doc.getText(NOTES_KEY) : null}
            value={session.notes ?? ""}
            onChange={(notes) => persist({ ...session, notes })}
          />
        )}
      </div>
    </div>
  );

  const editorPane = (
    <Split axis="vertical" initial={68}>
      {synced ? (
        <CodePane
          language={language}
          code={code}
          ytext={doc?.getText(codeKey(language)) ?? null}
          awareness={awareness}
          onChange={(value) => {
            if (value === code) return;
            persist({
              ...session,
              codeByLanguage: {
                ...session.codeByLanguage,
                [language]: value,
              },
            });
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-mute">
          Connecting live editor…
        </div>
      )}
      <ConsolePane
        examples={session.problem.examples}
        tests={shownTests}
        outcome={outcome}
        mode={consoleMode}
      />
    </Split>
  );

  const notesPane = (
    <NotesPane
      ytext={doc && synced ? doc.getText(NOTES_KEY) : null}
      value={session.notes ?? ""}
      onChange={(notes) => persist({ ...session, notes })}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-ink text-zinc-100">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-mute hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft size={16} />
          Pads
        </Link>
        <div className="hidden min-w-0 flex-1 truncate text-sm font-medium sm:block">
          {session.problem.title}
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <PresenceBar
            peers={peers}
            status={readyId === id ? status : "connecting"}
            copied={copied}
            onShare={() => void share()}
            onNameChange={setName}
          />
          <button
            type="button"
            onClick={() => void generateSimilar()}
            disabled={similarLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            {similarLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} className="text-mint" />
            )}
            <span className="hidden md:inline">Similar</span>
          </button>
          <select
            value={language}
            onChange={(e) => {
              const next = e.target.value as LanguageId;
              const existing = session.codeByLanguage[next];
              if (next === "python") warmPython(showPyStage);
              doc?.getMap(META_KEY).set("language", next);
              persist({
                ...session,
                language: next,
                codeByLanguage: {
                  ...session.codeByLanguage,
                  [next]:
                    existing ??
                    session.problem.starterCode[next] ??
                    session.codeByLanguage[session.language] ??
                    "",
                },
              });
            }}
            className="rounded-md border border-line bg-ink px-2 py-1.5 text-sm outline-none"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
          {pyStage && (
            <span
              className="inline-flex items-center gap-1.5 text-[12.5px] text-mute"
              role="status"
            >
              <Loader2 size={13} className="animate-spin" />
              {pyStage === "downloading"
                ? "Downloading Python (one time)"
                : "Starting Python"}
            </span>
          )}
          <button
            type="button"
            onClick={() => void run("run")}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            {running === "run" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Run
          </button>
          <button
            type="button"
            onClick={() => void run("tests")}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-1.5 rounded-md bg-mint px-3 py-1.5 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-50"
          >
            {running === "tests" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Test
          </button>
          <button
            type="button"
            onClick={() => void run("submit")}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-zinc-200 disabled:opacity-50"
          >
            {running === "submit" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckSquare size={14} />
            )}
            Submit
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-white"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
          <UserMenu user={user} />
        </div>
      </header>

      {(banner || shareHint) && (
        <div
          className={`border-b px-4 py-2 text-sm ${
            banner
              ? "border-hard/30 bg-hard/10 text-hard"
              : "border-mint/20 bg-mint/10 text-mint"
          }`}
        >
          {banner || shareHint}
        </div>
      )}

      <div className="flex gap-1 border-b border-line bg-panel px-3 py-1 sm:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("problem")}
          className={`rounded-md px-3 py-1 text-sm ${mobileTab === "problem" ? "bg-white/10" : "text-mute"}`}
        >
          Problem
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("notes")}
          className={`rounded-md px-3 py-1 text-sm ${mobileTab === "notes" ? "bg-white/10" : "text-mute"}`}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("code")}
          className={`rounded-md px-3 py-1 text-sm ${mobileTab === "code" ? "bg-white/10" : "text-mute"}`}
        >
          Code
        </button>
      </div>

      <main className="min-h-0 flex-1">
        {wide ? (
          <Split axis="horizontal" initial={40}>
            {problemPane}
            {editorPane}
          </Split>
        ) : mobileTab === "problem" ? (
          <ProblemPanel
            problem={session.problem}
            onSimilar={() => void generateSimilar()}
            similarLoading={similarLoading}
          />
        ) : mobileTab === "notes" ? (
          notesPane
        ) : (
          editorPane
        )}
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
