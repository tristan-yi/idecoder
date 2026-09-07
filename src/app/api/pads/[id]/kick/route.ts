import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { isPadId } from "@/lib/collab/fields";
import { kickPadMember } from "@/lib/collab/store";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  const body = (await req.json()) as { clientId?: string; userId?: string };
  const clientId = String(body.clientId ?? "").slice(0, 40);
  const userId = String(body.userId ?? "").slice(0, 80);
  if (!clientId && !userId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const result = await kickPadMember(id, gate.user.id, { clientId, userId });
  if (result === "missing") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (result === "forbidden") {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }
  if (result === "unknown") {
    return NextResponse.json(
      { error: "That person is not connected right now." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
