"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/types";
import { seedDoc } from "./init-doc";
import { savePeerName } from "./identity";
import {
  PadProvider,
  peersFromAwareness,
  type CollabStatus,
  type PeerInfo,
} from "./provider";

export function useCollab(
  padId: string | null,
  session: Session | null,
  http: boolean,
) {
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [synced, setSynced] = useState(false);
  const [provider, setProvider] = useState<PadProvider | null>(null);
  const seedRef = useRef(session);
  useEffect(() => {
    seedRef.current = session;
  });

  useEffect(() => {
    if (!padId) return;

    let cancelled = false;
    const room = new PadProvider({ padId, http });
    room.onStatus = (next) => {
      if (!cancelled) setStatus(next);
    };
    room.onPeers = () => {
      if (!cancelled) setPeers(peersFromAwareness(room.awareness));
    };

    void (async () => {
      await room.start();
      if (cancelled) return;
      if (seedRef.current) seedDoc(room.doc, seedRef.current);
      setProvider(room);
      setPeers(peersFromAwareness(room.awareness));
      setSynced(true);
    })();

    return () => {
      cancelled = true;
      setSynced(false);
      setProvider(null);
      room.destroy();
    };
  }, [padId, http]);

  const setName = useCallback((name: string) => {
    const next = savePeerName(name);
    provider?.setName(next.name);
  }, [provider]);

  return {
    doc: provider?.doc ?? null,
    awareness: provider?.awareness ?? null,
    status,
    peers,
    synced,
    setName,
  };
}
