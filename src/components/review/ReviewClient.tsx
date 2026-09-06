"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, Loader2, Play, RotateCcw, Settings } from "lucide-react";
import { AgentPanel } from "./AgentPanel";
import { ReportModal } from "./ReportModal";
import { ScenarioConsole } from "./ScenarioConsole";
import { TaskPanel } from "./TaskPanel";
import { WorkspaceEditor } from "./WorkspaceEditor";
import { SettingsModal } from "@/components/SettingsModal";
import { Split } from "@/components/Split";
import { createId } from "@/lib/id";
import { requestAgent, requestGrade } from "@/lib/review/api";
import { explanationMatches } from "@/lib/review/mutations";
import { localReport, scenarioProgress, tally } from "@/lib/review/scoring";
import { runScenarios } from "@/lib/review/simulator";
import {
  getReviewSession,
  getReviewSnapshot,
  getServerReviewSnapshot,
  reviewSessionsFromSnapshot,
  saveReviewSession,
  subscribeReviewSessions,
} from "@/lib/review/storage";
import type {
  ExplanationGrade,
  PlantedCategory,
  ProposalEdit,
  ReviewDecision,
  ReviewSession,
  SeedFile,
} from "@/lib/review/types";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const WIDE = "(min-width: 1280px)";

/**
 * Picks the layout in JS rather than with CSS branches. Rendering both trees
 * would mount a second Monaco instance, and its initial onChange would write
 * through a stale closure and clobber whatever else had just been saved.
 */
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

function applyEdits(files: SeedFile[], edits: ProposalEdit[]): SeedFile[] {
  const next = files.map((file) => {
    const edit = edits.find((e) => e.path === file.path);
    return edit ? { ...file, contents: edit.after } : file;
  });
  for (const edit of edits) {
    if (!next.some((f) => f.path === edit.path)) {
      next.push({ path: edit.path, contents: edit.after, role: "target" });
    }
  }
  return next;
}

