import { createId } from "./id";
import type { LanguageId, Problem, Session } from "./types";

export function makeSession(
  prompt: string,
  problem: Problem,
  language: LanguageId = "javascript",
): Session {
  const now = Date.now();
  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    prompt,
    problem,
    language,
    codeByLanguage: {
      [language]: problem.starterCode[language] ?? "",
    },
  };
}
