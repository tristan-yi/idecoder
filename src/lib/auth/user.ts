import { NextResponse } from "next/server";
import { auth } from "./server";
import type { AppUser } from "./types";

export type { AppUser } from "./types";
export { safeNextPath } from "./types";

export async function getAppUser(): Promise<AppUser | null> {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user?.id) return null;
  const name = (user.name || user.email || "You").trim() || "You";
  return {
    id: user.id,
    name,
    email: user.email ?? "",
  };
}

export async function requireUser() {
  const user = await getAppUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }
  return { user, response: null };
}
