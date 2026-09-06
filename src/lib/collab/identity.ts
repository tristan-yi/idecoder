const KEY = "idecoder.peer.v1";

export const PEER_COLORS = [
  "#3ee0b2",
  "#7aa2f7",
  "#e6b325",
  "#c4a7e7",
  "#f05163",
  "#89b4fa",
  "#fab387",
  "#94e2d5",
];

export type PeerIdentity = {
  id: string;
  name: string;
  color: string;
};

function hashColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PEER_COLORS[hash % PEER_COLORS.length];
}

export function identityFromAccount(account: {
  id: string;
  name: string;
}): PeerIdentity {
  return {
    id: account.id,
    name: account.name.trim().slice(0, 24) || "You",
    color: hashColor(account.id),
  };
}

export function getPeerIdentity(): PeerIdentity {
  if (typeof window === "undefined") {
    return { id: "server", name: "Guest", color: PEER_COLORS[0] };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PeerIdentity;
      if (parsed.id && parsed.name && parsed.color) return parsed;
    }
  } catch {
    // ignore
  }
  const id = crypto.randomUUID();
  const peer: PeerIdentity = {
    id,
    name: `Guest ${id.replace(/-/g, "").slice(0, 4)}`,
    color: hashColor(id),
  };
  localStorage.setItem(KEY, JSON.stringify(peer));
  return peer;
}

export function savePeerName(name: string): PeerIdentity {
  const current = getPeerIdentity();
  const trimmed = name.trim().slice(0, 24) || current.name;
  const next = { ...current, name: trimmed };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
