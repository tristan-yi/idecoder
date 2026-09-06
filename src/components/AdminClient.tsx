"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, ChevronLeft, Radio, Users } from "lucide-react";
import { UserMenu } from "./UserMenu";
import type { AdminInsights, AdminPadRow } from "@/lib/admin/types";
import type { AppUser } from "@/lib/auth/types";

function ago(value: string | null) {
  if (!value) return "never";
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function difficultyClass(value: string) {
  if (value === "Easy") return "text-easy";
  if (value === "Medium") return "text-medium";
  if (value === "Hard") return "text-hard";
  return "text-mute";
}

export function AdminClient({
  user,
  initial,
}: {
  user: AppUser;
  initial: AdminInsights;
}) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/admin/insights");
        if (!res.ok) return;
        const next = (await res.json()) as AdminInsights;
        if (!cancelled) setData(next);
      } catch {
        // keep the last good snapshot
      }
    }
    const timer = setInterval(() => void refresh(), 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-ink text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(62,224,178,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(62,224,178,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-mute hover:bg-white/5 hover:text-white"
          >
            <ChevronLeft size={16} />
            Pads
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-mint">
            Insights
          </span>
        </div>
        <UserMenu user={user} />
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-5 pb-16">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-mint">
          Floor scan · refreshes every few seconds
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Who is in the building.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mute">
          Accounts, the pads they opened, and who is typing right now. Only you
          can see this.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="People" value={data.stats.users} icon={<Users size={16} />} />
          <Stat label="Pads" value={data.stats.pads} icon={<Activity size={16} />} />
          <Stat label="Live now" value={data.stats.liveNow} icon={<Radio size={16} />} live />
          <Stat label="Active 24h" value={data.stats.activeToday} icon={<Activity size={16} />} />
        </div>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-mute">In a room right now</h2>
          {data.liveRooms.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel px-4 py-6 text-sm text-mute">
              Nobody is in a live pad at this moment.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {data.liveRooms.map((room) => (
                <li
                  key={room.id}
                  className="rounded-xl border border-mint/25 bg-panel px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{room.title}</div>
                      <div className="mt-0.5 text-xs text-mute">
                        {room.ownerName ? `Owner ${room.ownerName}` : "No owner"} ·{" "}
                        {ago(room.updatedAt)}
                      </div>
                    </div>
                    <span className="relative mt-1 flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {room.peers.map((peer, index) => (
                      <span
                        key={`${room.id}-${peer.name}-${index}`}
                        className="rounded-full border border-line px-2 py-0.5 text-[12px]"
                      >
                        {peer.name}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/pad/${room.id}`}
                    className="mt-3 inline-block text-xs text-mint hover:underline"
                  >
                    Open pad
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-mute">People</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {data.people.length === 0 ? (
              <p className="px-4 py-6 text-sm text-mute">No accounts yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.people.map((person) => (
                  <li key={person.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{person.name}</div>
                      <div className="truncate text-xs text-mute">{person.email}</div>
                    </div>
                    <div className="text-xs text-mute sm:w-40">
                      Joined {ago(person.createdAt)}
                      <div>Seen {ago(person.lastSeenAt)}</div>
                    </div>
                    <div className="min-w-0 text-sm sm:w-72">
                      {person.latestPad ? (
                        <Link href={`/pad/${person.latestPad.id}`} className="block truncate hover:text-mint">
                          {person.latestPad.title}
                        </Link>
                      ) : (
                        <span className="text-mute">No pad yet</span>
                      )}
                      <div className="text-xs text-mute">
                        {person.padCount} pad{person.padCount === 1 ? "" : "s"}
                        {person.latestPad ? ` · ${ago(person.latestPad.updatedAt)}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-mute">What they are working on</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            {data.pads.length === 0 ? (
              <p className="px-4 py-6 text-sm text-mute">No pads yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.pads.map((pad) => (
                  <PadLine key={pad.id} pad={pad} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  live,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  live?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex items-center justify-between text-mute">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">{label}</span>
        <span className={live && value > 0 ? "text-mint" : ""}>{icon}</span>
      </div>
      <div className="mt-2 font-mono text-3xl tracking-tight">{value}</div>
    </div>
  );
}

function PadLine({ pad }: { pad: AdminPadRow }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Link href={`/pad/${pad.id}`} className="truncate text-sm font-medium hover:text-mint">
          {pad.title}
        </Link>
        {pad.prompt ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-mute">{pad.prompt}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute sm:justify-end">
        {pad.difficulty ? (
          <span className={difficultyClass(pad.difficulty)}>{pad.difficulty}</span>
        ) : null}
        {pad.language ? <span className="uppercase">{pad.language}</span> : null}
        <span>{pad.owner?.name ?? "Unclaimed"}</span>
        {pad.livePeers.length > 0 ? (
          <span className="text-mint">{pad.livePeers.length} live</span>
        ) : null}
        <span>{ago(pad.updatedAt)}</span>
      </div>
    </li>
  );
}
