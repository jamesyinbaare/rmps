"use client";

import { cn } from "@/lib/utils";

export type WorkforceAssignmentStatusFilter =
  | "all"
  | "ready"
  | "active"
  | "awaiting"
  | "declined"
  | "no_bank";

export type WorkforceAssignmentSummaryCounts = {
  roster: number;
  ready: number;
  active: number;
  awaiting: number;
  declined: number;
  noBank: number;
  activeScriptTotal: number;
  completedTotal: number;
};

const STAT_TONE: Partial<Record<WorkforceAssignmentStatusFilter, string>> = {
  ready: "border-emerald-200/80 bg-emerald-50/50 hover:bg-emerald-50/80 dark:border-border dark:bg-background",
  active: "border-primary/30 bg-primary/5 hover:bg-primary/10 dark:border-border dark:bg-background",
  awaiting: "border-amber-200/80 bg-amber-50/50 hover:bg-amber-50/80 dark:border-border dark:bg-background",
  declined: "border-red-200/80 bg-red-50/50 hover:bg-red-50/80 dark:border-border dark:bg-background",
  no_bank: "border-slate-200/80 bg-slate-50/50 hover:bg-slate-50/80 dark:border-border dark:bg-background",
};

type Props = {
  counts: WorkforceAssignmentSummaryCounts;
  activeFilter: WorkforceAssignmentStatusFilter;
  onFilterClick: (filter: WorkforceAssignmentStatusFilter) => void;
};

function filterButtonClass(active: boolean, key: WorkforceAssignmentStatusFilter) {
  return cn(
    "shrink-0 snap-start rounded-xl border px-3 py-2.5 text-left transition-colors dark:hover:bg-muted/40",
    "md:w-auto",
    active
      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
      : cn("border-border bg-background", STAT_TONE[key]),
  );
}

export function WorkforceAssignmentSummaryStats({ counts, activeFilter, onFilterClick }: Props) {
  const items: { key: WorkforceAssignmentStatusFilter; label: string; value: number }[] = [
    { key: "all", label: "Roster", value: counts.roster },
    { key: "ready", label: "Ready to assign", value: counts.ready },
    { key: "active", label: "Active batches", value: counts.active },
    { key: "awaiting", label: "Awaiting availability", value: counts.awaiting },
    { key: "declined", label: "Declined", value: counts.declined },
    { key: "no_bank", label: "No bank details", value: counts.noBank },
  ];

  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory scrollbar-hide md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onFilterClick(item.key)}
            className={cn(filterButtonClass(activeFilter === item.key, item.key), "min-w-[7.5rem] md:min-w-0")}
          >
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
          </button>
        ))}
      </div>
      {counts.roster > 0 ? (
        <p className="text-xs text-muted-foreground">
          {counts.activeScriptTotal.toLocaleString()} in active batches ·{" "}
          {counts.completedTotal.toLocaleString()} completed total
        </p>
      ) : null}
    </div>
  );
}

export const WORKFORCE_ASSIGNMENT_FILTER_LABEL: Record<WorkforceAssignmentStatusFilter, string> = {
  all: "All",
  ready: "Ready to assign",
  active: "Active batches",
  awaiting: "Awaiting availability",
  declined: "Declined",
  no_bank: "No bank details",
};
