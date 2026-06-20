"use client";

import { cn } from "@/lib/utils";

type Props = {
  combined: number;
  quota: number | null | undefined;
  overCap: boolean;
  size?: "sm" | "lg";
};

export function ExaminerQuotaUtilizationBar({ combined, quota, overCap, size = "sm" }: Props) {
  if (quota == null || quota <= 0) {
    return <span className="text-xs text-muted-foreground">No cap set</span>;
  }
  const pct = Math.min(100, Math.round((combined / quota) * 100));
  const isLarge = size === "lg";
  return (
    <div className={cn("flex flex-col gap-1", isLarge ? "min-w-full" : "min-w-28")}>
      <div className={cn("overflow-hidden rounded-full bg-muted", isLarge ? "h-2.5" : "h-1.5")}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            overCap ? "bg-destructive" : pct >= 90 ? "bg-amber-500" : "bg-emerald-500",
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span
        className={cn(
          "tabular-nums",
          isLarge ? "text-xs" : "text-[10px]",
          overCap ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {combined}/{quota}
        {overCap ? ` (+${combined - quota})` : quota - combined > 0 ? ` · ${quota - combined} left` : ""}
      </span>
    </div>
  );
}
