"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

type Axis = "horizontal" | "vertical";

export function Split({
  axis,
  initial,
  min = 18,
  max = 82,
  children,
}: {
  axis: Axis;
  initial: number;
  min?: number;
  max?: number;
  children: [ReactNode, ReactNode];
}) {
  const [pct, setPct] = useState(initial);
  const dragging = useRef(false);
  const frame = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (clientX: number, clientY: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      const next =
        axis === "horizontal"
          ? ((clientX - box.left) / box.width) * 100
          : ((clientY - box.top) / box.height) * 100;
      setPct(Math.min(max, Math.max(min, next)));
    },
    [axis, max, min],
  );

  return (
    <div
      ref={frame}
      className={
        axis === "horizontal"
          ? "flex h-full min-h-0 w-full"
          : "flex h-full min-h-0 w-full flex-col"
      }
      onPointerMove={(e) => {
        if (!dragging.current) return;
        onMove(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerLeave={() => {
        dragging.current = false;
      }}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={
          axis === "horizontal"
            ? { width: `${pct}%` }
            : { height: `${pct}%` }
        }
      >
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation={axis}
        className={
          axis === "horizontal"
            ? "group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-[#1b212b] hover:bg-mint/40"
            : "group relative z-10 h-1.5 shrink-0 cursor-row-resize bg-[#1b212b] hover:bg-mint/40"
        }
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children[1]}</div>
    </div>
  );
}
