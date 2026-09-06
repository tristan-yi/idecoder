import { getSql } from "@/lib/db";
import type { AdminInsights, AdminPadRow, AdminPeer, AdminPerson, AdminLiveRoom } from "./types";

export type { AdminInsights, AdminPadRow, AdminPeer, AdminPerson, AdminLiveRoom } from "./types";

const LIVE_MS = 12_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
};

type SeenRow = { user_id: string; last_seen: string };

type PadRow = {
  id: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  peers: unknown;
  language: string | null;
  title: string | null;
  difficulty: string | null;
  prompt: string | null;
  member_count: number | string | null;
};

function iso(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function livePeers(raw: unknown, cutoff: number): AdminPeer[] {
  if (!raw || typeof raw !== "object") return [];
  const out: AdminPeer[] = [];
  for (const peer of Object.values(raw as Record<string, { name?: string; seenAt?: number }>)) {
    if (!peer || typeof peer.seenAt !== "number" || peer.seenAt < cutoff) continue;
    out.push({ name: String(peer.name || "Guest").slice(0, 40) });
  }
  return out;
}

export async function getAdminInsights(): Promise<AdminInsights> {
  const empty: AdminInsights = {
    generatedAt: Date.now(),
    stats: { users: 0, pads: 0, liveNow: 0, activeToday: 0 },
    people: [],
    pads: [],
    liveRooms: [],
  };
  const sql = getSql();
  if (!sql) return empty;

  const [users, seen, padRows] = (await Promise.all([
    sql`
      SELECT id::text AS id, name, email, "createdAt" AS created_at
      FROM neon_auth."user"
      ORDER BY "createdAt" DESC
    `,
    sql`
      SELECT "userId"::text AS user_id, MAX("updatedAt") AS last_seen
      FROM neon_auth.session
      GROUP BY "userId"
    `,
    sql`
      SELECT
        id,
        owner_id,
        created_at,
        updated_at,
        peers,
        payload->>'language' AS language,
        payload->'problem'->>'title' AS title,
        payload->'problem'->>'difficulty' AS difficulty,
        LEFT(COALESCE(payload->>'prompt', ''), 180) AS prompt,
        (SELECT COUNT(*) FROM pad_members m WHERE m.pad_id = pads.id) AS member_count
      FROM pads
      ORDER BY updated_at DESC
      LIMIT 80
    `,
  ])) as [UserRow[], SeenRow[], PadRow[]];

  const now = Date.now();
  const cutoff = now - LIVE_MS;
  const today = now - DAY_MS;
  const byId = new Map(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        name: (user.name || user.email || "Someone").trim() || "Someone",
        email: user.email || "",
      },
    ]),
  );
  const lastSeen = new Map(seen.map((row) => [row.user_id, iso(row.last_seen)]));

  const pads: AdminPadRow[] = padRows.map((row) => {
    const owner = row.owner_id ? (byId.get(row.owner_id) ?? null) : null;
    return {
      id: row.id,
      title: row.title?.trim() || "Untitled pad",
      difficulty: row.difficulty || "",
      language: row.language || "",
      prompt: row.prompt || "",
      owner,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      memberCount: Number(row.member_count || 0),
      livePeers: livePeers(row.peers, cutoff),
    };
  });

  const ownedCounts = new Map<string, number>();
  const latestByOwner = new Map<string, { id: string; title: string; updatedAt: string }>();
  for (const pad of pads) {
    if (!pad.owner) continue;
    ownedCounts.set(pad.owner.id, (ownedCounts.get(pad.owner.id) ?? 0) + 1);
    const current = latestByOwner.get(pad.owner.id);
    if (!current || current.updatedAt < pad.updatedAt) {
      latestByOwner.set(pad.owner.id, {
        id: pad.id,
        title: pad.title,
        updatedAt: pad.updatedAt,
      });
    }
  }

  const people: AdminPerson[] = users.map((user) => ({
    id: user.id,
    name: (user.name || user.email || "Someone").trim() || "Someone",
    email: user.email || "",
    createdAt: iso(user.created_at),
    lastSeenAt: lastSeen.get(user.id) ?? null,
    padCount: ownedCounts.get(user.id) ?? 0,
    latestPad: latestByOwner.get(user.id) ?? null,
  }));

  const liveRooms = pads
    .filter((pad) => pad.livePeers.length > 0)
    .map((pad) => ({
      id: pad.id,
      title: pad.title,
      ownerName: pad.owner?.name ?? null,
      peers: pad.livePeers,
      updatedAt: pad.updatedAt,
    }));

  const activeIds = new Set<string>();
  for (const person of people) {
    const seenAt = person.lastSeenAt ? Date.parse(person.lastSeenAt) : 0;
    const padAt = person.latestPad ? Date.parse(person.latestPad.updatedAt) : 0;
    if (seenAt >= today || padAt >= today) activeIds.add(person.id);
  }

  return {
    generatedAt: now,
    stats: {
      users: people.length,
      pads: pads.length,
      liveNow: liveRooms.length,
      activeToday: activeIds.size,
    },
    people,
    pads,
    liveRooms,
  };
}
