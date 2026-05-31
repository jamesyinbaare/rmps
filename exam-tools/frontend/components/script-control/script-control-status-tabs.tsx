"use client";

import type { ScriptControlSchoolOverallStatus, ScriptControlSchoolStatusCounts } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ScriptControlStatusFilter = ScriptControlSchoolOverallStatus | "all";

const STATUS_TABS: { value: ScriptControlStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing" },
  { value: "partial", label: "Partial" },
  { value: "complete", label: "Complete" },
  { value: "verified", label: "Verified" },
];

const STATUS_TONE: Record<ScriptControlStatusFilter, string> = {
  all: "border-border bg-muted/40 text-foreground",
  missing: "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
  partial: "border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  complete: "border-blue-300/60 bg-blue-50 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100",
  verified:
    "border-emerald-300/60 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
};

export function statusFilterEmptyMessage(status: ScriptControlStatusFilter): string {
  switch (status) {
    case "missing":
      return "No missing schools for this subject and paper. Try Partial or All.";
    case "partial":
      return "No partially recorded schools. Try Missing or Complete.";
    case "complete":
      return "No fully recorded (unverified) schools. Try Partial or Verified.";
    case "verified":
      return "No fully verified schools yet.";
    default:
      return "No schools match this filter.";
  }
}

type Props = {
  active: ScriptControlStatusFilter;
  counts: ScriptControlSchoolStatusCounts | null | undefined;
  onChange: (status: ScriptControlStatusFilter) => void;
};

export function ScriptControlStatusTabs({ active, counts, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-1.5"
      role="tablist"
      aria-label="School status filter"
    >
      {STATUS_TABS.map((tab) => {
        const isActive = active === tab.value;
        const count =
          tab.value === "all" ? counts?.total : counts ? counts[tab.value as ScriptControlSchoolOverallStatus] : null;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex min-w-[4.5rem] flex-col items-center rounded-lg border px-3 py-2 text-center transition-colors sm:min-w-0 sm:flex-row sm:gap-2 sm:px-3 sm:py-1.5",
              isActive ? STATUS_TONE[tab.value] : "border-transparent text-muted-foreground hover:bg-background/80",
            )}
            onClick={() => onChange(tab.value)}
          >
            <span className="text-xs font-semibold sm:text-sm">{tab.label}</span>
            {count != null ? (
              <span className={cn("tabular-nums text-lg font-bold leading-none sm:text-sm", isActive ? "" : "text-foreground/80")}>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
