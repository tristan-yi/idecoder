import { loadSettings } from "./settings";
import type { Problem } from "./types";

export async function requestProblem(input: {
  prompt: string;
  mode?: "create" | "similar";
  source?: Problem;
}): Promise<Problem> {
  const settings = loadSettings();
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey
        ? {
            "x-api-key": settings.apiKey,
            "x-provider": settings.provider,
            "x-model": settings.model,
          }
        : {}),
    },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Generation failed");
  }
  return data.problem as Problem;
}
