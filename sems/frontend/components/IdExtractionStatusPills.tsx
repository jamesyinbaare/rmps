"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { IdExtractionStatusCounts } from "@/types/document";

type IdStatusFilter = "pending" | "success" | "error";

const PILLS: Array<{
  key: keyof IdExtractionStatusCounts | "all";
  label: string;
  filter?: IdStatusFilter;
  dot: string;
}> = [
  { key: "all", label: "All", dot: "bg-muted-foreground" },
  { key: "pending", label: "Pending", filter: "pending", dot: "bg-secondary" },
  { key: "error", label: "Errors", filter: "error", dot: "bg-destructive" },
  { key: "success", label: "Success", filter: "success", dot: "bg-primary" },
];

interface IdExtractionStatusPillsProps {
  counts: IdExtractionStatusCounts;
  selected?: string;
  onSelect: (status: IdStatusFilter | undefined) => void;
  loading?: boolean;
  /** Tighter height/padding for dense toolbars. */
  dense?: boolean;
}

export function IdExtractionStatusPills({
  counts,
  selected,
  onSelect,
  loading,
  dense = false,
}: IdExtractionStatusPillsProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" aria-busy="true" aria-label="Loading status counts">
        {PILLS.map((pill) => (
          <Skeleton
            key={pill.key}
            className={cn("rounded-full", dense ? "h-7 w-[76px]" : "h-8 w-[88px]")}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by ID extraction status">
      {PILLS.map((pill) => {
        const active = pill.filter ? selected === pill.filter : !selected;
        const count = pill.key === "all" ? counts.total : counts[pill.key];
        return (
          <button
            key={pill.key}
            type="button"
            onClick={() => onSelect(pill.filter)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border text-xs font-medium transition-colors",
              dense ? "h-7 px-2" : "h-8 px-2.5",
              active
                ? "border-foreground/20 bg-background text-foreground shadow-sm"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-pressed={active}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
            {pill.label}
            <span className="tabular-nums text-foreground">{Number(count).toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}
