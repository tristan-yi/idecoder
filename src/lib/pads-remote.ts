import type { Session } from "@/lib/types";

export type PadListItem = {
  session: Session;
  owner: boolean;
};

export type RemotePad = {
  session: Session;
  owner: boolean;
};

export type PublishResult =
  | { status: "ok"; owner: boolean }
  | { status: "disabled" }
  | { status: "error" }
  | { status: "kicked" };

async function readError(res: Response) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? "";
  } catch {
    return "";
  }
}

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

export async function fetchPad(
  id: string,
): Promise<RemotePad | "kicked" | null> {
  const res = await fetch(`/api/pads/${id}`);
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.assign(`/login?next=${encodeURIComponent(`/pad/${id}`)}`);
    }
    throw new Error("auth");
  }
  if (res.status === 403 && (await readError(res)) === "kicked") return "kicked";
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) throw new Error("Could not load pad");
  const data = (await res.json()) as { session?: Session; owner?: boolean };
  if (!data.session) return null;
  return { session: data.session, owner: Boolean(data.owner) };
}

export async function fetchPadWithRetry(
  id: string,
): Promise<RemotePad | "kicked" | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const found = await fetchPad(id);
      if (found === "kicked") return "kicked";
      if (found) return found;
    } catch (err) {
      if (err instanceof Error && err.message === "auth") return null;
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return null;
}

export async function publishPad(session: Session): Promise<PublishResult> {
  try {
    const res = await fetch(`/api/pads/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    if (res.status === 503) return { status: "disabled" };
    if (res.status === 403 && (await readError(res)) === "kicked") {
      return { status: "kicked" };
    }
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { owner?: boolean };
    return { status: "ok", owner: Boolean(data.owner) };
  } catch {
    return { status: "error" };
  }
}

export async function kickPadUser(
  padId: string,
  opts: { clientId: number; userId: string },
): Promise<"ok" | "unknown" | "error"> {
  const res = await fetch(`/api/pads/${padId}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: String(opts.clientId),
      userId: opts.userId,
    }),
  });
  if (res.ok) return "ok";
  if (res.status === 409) return "unknown";
  return "error";
}

export async function deleteRemotePad(id: string): Promise<boolean> {
  const res = await fetch(`/api/pads/${id}`, { method: "DELETE" });
  return res.ok;
}
