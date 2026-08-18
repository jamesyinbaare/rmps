import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AbsentReviewEntry } from "@/types/document";

export function absentEntryKey(entry: Pick<AbsentReviewEntry, "score_id" | "field_name">) {
  return `${entry.score_id}:${entry.field_name}`;
}

export function paperLabel(testType: number, compact = false) {
  switch (testType) {
    case 1:
      return compact ? "Obj" : "Objectives";
    case 2:
      return "Essay";
    case 3:
      return compact ? "Pract" : "Practical";
    default:
      return `Paper ${testType}`;
  }
}

export function PaperChip({ testType, compact = true }: { testType: number; compact?: boolean }) {
  return (
    <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-medium">
      {paperLabel(testType, compact)}
    </Badge>
  );
}

export function markerBadgeClass(marker: string) {
  switch (marker.toUpperCase()) {
    case "A":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "AA":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "AAA":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-border bg-muted text-foreground";
  }
}

export function MarkerBadge({ marker, className }: { marker: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono tabular-nums", markerBadgeClass(marker), className)}>
      {marker}
    </Badge>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
