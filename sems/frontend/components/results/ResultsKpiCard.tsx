"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function ResultsKpiCard({
  title,
  value,
  caption,
  icon: Icon,
  accent,
  iconWell,
  valueClass,
  progress,
  showProgress,
  loading,
  onClick,
  active,
}: {
  title: string;
  value: string;
  caption: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
  iconWell: string;
  valueClass?: string;
  progress?: number;
  showProgress?: boolean;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-l-4 bg-card p-4 shadow-sm", accent)}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
    );
  }

  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "animate-in fade-in-0 rounded-xl border border-transparent border-l-4 bg-card p-4 text-left shadow-sm duration-200",
        accent,
        onClick && "cursor-pointer transition-all hover:-translate-y-px hover:shadow-md",
        active && "ring-2 ring-primary/25"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className={cn("rounded-md p-1.5", iconWell)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", valueClass)}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      {showProgress ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }}
          />
        </div>
      ) : null}
    </Comp>
  );
}
