"use client";

import { FileCode2 } from "lucide-react";
import type { SeedFile } from "@/lib/review/types";

const ROLE_DOT: Record<SeedFile["role"], string> = {
  target: "bg-medium",
  reference: "bg-mint",
  context: "bg-zinc-600",
};

const ROLE_TITLE: Record<SeedFile["role"], string> = {
  target: "Where the reported problem lives",
  reference: "A working pattern to copy",
  context: "Supporting code",
};

export function FileTree({
  files,
  originals,
  activePath,
  onOpen,
}: {
  files: SeedFile[];
  originals: SeedFile[];
  activePath: string;
  onOpen: (path: string) => void;
}) {
  const groups = new Map<string, SeedFile[]>();
  for (const file of files) {
    const dir = file.path.includes("/") ? file.path.split("/")[0] : ".";
    const bucket = groups.get(dir);
    if (bucket) bucket.push(file);
    else groups.set(dir, [file]);
  }

  return (
    <div className="h-full w-48 shrink-0 overflow-y-auto border-r border-line bg-panel py-2">
      {Array.from(groups.entries()).map(([dir, entries]) => (
        <div key={dir} className="mb-2">
          <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-mute">
            {dir}
          </div>
          {entries.map((file) => {
            const original = originals.find((f) => f.path === file.path);
            const dirty = original ? original.contents !== file.contents : true;
            const name = file.path.split("/").slice(1).join("/") || file.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onOpen(file.path)}
                title={`${ROLE_TITLE[file.role]}${file.note ? ` — ${file.note}` : ""}`}
                className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-[13px] ${
                  file.path === activePath
                    ? "bg-white/10 text-white"
                    : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${ROLE_DOT[file.role]}`}
                  aria-hidden
                />
                <FileCode2 size={13} className="shrink-0 text-mute" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {dirty && <span className="shrink-0 text-[10px] text-medium">●</span>}
              </button>
            );
          })}
        </div>
      ))}

      <div className="mt-3 space-y-1 border-t border-line px-3 pt-2 text-[11px] text-mute">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-medium" aria-hidden />
          reported problem
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-mint" aria-hidden />
          working pattern
        </div>
      </div>
    </div>
  );
}
