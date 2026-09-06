import type { Session } from "@/lib/types";

export async function fetchPad(id: string): Promise<Session | null> {
  const res = await fetch(`/api/pads/${id}`);
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) throw new Error("Could not load pad");
  const data = (await res.json()) as { session?: Session };
  return data.session ?? null;
}

export async function fetchPadWithRetry(id: string): Promise<Session | null> {
  for (let i = 0; i < 5; i++) {
    const session = await fetchPad(id);
    if (session) return session;
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
