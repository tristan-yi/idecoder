import type { ReviewTask, SeedFile, SimScenario, TraceStep } from "../types";

/**
 * Domain vocabulary layered onto a hand-written codebase skeleton. The LLM only
 * fills these strings, so generated seeds always compile and keep one set of
 * conventions.
 */
export type Skin = {
  domainLabel: string;
  /** camelCase singular, e.g. "task". */
  entity: string;
  /** camelCase plural, e.g. "tasks". */
  entityPlural: string;
  /** PascalCase singular, e.g. "Task". */
  Entity: string;
  /** PascalCase plural, e.g. "Tasks". */
  EntityPlural: string;
  /** camelCase name of the main string field, e.g. "title". */
  labelField: string;
  /** Human wording for that field, e.g. "title". */
  labelHuman: string;
  reporter: string;
  channel: string;
  ticket: string;
  taskTitle: string;
  taskBody: string;
  acceptanceHints: string[];
  openQuestions: string[];
};

export type RenderedSeed = {
  files: SeedFile[];
  scenarios: SimScenario[];
  traceChain: TraceStep[];
  task: ReviewTask;
};

export type SeedTemplate = {
  id: string;
  /** Shown when picking a drill, e.g. "Status toggle that never persists". */
  label: string;
  /** Told to the LLM so the skin fits the broken feature. */
  brokenFeatureBrief: string;
  defaultSkins: Skin[];
  render: (skin: Skin) => RenderedSeed;
};

const IDENT = /[^A-Za-z0-9_]/g;

/** Locals the rendered files already use, plus names that would not compile. */
const RESERVED = new Set([
  "payload",
  "req",
  "res",
  "router",
  "counter",
  "current",
  "draft",
  "error",
  "existing",
  "id",
  "item",
  "next",
  "created",
  "updated",
  "roots",
  "reply",
  "createdAt",
  "deletedAt",
  "parentId",
  "quantity",
  "delta",
  "done",
  "class",
  "const",
  "default",
  "delete",
  "export",
  "function",
  "import",
  "new",
  "return",
  "type",
  "var",
  "void",
]);

function safeIdent(value: string, fallback: string) {
  const cleaned = (value || "").replace(IDENT, "");
  if (!cleaned || /^[0-9]/.test(cleaned)) return fallback;
  if (RESERVED.has(cleaned.toLowerCase())) return fallback;
  return cleaned;
}

function pascal(value: string, fallback: string) {
  const cleaned = safeIdent(value, fallback);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function camel(value: string, fallback: string) {
  const cleaned = safeIdent(value, fallback);
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

/** Guarantees every identifier derived from a skin is a valid TS identifier. */
export function normalizeSkin(input: Partial<Skin>, fallback: Skin): Skin {
  const entity = camel(input.entity ?? fallback.entity, fallback.entity);
  const entityPlural = camel(
    input.entityPlural ?? `${entity}s`,
    fallback.entityPlural,
  );
  return {
    domainLabel: input.domainLabel?.trim() || fallback.domainLabel,
    entity,
    entityPlural,
    Entity: pascal(input.Entity ?? entity, fallback.Entity),
    EntityPlural: pascal(input.EntityPlural ?? entityPlural, fallback.EntityPlural),
    labelField: camel(input.labelField ?? fallback.labelField, fallback.labelField),
    labelHuman: input.labelHuman?.trim() || fallback.labelHuman,
    reporter: input.reporter?.trim() || fallback.reporter,
    channel: input.channel?.trim() || fallback.channel,
    ticket: safeIdent(input.ticket ?? fallback.ticket, fallback.ticket).toUpperCase(),
    taskTitle: input.taskTitle?.trim() || fallback.taskTitle,
    taskBody: input.taskBody?.trim() || fallback.taskBody,
    acceptanceHints:
      Array.isArray(input.acceptanceHints) && input.acceptanceHints.length
        ? input.acceptanceHints.map(String)
        : fallback.acceptanceHints,
    openQuestions:
      Array.isArray(input.openQuestions) && input.openQuestions.length
        ? input.openQuestions.map(String)
        : fallback.openQuestions,
  };
}
