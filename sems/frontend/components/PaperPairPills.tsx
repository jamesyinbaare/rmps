"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PaperPairFilter = "paired" | "missing_1" | "missing_2";

export type PaperPairCounts = {
  paired: number;
  missing_1: number;
  missing_2: number;
};

const PILLS: Array<{
  key: "all" | PaperPairFilter;
  label: string;
  filter?: PaperPairFilter;
  dot: string;
}> = [
  { key: "all", label: "All", dot: "bg-muted-foreground" },
  { key: "paired", label: "Paired", filter: "paired", dot: "bg-primary" },
  { key: "missing_1", label: "Objectives only", filter: "missing_1", dot: "bg-amber-500" },
  { key: "missing_2", label: "Essay only", filter: "missing_2", dot: "bg-orange-500" },
];

interface PaperPairPillsProps {
  counts: PaperPairCounts;
  selected?: PaperPairFilter | "missing";
  onSelect: (value: PaperPairFilter | undefined) => void;
  loading?: boolean;
  dense?: boolean;
}

export function PaperPairPills({
  counts,
  selected,
  onSelect,
  loading,
  dense = false,
}: PaperPairPillsProps) {
  if (loading) {
    return (
      <div
        className="flex flex-wrap items-center gap-1.5"
        aria-busy="true"
        aria-label="Loading paper pair counts"
      >
        {PILLS.map((pill) => (
          <Skeleton
            key={pill.key}
            className={cn("rounded-full", dense ? "h-7 w-[72px]" : "h-8 w-[84px]")}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Filter by paper pair"
    >
      {PILLS.map((pill) => {
        const active = pill.filter ? selected === pill.filter : !selected;
        const count =
          pill.key === "all"
            ? null
            : pill.key === "paired"
              ? counts.paired
              : pill.key === "missing_1"
                ? counts.missing_1
                : counts.missing_2;
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
            {count != null && (
              <span className="tabular-nums text-foreground">
                {Number(count).toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
