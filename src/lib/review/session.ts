import { createId } from "@/lib/id";
import type { RenderedSeed } from "./templates";
import type { ReviewSession } from "./types";

export type SeedPayload = RenderedSeed & {
  templateId: string;
  domainLabel: string;
};

export function makeReviewSession(seed: SeedPayload): ReviewSession {
  const now = Date.now();
  const target =
    seed.files.find((f) => f.role === "target") ??
    seed.files.find((f) => f.role === "reference") ??
    seed.files[0];

  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    templateId: seed.templateId,
    domainLabel: seed.domainLabel,
    task: seed.task,
    files: seed.files,
    originalFiles: seed.files.map((f) => ({ ...f })),
    activePath: target.path,
    openPaths: [target.path],
    scenarios: seed.scenarios,
    traceChain: seed.traceChain,
    messages: [],
    proposals: [],
    verdicts: [],
    lastRun: null,
    report: null,
  };
}
