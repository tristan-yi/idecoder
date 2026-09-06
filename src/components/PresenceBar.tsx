"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import type { CollabStatus, PeerInfo } from "@/lib/collab/provider";

export function PresenceBar({
  peers,
  status,
  onShare,
  copied,
  onNameChange,
}: {
  peers: PeerInfo[];
  status: CollabStatus;
  onShare: () => void;
  copied: boolean;
  onNameChange: (name: string) => void;
}) {
  const others = peers.filter((peer) => !peer.self);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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
        <div className="flex items-center -space-x-1.5">
          {peers.slice(0, 5).map((peer) => (
            <button
              key={peer.clientId}
              type="button"
              title={peer.self ? "Change your name" : peer.name}
              onClick={() => {
                if (peer.self) {
                  setDraft(peer.name);
                  setEditing(true);
                }
              }}
              className="grid h-6 w-6 place-items-center rounded-full border border-ink text-[10px] font-semibold text-ink"
              style={{ backgroundColor: peer.color }}
            >
              {initials(peer.name)}
            </button>
          ))}
        </div>
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
