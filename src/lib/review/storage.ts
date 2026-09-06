import type { ReviewSession } from "./types";

const KEY = "idecoder.review.v1";
const MAX_SESSIONS = 25;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeReviewSessions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReviewSnapshot() {
  if (typeof window === "undefined") return "[]";
  return localStorage.getItem(KEY) ?? "[]";
}

export function getServerReviewSnapshot() {
  return "[]";
}

export function reviewSessionsFromSnapshot(raw: string): ReviewSession[] {
  try {
    const parsed = JSON.parse(raw) as ReviewSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function listReviewSessions(): ReviewSession[] {
  return reviewSessionsFromSnapshot(getReviewSnapshot());
}

export function getReviewSession(id: string): ReviewSession | null {
  return listReviewSessions().find((s) => s.id === id) ?? null;
}

export function saveReviewSession(session: ReviewSession) {
  if (typeof window === "undefined") return;
  const next = listReviewSessions().filter((s) => s.id !== session.id);
  next.unshift({ ...session, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_SESSIONS)));
  emit();
}

export function deleteReviewSession(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    KEY,
    JSON.stringify(listReviewSessions().filter((s) => s.id !== id)),
  );
  emit();
}
