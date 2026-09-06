export type FileRole = "reference" | "target" | "context";

export type SeedFile = {
  path: string;
  contents: string;
  role: FileRole;
  /** One-line hint shown in the file tree, e.g. "working create flow". */
  note?: string;
};

export type TraceStep = {
  file: string;
  symbol: string;
  note: string;
};

/** A feature request or bug report, written the way a PM or engineer would. */
export type ReviewTask = {
  title: string;
  reporter: string;
  channel: string;
  body: string;
  /** Loose, deliberately incomplete acceptance notes. */
  acceptanceHints: string[];
  /** Ambiguities a strong candidate should surface. Hidden until revealed. */
  openQuestions: string[];
};

export type SimScenario = {
  id: string;
  name: string;
  /** Async function body run with { api, store, hook, expect, reset }. */
  code: string;
};

export type SimAssertion = {
  name: string;
  pass: boolean;
  detail: string;
};

export type SimScenarioResult = {
  id: string;
  name: string;
  pass: boolean;
  assertions: SimAssertion[];
  error: string | null;
};

export type SimOutcome = {
  ok: boolean;
  scenarios: SimScenarioResult[];
  logs: string[];
  compileError: string | null;
  ranAt: number;
};

export type PlantedCategory =
  | "param-source-mismatch"
  | "missing-edge-case"
  | "convention-violation"
  | "react-stale-state";

export type PlantedIssue = {
  category: PlantedCategory;
  /** Short label revealed after the review verdict. */
  label: string;
  explanation: string;
  file: string;
  line: number;
  before: string;
  after: string;
  /** Used for the instant local check on the written explanation. */
  keywords: string[][];
};

export type ProposalEdit = {
  path: string;
  before: string;
  after: string;
};

export type AgentProposal = {
  id: string;
  summary: string;
  edits: ProposalEdit[];
  planted: PlantedIssue | null;
  createdAt: number;
};

export type ReviewDecision = "accept" | "reject" | "modify";

export type ReviewVerdict = {
  proposalId: string;
  decision: ReviewDecision;
  explanation: string;
  hadPlanted: boolean;
  /** Instant keyword-based guess. The end-of-session grade is authoritative. */
  caughtHeuristic: boolean;
  applied: boolean;
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposalId?: string;
  createdAt: number;
};

export type ExplanationGrade = {
  proposalId: string;
  caught: boolean;
  clarity: number;
  referencedConvention: boolean;
  checkedEdgeCases: boolean;
  note: string;
};

export type SessionReport = {
  generatedAt: number;
  plantedTotal: number;
  caught: number;
  missed: number;
  /** Clean suggestions rejected or modified for a reason that was not a real defect. */
  falseAlarms: number;
  reviewedTotal: number;
  grades: ExplanationGrade[];
  summary: string;
  strengths: string[];
  improvements: string[];
};

export type ReviewSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  templateId: string;
  domainLabel: string;
  task: ReviewTask;
  files: SeedFile[];
  originalFiles: SeedFile[];
  activePath: string;
  openPaths: string[];
  scenarios: SimScenario[];
  traceChain: TraceStep[];
  messages: ChatMessage[];
  proposals: AgentProposal[];
  verdicts: ReviewVerdict[];
  lastRun: SimOutcome | null;
  report: SessionReport | null;
};

export function fileLanguage(path: string) {
  if (path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  return "plaintext";
}

export function findFile(files: SeedFile[], path: string) {
  return files.find((f) => f.path === path) ?? null;
}
