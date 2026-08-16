"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ScoresExtractionStatusCounts } from "@/types/document";

type ExtractionStatusFilter = "pending" | "queued" | "processing" | "success" | "error";

const PILLS: Array<{
  key: keyof ScoresExtractionStatusCounts | "all";
  label: string;
  filter?: ExtractionStatusFilter;
  dot: string;
}> = [
  { key: "all", label: "All", dot: "bg-muted-foreground" },
  { key: "pending", label: "Pending", filter: "pending", dot: "bg-secondary" },
  { key: "queued", label: "Queued", filter: "queued", dot: "bg-muted-foreground" },
  { key: "processing", label: "Processing", filter: "processing", dot: "bg-primary" },
  { key: "success", label: "Success", filter: "success", dot: "bg-primary" },
  { key: "error", label: "Errors", filter: "error", dot: "bg-destructive" },
];

interface ExtractionStatusPillsProps {
  counts: ScoresExtractionStatusCounts;
  selected: ExtractionStatusFilter[];
  onToggle: (status: string | undefined) => void;
  loading?: boolean;
  needsIdSelected?: boolean;
}

export function ExtractionStatusPills({
  counts,
  selected,
  onToggle,
  loading,
  needsIdSelected,
}: ExtractionStatusPillsProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" aria-busy="true" aria-label="Loading status counts">
        {PILLS.map((pill) => (
          <Skeleton key={pill.key} className="h-8 w-[88px] rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by extraction status">
      {PILLS.map((pill) => {
        const active =
          (pill.filter && selected.includes(pill.filter) && !needsIdSelected) ||
          (!pill.filter && selected.length === 0 && !needsIdSelected);
        const count = pill.key === "all" ? counts.total : counts[pill.key];
        return (
          <button
            key={pill.key}
            type="button"
            onClick={() => onToggle(pill.filter)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
              active
                ? "border-foreground/20 bg-background text-foreground shadow-sm"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-pressed={active}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
            {pill.label}
            <span className="tabular-nums text-foreground">{count.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}
