import { NextResponse } from "next/server";
import { requireUser } from "./user";

export const ADMIN_EMAIL = "triyi0513@gmail.com";

export function isAdminEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

export async function requireAdmin() {
  const gate = await requireUser();
  if (gate.response) return gate;
  if (!isAdminEmail(gate.user.email)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return gate;
}
