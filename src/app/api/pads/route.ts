import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { listUserPads } from "@/lib/collab/store";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUser();
  if (gate.response) return gate.response;
  if (!hasDatabase()) {
    return NextResponse.json(
      { configured: false, pads: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const pads = await listUserPads(gate.user.id);
  return NextResponse.json(
    { configured: true, pads },
    { headers: { "Cache-Control": "no-store" } },
  );
}
