"use client";

import { useEffect, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { LANGUAGES } from "@/lib/languages";
import { isRemoteTextChange, peerIdForClient, remoteEditClients } from "./activity";
import { NOTES_KEY, codeKey } from "./fields";

const BURST_MS = 800;

export function useRemoteActivity(
  doc: Y.Doc | null,
  awareness: Awareness | null,
  synced: boolean,
  viewing: { notes: boolean; code: boolean },
) {
  const [tabUnread, setTabUnread] = useState({ notes: 0, code: 0 });
  const [peerHits, setPeerHits] = useState<Record<string, number>>({});
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  const burstRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (viewing.notes) {
      setTabUnread((current) =>
        current.notes === 0 ? current : { ...current, notes: 0 },
      );
    }
  }, [viewing.notes]);

  useEffect(() => {
    if (viewing.code) {
      setTabUnread((current) =>
        current.code === 0 ? current : { ...current, code: 0 },
      );
    }
  }, [viewing.code]);

  useEffect(() => {
    if (!doc || !awareness || !synced) return;

    const bump = (key: string) => {
      const now = Date.now();
      if (now - (burstRef.current[key] ?? 0) < BURST_MS) return false;
      burstRef.current[key] = now;
      return true;
    };

    const onSurface =
      (surface: "code" | "notes") =>
      (event: Y.YTextEvent, transaction: Y.Transaction) => {
        if (!isRemoteTextChange(event, transaction)) return;
        const clients = remoteEditClients(
          event,
          transaction,
          awareness,
          surface,
        );
        const watching =
          surface === "notes"
            ? viewingRef.current.notes
            : viewingRef.current.code;
        if (!watching && bump(`tab:${surface}`)) {
          setTabUnread((current) => ({
            ...current,
            [surface]: Math.min(9, current[surface] + 1),
          }));
        }
        setPeerHits((current) => {
          let next: Record<string, number> | null = null;
          for (const clientId of clients) {
            const id = peerIdForClient(awareness, clientId);
            if (!bump(`peer:${surface}:${id}`)) continue;
            if (!next) next = { ...current };
            next[id] = Math.min(9, (next[id] ?? 0) + 1);
          }
          return next ?? current;
        });
      };

    const watched = [
      { text: doc.getText(NOTES_KEY), surface: "notes" as const },
      ...LANGUAGES.map((lang) => ({
        text: doc.getText(codeKey(lang.id)),
        surface: "code" as const,
      })),
    ];
    const offs = watched.map(({ text, surface }) => {
      const handler = onSurface(surface);
      text.observe(handler);
      return () => text.unobserve(handler);
    });
    return () => offs.forEach((off) => off());
  }, [doc, awareness, synced]);

  function clearPeer(id: string) {
    setPeerHits((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return { tabUnread, peerHits, clearPeer };
}
