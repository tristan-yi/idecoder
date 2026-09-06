import type { PlantedIssue } from "./types";

/**
 * Keeps the planted issue out of plain sight in the network tab and in
 * localStorage. Anyone who wants to decode it can, which is fine: the point is
 * to stop an accidental glance from spoiling the exercise.
 */
export function encodePlanted(issue: PlantedIssue): string {
  const json = JSON.stringify(issue);
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, "utf8").toString("base64");
}

export function decodePlanted(value: string | null): PlantedIssue | null {
  if (!value) return null;
  try {
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(value)))
        : Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(json) as PlantedIssue;
  } catch {
    return null;
  }
}
