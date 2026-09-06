import type { Session } from "./types";

const KEY = "idecoder.sessions.v1";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeSessions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionsSnapshot() {
  if (typeof window === "undefined") return "[]";
  return localStorage.getItem(KEY) ?? "[]";
}

export function getServerSessionsSnapshot() {
  return "[]";
}

function parseSessions(raw: string): Session[] {
  try {
    const parsed = JSON.parse(raw) as Session[];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function listSessions(): Session[] {
  return parseSessions(getSessionsSnapshot());
}

export function sessionsFromSnapshot(raw: string): Session[] {
  return parseSessions(raw);
}

export function getSession(id: string): Session | null {
  return listSessions().find((s) => s.id === id) ?? null;
}

export function saveSession(session: Session) {
  if (typeof window === "undefined") return;
  const next = listSessions().filter((s) => s.id !== session.id);
  next.unshift({ ...session, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(next.slice(0, 50)));
  emit();
}

export function deleteSession(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    KEY,
    JSON.stringify(listSessions().filter((s) => s.id !== id)),
  );
  emit();
}

