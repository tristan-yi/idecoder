import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { fromB64, toB64 } from "./bytes";
import { getPeerIdentity, identityFromAccount, type PeerIdentity } from "./identity";

export type CollabStatus = "connecting" | "live" | "local" | "offline";

export type PeerInfo = {
  clientId: number;
  name: string;
  color: string;
  self: boolean;
};

export function peersFromAwareness(awareness: Awareness): PeerInfo[] {
  const byKey = new Map<string, PeerInfo>();
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as { name?: string; color?: string; id?: string } | undefined;
    if (!user) return;
    const info: PeerInfo = {
      clientId,
      name: user.name || "Guest",
      color: user.color || "#3ee0b2",
      self: clientId === awareness.clientID,
    };
    const key = user.id || `c:${clientId}`;
    const existing = byKey.get(key);
    if (!existing || info.self) byKey.set(key, info);
  });
  return [...byKey.values()].sort(
    (a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name),
  );
}

type SyncResponse = {
  update?: string;
  peers?: { client_id: string; awareness?: string }[];
  left?: string[];
};

export class PadProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly padId: string;
  private http: boolean;
  private identity: PeerIdentity;
  private bc: BroadcastChannel | null = null;
  private closed = false;
  private pending: Uint8Array[] = [];
  private inFlight = false;
  private needAgain = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hidden = false;
  onStatus?: (status: CollabStatus) => void;
  onPeers?: () => void;

  constructor(opts: {
    padId: string;
    http: boolean;
    account?: { id: string; name: string };
  }) {
    this.padId = opts.padId;
    this.http = opts.http;
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.identity = opts.account
      ? identityFromAccount(opts.account)
      : getPeerIdentity();
    this.awareness.setLocalStateField("user", {
      name: this.identity.name,
      color: this.identity.color,
      id: this.identity.id,
    });
  }

  setName(name: string) {
    this.identity = { ...this.identity, name };
    this.awareness.setLocalStateField("user", {
      name: this.identity.name,
      color: this.identity.color,
      id: this.identity.id,
    });
  }

  async start() {
    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    this.bindBroadcast();
    document.addEventListener("visibilitychange", this.onVisibility);
    if (this.http) {
      await this.flush();
      if (this.closed) return;
      this.timer = setInterval(() => void this.flush(), this.hidden ? 2500 : 450);
      this.onStatus?.("live");
    } else {
      this.onStatus?.("local");
    }
    this.onPeers?.();
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.debounce) clearTimeout(this.debounce);
    if (this.timer) clearInterval(this.timer);
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.bc?.close();
    this.bc = null;
    try {
      removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    } catch {
      // doc may already be tearing down
    }
    if (this.http) {
      void fetch(`/api/pads/${this.padId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave: true, clientId: String(this.doc.clientID) }),
        keepalive: true,
      }).catch(() => {});
    }
    try {
      this.awareness.destroy();
    } catch {
      // ignore
    }
    try {
      this.doc.destroy();
    } catch {
      // ignore
    }
  }

  private bindBroadcast() {
    try {
      this.bc = new BroadcastChannel(`idecoder:${this.padId}`);
      this.bc.onmessage = (event: MessageEvent) => {
        const data = event.data as { t?: string; u?: ArrayBuffer | Uint8Array };
        if (!data?.u) return;
        const bytes = data.u instanceof Uint8Array ? data.u : new Uint8Array(data.u);
        if (data.t === "u") {
          Y.applyUpdate(this.doc, bytes, "remote");
        } else if (data.t === "a") {
          applyAwarenessUpdate(this.awareness, bytes, "remote");
        }
      };
    } catch {
      this.bc = null;
    }
  }

  private onVisibility = () => {
    this.hidden = document.visibilityState === "hidden";
    if (this.timer && this.http) {
      clearInterval(this.timer);
      this.timer = setInterval(() => void this.flush(), this.hidden ? 2500 : 450);
    }
    if (!this.hidden) void this.flush();
  };

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    this.bc?.postMessage({ t: "u", u: update });
    if (origin === "seed") return;
    this.pending.push(update);
    this.schedulePush();
  };

  private onAwarenessUpdate = (
    _changed: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    this.onPeers?.();
    if (origin === "remote") return;
    const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
    this.bc?.postMessage({ t: "a", u: update });
    this.schedulePush();
  };

  private schedulePush() {
    if (!this.http || this.closed) return;
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.flush();
    }, 40);
  }

  private async flush() {
    if (!this.http || this.closed) return;
    if (this.inFlight) {
      this.needAgain = true;
      return;
    }
    this.inFlight = true;
    const merged =
      this.pending.length > 0 ? Y.mergeUpdates(this.pending) : null;
    this.pending = [];
    try {
      const res = await fetch(`/api/pads/${this.padId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sv: toB64(Y.encodeStateVector(this.doc)),
          update: merged ? toB64(merged) : undefined,
          awareness: toB64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])),
          clientId: String(this.doc.clientID),
          peer: { name: this.identity.name, color: this.identity.color },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (this.closed) return;
      if (res.status === 503) {
        this.http = false;
        this.onStatus?.("local");
        if (merged) this.pending.unshift(merged);
        return;
      }
      if (!res.ok) {
        if (merged) this.pending.unshift(merged);
        this.onStatus?.("offline");
        return;
      }
      const data = (await res.json()) as SyncResponse;
      if (data.update) {
        Y.applyUpdate(this.doc, fromB64(data.update), "remote");
      }
      for (const id of data.left ?? []) {
        const clientId = Number(id);
        if (!Number.isNaN(clientId)) {
          removeAwarenessStates(this.awareness, [clientId], "remote");
        }
      }
      for (const peer of data.peers ?? []) {
        if (peer.awareness) {
          applyAwarenessUpdate(this.awareness, fromB64(peer.awareness), "remote");
        }
      }
      this.onStatus?.("live");
    } catch {
      if (merged) this.pending.unshift(merged);
      this.onStatus?.("offline");
    } finally {
      this.inFlight = false;
      if (this.needAgain && !this.closed) {
        this.needAgain = false;
        void this.flush();
      }
    }
  }
}
