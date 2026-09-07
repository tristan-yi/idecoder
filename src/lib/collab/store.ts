import * as Y from "yjs";
import type { Session } from "@/lib/types";
import { getSql } from "@/lib/db";
import { fromB64, toB64 } from "./bytes";
import { encodeInitialDoc } from "./init-doc";

export type PeerRow = {
  client_id: string;
  name: string;
  color: string;
  awareness: string;
};

export type PadAccessStatus = "missing" | "ok" | "banned";

export type PadAccess = {
  status: PadAccessStatus;
  owner: boolean;
};

type PeerMap = Record<
  string,
  {
    name: string;
    color: string;
    awareness: string;
    seenAt: number;
    userId?: string;
  }
>;

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Session;
  return (
    typeof session.id === "string" &&
    typeof session.problem?.title === "string" &&
    typeof session.language === "string"
  );
}

function asPeerMap(value: unknown): PeerMap {
  if (!value || typeof value !== "object") return {};
  return value as PeerMap;
}

function toPeerRows(raw: unknown, except: string): { peers: PeerRow[]; left: string[] } {
  const now = Date.now();
  const left: string[] = [];
  const peers: PeerRow[] = [];
  for (const [client_id, peer] of Object.entries(asPeerMap(raw))) {
    if (client_id === except) continue;
    if (!peer || now - peer.seenAt > 8000) {
      left.push(client_id);
      continue;
    }
    peers.push({
      client_id,
      name: peer.name,
      color: peer.color,
      awareness: peer.awareness,
    });
  }
  return { peers, left };
}

function diffFromDoc(ydoc: string, sv: Uint8Array, update?: Uint8Array) {
  const doc = new Y.Doc();
  try {
    if (ydoc) Y.applyUpdate(doc, fromB64(ydoc));
    if (update && update.byteLength > 0) Y.applyUpdate(doc, update);
    return {
      next: toB64(Y.encodeStateAsUpdate(doc)),
      diff: toB64(Y.encodeStateAsUpdate(doc, sv)),
    };
  } finally {
    doc.destroy();
  }
}

export async function listUserPads(userId: string): Promise<
  { session: Session; owner: boolean }[]
> {
  const sql = getSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT payload, owner_id
    FROM pads
    WHERE owner_id = ${userId}
       OR id IN (SELECT pad_id FROM pad_members WHERE user_id = ${userId})
    ORDER BY updated_at DESC
    LIMIT 50
  `) as { payload: unknown; owner_id: string | null }[];
  return rows.flatMap((row) => {
    if (!isSession(row.payload)) return [];
    return [{ session: row.payload, owner: row.owner_id === userId }];
  });
}

async function isBanned(
  sql: NonNullable<ReturnType<typeof getSql>>,
  padId: string,
  userId: string,
) {
  const rows = (await sql`
    SELECT 1 FROM pad_bans
    WHERE pad_id = ${padId} AND user_id = ${userId}
    LIMIT 1
  `) as { "?column?": number }[];
  return rows.length > 0;
}

export async function getPadAccess(
  id: string,
  userId: string,
): Promise<PadAccess> {
  const sql = getSql();
  if (!sql) return { status: "missing", owner: false };
  const rows = (await sql`
    SELECT owner_id FROM pads WHERE id = ${id}
  `) as { owner_id: string | null }[];
  if (!rows[0]) return { status: "missing", owner: false };
  if (await isBanned(sql, id, userId)) return { status: "banned", owner: false };
  return { status: "ok", owner: rows[0].owner_id === userId };
}

export async function ensurePadAccess(
  id: string,
  userId: string,
): Promise<PadAccess> {
  const sql = getSql();
  if (!sql) return { status: "missing", owner: false };
  const rows = (await sql`
    SELECT owner_id FROM pads WHERE id = ${id}
  `) as { owner_id: string | null }[];
  if (!rows[0]) return { status: "missing", owner: false };
  if (await isBanned(sql, id, userId)) return { status: "banned", owner: false };
  if (!rows[0].owner_id) {
    await sql`
      UPDATE pads SET owner_id = ${userId}
      WHERE id = ${id} AND owner_id IS NULL
    `;
    const claimed = (await sql`
      SELECT owner_id FROM pads WHERE id = ${id}
    `) as { owner_id: string | null }[];
    const owner = claimed[0]?.owner_id === userId;
    if (!owner) {
      await sql`
        INSERT INTO pad_members (pad_id, user_id)
        VALUES (${id}, ${userId})
        ON CONFLICT DO NOTHING
      `;
    }
    return { status: "ok", owner };
  }
  if (rows[0].owner_id === userId) return { status: "ok", owner: true };
  await sql`
    INSERT INTO pad_members (pad_id, user_id)
    VALUES (${id}, ${userId})
    ON CONFLICT DO NOTHING
  `;
  return { status: "ok", owner: false };
}

export async function kickPadMember(
  padId: string,
  ownerId: string,
  opts: { clientId: string; userId?: string },
): Promise<"ok" | "forbidden" | "missing" | "unknown"> {
  const sql = getSql();
  if (!sql) return "missing";
  const rows = (await sql`
    SELECT owner_id, peers FROM pads WHERE id = ${padId}
  `) as { owner_id: string | null; peers: unknown }[];
  if (!rows[0]) return "missing";
  if (rows[0].owner_id !== ownerId) return "forbidden";

  const peers = asPeerMap(rows[0].peers);
  const fromClient = peers[opts.clientId]?.userId?.trim() || "";
  const hinted = opts.userId?.trim() || "";
  const hintedLive =
    hinted &&
    Object.values(peers).some((peer) => peer.userId === hinted);
  const target = fromClient || (hintedLive ? hinted : "");
  if (!target) return "unknown";
  if (target === ownerId) return "forbidden";

  await sql`
    DELETE FROM pad_members
    WHERE pad_id = ${padId} AND user_id = ${target}
  `;
  await sql`
    INSERT INTO pad_bans (pad_id, user_id)
    VALUES (${padId}, ${target})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    UPDATE pads SET peers = (
      SELECT COALESCE(jsonb_object_agg(
        key,
        CASE
          WHEN value->>'userId' = ${target}
            THEN jsonb_set(value, '{seenAt}', '0'::jsonb)
          ELSE value
        END
      ), '{}'::jsonb)
      FROM jsonb_each(COALESCE(pads.peers, '{}'::jsonb))
    )
    WHERE id = ${padId}
  `;
  return "ok";
}

export async function deleteUserPad(id: string, userId: string) {
  const sql = getSql();
  if (!sql) return false;
  const rows = (await sql`
    DELETE FROM pads WHERE id = ${id} AND owner_id = ${userId}
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}

