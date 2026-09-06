"use client";

import { signOutAction } from "@/app/login/actions";
import type { AppUser } from "@/lib/auth/types";

export function UserMenu({ user }: { user: AppUser }) {
  return (
    <form action={signOutAction} className="flex items-center gap-3">
      <span className="hidden max-w-[12rem] truncate text-sm text-mute sm:inline">
        {user.name}
      </span>
      <button
        type="submit"
        className="rounded-md px-2 py-1.5 text-sm text-mute hover:bg-white/5 hover:text-white"
      >
        Sign out
      </button>
    </form>
  );
}
