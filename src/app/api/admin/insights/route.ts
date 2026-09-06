import { NextResponse } from "next/server";
import { getAdminInsights } from "@/lib/admin/insights";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const insights = await getAdminInsights();
  return NextResponse.json(insights, { headers: { "Cache-Control": "no-store" } });
}