export async function upsertPad(session: Session, userId: string) {
  const sql = getSql();
  if (!sql) return false;
  const existing = (await sql`
    SELECT id FROM pads WHERE id = ${session.id}
  `) as { id: string }[];
  if (existing[0] && (await isBanned(sql, session.id, userId))) return false;
  const initial = encodeInitialDoc(session);
  await sql`
    INSERT INTO pads (id, payload, ydoc, owner_id)
    VALUES (
      ${session.id},
      ${JSON.stringify(session)}::jsonb,
      ${initial},
      ${userId}
    )
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
  `;
  const access = await ensurePadAccess(session.id, userId);
  return access.status === "ok";
}

export async function getPad(id: string): Promise<Session | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT payload FROM pads WHERE id = ${id}
  `) as { payload: unknown }[];
  const payload = rows[0]?.payload;
  return isSession(payload) ? payload : null;
}

export async function leavePad(id: string, clientId: string) {
  const sql = getSql();
  if (!sql) return;
  await sql`
    UPDATE pads SET peers = peers - ${clientId} WHERE id = ${id}
  `;
}

export async function applyPadSync(opts: {
  id: string;
  sv: Uint8Array;
  update?: Uint8Array;
  clientId: string;
  name: string;
  color: string;
  userId: string;
  awareness?: string;
}): Promise<{ missing: true } | { update: string; peers: PeerRow[]; left: string[] }> {
  const sql = getSql();
  if (!sql) return { missing: true };

  const cutoff = Date.now() - 8000;
  const peerPatch = JSON.stringify({
    [opts.clientId]: {
      name: opts.name,
      color: opts.color,
      userId: opts.userId,
      awareness: opts.awareness ?? "",
      seenAt: Date.now(),
    },
  });

  const heartbeat = async () => {
    const rows = (await sql`
      UPDATE pads
      SET peers = (
        SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
        FROM jsonb_each(COALESCE(pads.peers, '{}'::jsonb))
        WHERE key = ${opts.clientId}
           OR COALESCE((value->>'seenAt')::bigint, 0) > ${cutoff}
      ) || ${peerPatch}::jsonb
      WHERE id = ${opts.id}
      RETURNING ydoc, peers
    `) as { ydoc: string; peers: unknown }[];
    return rows[0] ?? null;
  };

  if (!opts.update || opts.update.byteLength === 0) {
    const row = await heartbeat();
    if (!row) return { missing: true };
    const { diff } = diffFromDoc(row.ydoc, opts.sv);
    const { peers, left } = toPeerRows(row.peers, opts.clientId);
    return { update: diff, peers, left };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = (await sql`
      SELECT ydoc, version FROM pads WHERE id = ${opts.id}
    `) as { ydoc: string; version: number }[];
    if (!rows[0]) return { missing: true };
    const { next, diff } = diffFromDoc(rows[0].ydoc, opts.sv, opts.update);
    const updated = (await sql`
      UPDATE pads
      SET ydoc = ${next}, version = version + 1, updated_at = now()
      WHERE id = ${opts.id} AND version = ${rows[0].version}
      RETURNING id
    `) as { id: string }[];
    if (updated.length > 0) {
      const row = await heartbeat();
      const { peers, left } = toPeerRows(row?.peers, opts.clientId);
      return { update: diff, peers, left };
    }
  }

  throw new Error("sync conflict");
}
