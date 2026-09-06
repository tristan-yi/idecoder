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

type PeerMap = Record<
  string,
  { name: string; color: string; awareness: string; seenAt: number }
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

export async function upsertPad(session: Session) {
  const sql = getSql();
  if (!sql) return false;
  const initial = encodeInitialDoc(session);
  await sql`
    INSERT INTO pads (id, payload, ydoc)
    VALUES (${session.id}, ${JSON.stringify(session)}::jsonb, ${initial})
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
  `;
  return true;
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
  awareness?: string;
}): Promise<{ missing: true } | { update: string; peers: PeerRow[]; left: string[] }> {
  const sql = getSql();
  if (!sql) return { missing: true };

  const cutoff = Date.now() - 8000;
  const peerPatch = JSON.stringify({
    [opts.clientId]: {
      name: opts.name,
      color: opts.color,
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
