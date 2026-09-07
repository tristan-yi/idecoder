"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, Loader2, UserX } from "lucide-react";
import type { CollabStatus, PeerInfo } from "@/lib/collab/provider";
import { PlusBadge } from "./PlusBadge";

export function PresenceBar({
  peers,
  status,
  onShare,
  copied,
  onNameChange,
  onPeek,
  placeOf,
  canKick,
  onKick,
  kickingId,
  hitsOf,
}: {
  peers: PeerInfo[];
  status: CollabStatus;
  onShare: () => void;
  copied: boolean;
  onNameChange: (name: string) => void;
  onPeek: (peer: PeerInfo) => void;
  placeOf: (peer: PeerInfo) => string;
  canKick: boolean;
  onKick: (peer: PeerInfo) => Promise<boolean>;
  kickingId: string | null;
  hitsOf: (peer: PeerInfo) => number;
}) {
  const others = peers.filter((peer) => !peer.self);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmKick, setConfirmKick] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (openId == null) return;
    function onPointer(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpenId(null);
      setConfirmKick(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenId(null);
        setConfirmKick(false);
      }
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const liveLabel =
    status === "live"
      ? others.length > 0
        ? `${others.length + 1} in this pad`
        : "Live — share the link"
      : status === "local"
        ? "This browser"
        : status === "offline"
          ? "Reconnecting…"
          : "Connecting…";

  const openPeer = peers.find((peer) => peer.clientId === openId) ?? null;

  return (
    <>
      <style>{others
        .map(
          (peer) => `
            .yRemoteSelection-${peer.clientId} { background-color: ${peer.color}; }
            .yRemoteSelectionHead-${peer.clientId} { color: ${peer.color}; border-color: ${peer.color}; }
          `,
        )
        .join("\n")}</style>
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${
              status === "live" ? "animate-ping bg-mint/70" : "bg-mute/50"
            }`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              status === "live" ? "bg-mint" : status === "offline" ? "bg-medium" : "bg-mute"
            }`}
          />
        </span>
        <span className="hidden text-[12px] text-mute lg:inline">{liveLabel}</span>
        <div className="flex items-center gap-1">
          {peers.slice(0, 5).map((peer) => (
            <button
              key={peer.clientId}
              type="button"
              title={
                peer.self
                  ? "Change your name"
                  : hitsOf(peer) > 0
                    ? `${peer.name} wrote something`
                    : `Go to ${peer.name}`
              }
              onClick={(event) => {
                if (peer.self) {
                  setOpenId(null);
                  setDraft(peer.name);
                  setEditing(true);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                setMenuPos({
                  top: rect.bottom + 8,
                  left: Math.max(8, Math.min(rect.left, window.innerWidth - 272)),
                });
                setConfirmKick(false);
                setOpenId(peer.clientId);
                onPeek(peer);
              }}
              className={`inline-flex max-w-[9.5rem] items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-left ${
                openId === peer.clientId
                  ? "border-mint/50 bg-white/10"
                  : "border-line bg-ink hover:bg-white/5"
              }`}
            >
              <span className="relative shrink-0">
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold text-ink"
                  style={{ backgroundColor: peer.color }}
                >
                  {initials(peer.name)}
                </span>
                <PlusBadge
                  key={peer.self ? 0 : hitsOf(peer)}
                  count={peer.self ? 0 : hitsOf(peer)}
                  className="absolute -right-1.5 -top-1.5"
                />
              </span>
              <span className="truncate text-[12px] text-zinc-200">
                {peer.self ? "You" : peer.name}
              </span>
            </button>
          ))}
        </div>
        {openPeer && !openPeer.self
          ? createPortal(
              <div
                ref={menuRef}
                role="dialog"
                aria-label={openPeer.name}
                style={{ top: menuPos.top, left: menuPos.left }}
                className="fixed z-50 w-64 rounded-xl border border-line bg-panel p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-ink"
                    style={{ backgroundColor: openPeer.color }}
                  >
                    {initials(openPeer.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{openPeer.name}</div>
                    <div className="text-[12px] text-mute">{placeOf(openPeer)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPeek(openPeer)}
                  className="mt-3 w-full rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
                >
                  Jump to cursor
                </button>
                {canKick ? (
                  confirmKick ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={kickingId === openPeer.id}
                        onClick={() => {
                          void onKick(openPeer).then((ok) => {
                            if (!ok) return;
                            setOpenId(null);
                            setConfirmKick(false);
                          });
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-hard px-3 py-1.5 text-sm font-medium text-white hover:bg-hard/90 disabled:opacity-50"
                      >
                        {kickingId === openPeer.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <UserX size={14} />
                        )}
                        Kick
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmKick(false)}
                        className="flex-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmKick(true)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-hard hover:bg-hard/10"
                    >
                      <UserX size={14} />
                      Kick from pad
                    </button>
                  )
                ) : null}
              </div>,
              document.body,
            )
          : null}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            maxLength={24}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onNameChange(draft);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onNameChange(draft);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-28 rounded-md border border-line bg-ink px-2 py-0.5 text-xs outline-none"
            aria-label="Your name"
          />
        ) : null}
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-white/5"
        >
          {copied ? <Check size={14} className="text-mint" /> : <Link2 size={14} />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
        </button>
      </div>
    </>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
