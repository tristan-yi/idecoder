"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { signInWithEmail, signUpWithEmail } from "@/app/login/actions";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState(signInWithEmail, null);
  const [upState, upAction, upPending] = useActionState(signUpWithEmail, null);
  const pending = mode === "in" ? inPending : upPending;
  const error = mode === "in" ? inState?.error : upState?.error;
  const pairing = nextPath.startsWith("/pad/");

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(62,224,178,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(62,224,178,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-[-20%] h-[70vh] w-[70vh] rounded-full bg-mint/10 blur-3xl"
      />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-12 px-5 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-lg">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint font-mono text-sm font-bold text-ink">
              id
            </span>
            <span className="text-sm font-semibold tracking-wide">idecoder</span>
          </div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-mint">
            {pairing ? "Join a live pad" : "Your session"}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {pairing
              ? "Sign in to sit down at this pad."
              : "One login. Your pads stay yours."}
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-mute">
            Each person has their own account. Create a pad, then share the URL
            when you want someone else in the room. They sign in with their
            account — they do not inherit yours.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-panel/90 p-6 shadow-[0_0_0_1px_rgba(62,224,178,0.08)] backdrop-blur">
          <div className="mb-5 grid grid-cols-2 rounded-lg border border-line bg-ink p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("in")}
              className={`rounded-md py-1.5 font-medium ${
                mode === "in" ? "bg-white/10 text-white" : "text-mute"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("up")}
              className={`rounded-md py-1.5 font-medium ${
                mode === "up" ? "bg-white/10 text-white" : "text-mute"
              }`}
            >
              Create account
            </button>
          </div>

          <form action={mode === "in" ? inAction : upAction} className="flex flex-col gap-3.5">
            <input type="hidden" name="next" value={nextPath} />
            {mode === "up" ? (
              <label className="block text-sm">
                <span className="mb-1.5 block text-mute">Name</span>
                <input
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Alex"
                  className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-[15px] outline-none placeholder:text-zinc-600 focus:border-mint/40"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1.5 block text-mute">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-[15px] outline-none placeholder:text-zinc-600 focus:border-mint/40"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-mute">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-[15px] outline-none placeholder:text-zinc-600 focus:border-mint/40"
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-hard/30 bg-hard/10 px-3 py-2 text-sm text-hard">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-mint px-4 py-2.5 text-sm font-semibold text-ink hover:bg-mint/90 disabled:opacity-40"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : null}
              {pending
                ? mode === "in"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "in"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
