"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/types";

export async function signInWithEmail(
  _prev: { error: string } | null,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await auth.signIn.email({ email, password });
  if (error) {
    return { error: error.message || "Could not sign in. Check your email and password." };
  }
  redirect(next);
}

export async function signUpWithEmail(
  _prev: { error: string } | null,
  formData: FormData,
) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  if (!name) return { error: "Name is required." };
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { error } = await auth.signUp.email({ name, email, password });
  if (error) {
    return { error: error.message || "Could not create an account." };
  }
  redirect(next);
}

export async function signOutAction() {
  await auth.signOut();
  redirect("/login");
}
