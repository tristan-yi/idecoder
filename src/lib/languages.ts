import type { LanguageId } from "./types";

/**
 * Everything runs in the browser. The hosted Piston API that used to execute
 * the compiled languages went offline permanently on 2026-08-31, so anything
 * that cannot run client-side has no runner at all.
 */
export type RunnerKind = "browser-js" | "browser-python" | "none";

export const LANGUAGES: {
  id: LanguageId;
  label: string;
  monaco: string;
  runner: RunnerKind;
  supportsTests: boolean;
}[] = [
  {
    id: "javascript",
    label: "JavaScript",
    monaco: "javascript",
    runner: "browser-js",
    supportsTests: true,
  },
  {
    id: "typescript",
    label: "TypeScript",
    monaco: "typescript",
    runner: "browser-js",
    supportsTests: true,
  },
  {
    id: "python",
    label: "Python",
    monaco: "python",
    runner: "browser-python",
    supportsTests: true,
  },
  {
    id: "java",
    label: "Java (editor only)",
    monaco: "java",
    runner: "none",
    supportsTests: false,
  },
  {
    id: "cpp",
    label: "C++ (editor only)",
    monaco: "cpp",
    runner: "none",
    supportsTests: false,
  },
];

export function languageMeta(id: LanguageId) {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

export const NO_RUNNER_MESSAGE =
  "There is no runner for this language. The hosted execution service this app used (Piston) shut down permanently on 2026-08-31, and Java and C++ cannot run in the browser. You can still write and save code here, and JavaScript, TypeScript and Python all run and test locally in your browser.";
