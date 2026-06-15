"use client";

import { Loader2 } from "lucide-react";

type Props = {
  loadedCount: number;
  totalCount: number;
  visible: boolean;
};

export function LoadingProgressBanner({ loadedCount, totalCount, visible }: Props) {
  if (!visible || totalCount <= 0) return null;

  const pct = Math.min(100, Math.round((loadedCount / totalCount) * 100));

  return (
    <div
      className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span>
          Loading centre data…{" "}
          <span className="font-medium tabular-nums">
            {loadedCount.toLocaleString()} / {totalCount.toLocaleString()}
          </span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
