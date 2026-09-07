"use client";

import { plusLabel } from "@/lib/collab/activity";

export function PlusBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  const label = plusLabel(count);
  return (
    <span
      aria-label={`${count} new ${count === 1 ? "edit" : "edits"}`}
      className={`idc-plus inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-mint px-1 text-[10px] font-semibold leading-none text-ink ${className}`}
    >
      {label}
    </span>
  );
}
