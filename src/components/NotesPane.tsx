"use client";

import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { bindYTextToTextarea } from "@/lib/collab/notes-bind";

export function NotesPane({
  ytext,
  value,
  onChange,
  onFocus,
}: {
  ytext?: Y.Text | null;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea || !ytext) return;
    return bindYTextToTextarea(ytext, textarea);
  }, [ytext]);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold">Shared notes</h2>
        <p className="mt-1 text-[13px] leading-5 text-mute">
          Talking points, edge cases, follow-ups. Everyone in this pad sees
          these live.
        </p>
      </div>
      {ytext ? (
        <textarea
          ref={ref}
          onFocus={onFocus}
          placeholder="Sketch the approach, paste examples, leave a note for your pair…"
          className="min-h-0 flex-1 resize-none bg-ink px-5 py-4 text-[15px] leading-7 text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          placeholder="Sketch the approach, paste examples, leave a note for your pair…"
          className="min-h-0 flex-1 resize-none bg-ink px-5 py-4 text-[15px] leading-7 text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      )}
    </div>
  );
}
