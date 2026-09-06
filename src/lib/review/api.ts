import { loadSettings } from "@/lib/settings";
import { decodePlanted } from "./secret";
import type { SeedPayload } from "./session";
import type {
  AgentProposal,
  ExplanationGrade,
  PlantedCategory,
  PlantedIssue,
  ReviewTask,
  SeedFile,
} from "./types";

function headers() {
  const settings = loadSettings();
  return {
    "Content-Type": "application/json",
    ...(settings.apiKey
      ? {
          "x-api-key": settings.apiKey,
          "x-provider": settings.provider,
          "x-model": settings.model,
        }
      : {}),
  };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export async function requestSeed(templateId?: string): Promise<SeedPayload> {
  const data = await post<{ seed: SeedPayload }>("/api/review/seed", { templateId });
  return data.seed;
}

export type AgentReply =
  | { kind: "answer"; message: string }
  | { kind: "proposal"; message: string; proposal: AgentProposal };

export async function requestAgent(input: {
  task: ReviewTask;
  files: SeedFile[];
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  avoidCategories: PlantedCategory[];
}): Promise<AgentReply> {
  const data = await post<{
    kind: "answer" | "proposal";
    message: string;
    proposal?: Omit<AgentProposal, "planted">;
    planted?: string | null;
  }>("/api/review/agent", input);

  if (data.kind !== "proposal" || !data.proposal) {
    return { kind: "answer", message: data.message };
  }

  return {
    kind: "proposal",
    message: data.message,
    proposal: {
      ...data.proposal,
      planted: decodePlanted(data.planted ?? null),
    },
  };
}

export type GradeResponse = {
  items: (ExplanationGrade & { index: number })[];
  summary: string;
  strengths: string[];
  improvements: string[];
};

export function requestGrade(input: {
  task: ReviewTask;
  items: {
    summary: string;
    plantedLabel: string | null;
    plantedExplanation: string | null;
    decision: string;
    explanation: string;
  }[];
}): Promise<GradeResponse> {
  return post<GradeResponse>("/api/review/grade", input);
}

export type { PlantedIssue };