export function ReviewClient({ id }: { id: string }) {
  const hydrated = useHydrated();
  const wide = useWideLayout();
  const raw = useSyncExternalStore(
    subscribeReviewSessions,
    getReviewSnapshot,
    getServerReviewSnapshot,
  );
  const session = useMemo(
    () => reviewSessionsFromSnapshot(raw).find((item) => item.id === id) ?? null,
    [raw, id],
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"task" | "code" | "chat">("code");

  // The live tally uses a keyword heuristic. Once the session has been graded
  // the report is the only number worth showing, or the header and the report
  // end up disagreeing about the same session.
  const counts = useMemo(() => {
    const local = tally(session?.proposals ?? [], session?.verdicts ?? []);
    const report = session?.report;
    if (!report) return local;
    return {
      ...local,
      plantedTotal: report.plantedTotal,
      caught: report.caught,
      missed: report.missed,
      falseAlarms: report.falseAlarms,
    };
  }, [session?.proposals, session?.verdicts, session?.report]);

  const pendingProposal = useMemo(() => {
    if (!session) return null;
    return (
      session.proposals.find(
        (proposal) => !session.verdicts.some((v) => v.proposalId === proposal.id),
      ) ?? null
    );
  }, [session]);

  if (!hydrated) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-mute">
        Loading session…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-medium">Session not found</p>
        <p className="max-w-sm text-sm text-mute">
          Review sessions live in this browser. If you cleared site data, this
          one is gone.
        </p>
        <Link href="/review" className="text-sm text-mint hover:underline">
          Start a new one
        </Link>
      </div>
    );
  }

  const current = session;
  const progress = scenarioProgress(current);

  /**
   * Always merges into the freshest stored copy. Several handlers here run
   * after an await, and a couple fire from Monaco callbacks, so merging into
   * the session captured at render time silently drops concurrent writes.
   */
  function update(fn: (prev: ReviewSession) => ReviewSession) {
    saveReviewSession(fn(getReviewSession(current.id) ?? current));
  }

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const outcome = await runScenarios(current.files, current.scenarios);
      update((prev) => ({ ...prev, lastRun: outcome }));
    } finally {
      setRunning(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || pendingProposal) return;

    setSending(true);
    setChatError("");
    const userMessage = {
      id: createId(),
      role: "user" as const,
      content: text,
      createdAt: Date.now(),
    };
    update((prev) => ({ ...prev, messages: [...prev.messages, userMessage] }));
    setDraft("");

    try {
      const reply = await requestAgent({
        task: current.task,
        files: current.files,
        history: current.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        message: text,
        avoidCategories: current.proposals
          .map((p) => p.planted?.category)
          .filter((c): c is PlantedCategory => Boolean(c)),
      });

      const assistantMessage = {
        id: createId(),
        role: "assistant" as const,
        content: reply.message,
        createdAt: Date.now(),
        ...(reply.kind === "proposal" ? { proposalId: reply.proposal.id } : {}),
      };

      update((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        proposals:
          reply.kind === "proposal"
            ? [...prev.proposals, reply.proposal]
            : prev.proposals,
      }));
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "The assistant failed");
    } finally {
      setSending(false);
    }
  }

  function submitVerdict(
    proposalId: string,
    decision: ReviewDecision,
    explanation: string,
  ) {
    const proposal = current.proposals.find((p) => p.id === proposalId);
    if (!proposal) return;

    const applied = decision !== "reject";
    const touched = proposal.edits[0]?.path;
    const verdict = {
      proposalId,
      decision,
      explanation,
      hadPlanted: Boolean(proposal.planted),
      caughtHeuristic: proposal.planted
        ? explanationMatches(proposal.planted, explanation)
        : false,
      applied,
      createdAt: Date.now(),
    };

    update((prev) => ({
      ...prev,
      files: applied ? applyEdits(prev.files, proposal.edits) : prev.files,
      activePath: applied && touched ? touched : prev.activePath,
      openPaths:
        applied && touched && !prev.openPaths.includes(touched)
          ? [...prev.openPaths, touched]
          : prev.openPaths,
      verdicts: [...prev.verdicts, verdict],
    }));
  }

  async function finish() {
    if (finishing || current.verdicts.length === 0) return;
    setFinishing(true);

    const base = localReport(current);
    try {
      const graded = await requestGrade({
        task: current.task,
        items: current.verdicts.map((verdict) => {
          const proposal = current.proposals.find(
            (p) => p.id === verdict.proposalId,
          );
          return {
            summary: proposal?.summary ?? "",
            plantedLabel: proposal?.planted?.label ?? null,
            plantedExplanation: proposal?.planted?.explanation ?? null,
            decision: verdict.decision,
            explanation: verdict.explanation,
          };
        }),
      });

      const grades: ExplanationGrade[] = graded.items.map((item, position) => {
        const verdict = current.verdicts[item.index] ?? current.verdicts[position];
        return {
          proposalId: verdict?.proposalId ?? "",
          caught: item.caught,
          clarity: item.clarity,
          referencedConvention: item.referencedConvention,
          checkedEdgeCases: item.checkedEdgeCases,
          note: item.note,
        };
      });

      let plantedTotal = 0;
      let caught = 0;
      let falseAlarms = 0;
      for (const grade of grades) {
        const verdict = current.verdicts.find(
          (v) => v.proposalId === grade.proposalId,
        );
        if (!verdict) continue;
        if (verdict.hadPlanted) {
          plantedTotal += 1;
          if (grade.caught) caught += 1;
        } else if (!grade.caught) {
          falseAlarms += 1;
        }
      }

      update((prev) => ({
        ...prev,
        report: {
          ...base,
          grades,
          plantedTotal,
          caught,
          missed: plantedTotal - caught,
          falseAlarms,
          summary: graded.summary || base.summary,
          strengths: graded.strengths.length ? graded.strengths : base.strengths,
          improvements: graded.improvements.length
            ? graded.improvements
            : base.improvements,
        },
      }));
    } catch {
      // Grading is a nicety. The tallies are computed locally either way.
      update((prev) => ({ ...prev, report: base }));
    } finally {
      setFinishing(false);
      setReportOpen(true);
    }
  }

  const taskPane = (
    <TaskPanel
      session={current}
      counts={counts}
      scenariosPassing={progress.passing}
      scenariosTotal={progress.total}
      onFinish={() => void finish()}
      finishing={finishing}
    />
  );

  const codePane = (
    <Split axis="vertical" initial={68}>
      <WorkspaceEditor
        files={current.files}
        originals={current.originalFiles}
        activePath={current.activePath}
        openPaths={current.openPaths}
        onOpen={(path) =>
          update((prev) => ({
            ...prev,
            activePath: path,
            openPaths: prev.openPaths.includes(path)
              ? prev.openPaths
              : [...prev.openPaths, path],
          }))
        }
        onClose={(path) =>
          update((prev) => {
            const openPaths = prev.openPaths.filter((p) => p !== path);
            return {
              ...prev,
              openPaths,
              activePath:
                prev.activePath === path
                  ? (openPaths[openPaths.length - 1] ?? prev.files[0].path)
                  : prev.activePath,
            };
          })
        }
        onChange={(path, contents) =>
          update((prev) =>
            prev.files.some((f) => f.path === path && f.contents === contents)
              ? prev
              : {
                  ...prev,
                  files: prev.files.map((file) =>
                    file.path === path ? { ...file, contents } : file,
                  ),
                },
          )
        }
      />
      <ScenarioConsole scenarios={current.scenarios} outcome={current.lastRun} />
    </Split>
  );

  const chatPane = (
    <AgentPanel
      messages={current.messages}
      proposals={current.proposals}
      verdicts={current.verdicts}
      grades={current.report?.grades ?? []}
      draft={draft}
      onDraftChange={setDraft}
      onSend={() => void send()}
      onVerdict={submitVerdict}
      sending={sending}
      blocked={Boolean(pendingProposal)}
      error={chatError}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-ink text-zinc-100">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3">
        <Link
          href="/review"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-mute hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft size={16} />
          Reviews
        </Link>
        <div className="hidden min-w-0 flex-1 truncate text-sm font-medium sm:block">
          {current.task.title}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-mute md:inline">
            {counts.caught}/{counts.plantedTotal} caught
          </span>
          <button
            type="button"
            onClick={() =>
              update((prev) => ({
                ...prev,
                files: prev.originalFiles.map((f) => ({ ...f })),
              }))
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
            title="Restore every file to how it started"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md bg-mint px-3 py-1.5 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-50"
          >
            {running ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Run scenarios
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-mute hover:bg-white/5 hover:text-white"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {!wide && (
      <div className="flex gap-1 border-b border-line bg-panel px-3 py-1">
        {(["task", "code", "chat"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`rounded-md px-3 py-1 text-sm capitalize ${
              mobileTab === tab ? "bg-white/10" : "text-mute"
            }`}
          >
            {tab}
            {tab === "chat" && pendingProposal && (
              <span className="ml-1 text-medium">●</span>
            )}
          </button>
        ))}
      </div>
      )}

      <main className="min-h-0 flex-1">
        {wide ? (
          <Split axis="horizontal" initial={26}>
            {taskPane}
            <Split axis="horizontal" initial={62}>
              {codePane}
              {chatPane}
            </Split>
          </Split>
        ) : mobileTab === "task" ? (
          taskPane
        ) : mobileTab === "code" ? (
          codePane
        ) : (
          chatPane
        )}
      </main>

      {reportOpen && (
        <ReportModal report={current.report} onClose={() => setReportOpen(false)} />
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
