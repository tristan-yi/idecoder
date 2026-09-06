import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { fromB64 } from "@/lib/collab/bytes";
import { isPadId } from "@/lib/collab/fields";
import { applyPadSync, ensurePadAccess, leavePad } from "@/lib/collab/store";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

type SyncBody = {
  leave?: boolean;
  clientId?: string;
  sv?: string;
  update?: string;
  awareness?: string;
  peer?: { name?: string; color?: string };
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser();
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  if (!isPadId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "Live pads are not configured" }, { status: 503 });
  }
  const access = await ensurePadAccess(id, gate.user.id);
  if (access === "missing") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await req.json()) as SyncBody;
  const clientId = String(body.clientId ?? "").slice(0, 40);
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  if (body.leave) {
    await leavePad(id, clientId);
    return NextResponse.json({ ok: true });
  }

  if (!body.sv || body.sv.length > 20_000) {
    return NextResponse.json({ error: "state vector required" }, { status: 400 });
  }
  if (body.update && body.update.length > 1_500_000) {
    return NextResponse.json({ error: "update too large" }, { status: 413 });
  }

  try {
    const result = await applyPadSync({
      id,
      sv: fromB64(body.sv),
      update: body.update ? fromB64(body.update) : undefined,
      clientId,
      name: String(body.peer?.name ?? "Guest").slice(0, 24),
      color: String(body.peer?.color ?? "#3ee0b2").slice(0, 16),
      awareness: body.awareness?.slice(0, 200_000),
    });
    if ("missing" in result) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
