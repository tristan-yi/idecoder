import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { isPadId } from "@/lib/collab/fields";
import {
  deleteUserPad,
  ensurePadAccess,
  getPad,
  getPadAccess,
  upsertPad,
} from "@/lib/collab/store";
import { hasDatabase } from "@/lib/db";
import type { Session } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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
  if (access.status === "missing") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (access.status === "banned") {
    return NextResponse.json({ error: "kicked" }, { status: 403 });
  }
  const session = await getPad(id);
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    { session, owner: access.owner },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(
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

  const body = (await req.json()) as { session?: Session };
  const session = body.session;
  if (!session || session.id !== id || typeof session.problem?.title !== "string") {
    return NextResponse.json({ error: "invalid session" }, { status: 400 });
  }

  const saved = await upsertPad(session, gate.user.id);
  const access = await getPadAccess(id, gate.user.id);
  if (access.status === "banned") {
    return NextResponse.json({ error: "kicked" }, { status: 403 });
  }
  if (!saved) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, owner: access.owner });
}

export async function DELETE(
  _req: Request,
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
  const deleted = await deleteUserPad(id, gate.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
