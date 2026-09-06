import type { Session } from "@/lib/types";

export type PadListItem = {
  session: Session;
  owner: boolean;
};

export async function fetchMyPads(): Promise<PadListItem[]> {
  const res = await fetch("/api/pads");
  if (res.status === 401) {
    window.location.assign("/login");
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { pads?: PadListItem[] };
  return data.pads ?? [];
}

export async function fetchPad(id: string): Promise<Session | null> {
  const res = await fetch(`/api/pads/${id}`);
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.assign(`/login?next=${encodeURIComponent(`/pad/${id}`)}`);
    }
    throw new Error("auth");
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) throw new Error("Could not load pad");
  const data = (await res.json()) as { session?: Session };
  return data.session ?? null;
}

export async function fetchPadWithRetry(id: string): Promise<Session | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const session = await fetchPad(id);
      if (session) return session;
    } catch (err) {
      if (err instanceof Error && err.message === "auth") return null;
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return null;
}

export async function publishPad(
  session: Session,
): Promise<"ok" | "disabled" | "error"> {
  try {
    const res = await fetch(`/api/pads/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    if (res.status === 503) return "disabled";
    if (!res.ok) return "error";
    return "ok";
  } catch {
    return "error";
  }
}

export async function deleteRemotePad(id: string): Promise<boolean> {
  const res = await fetch(`/api/pads/${id}`, { method: "DELETE" });
  return res.ok;
}
