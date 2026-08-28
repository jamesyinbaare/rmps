"use client";

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, ClipboardList, Layers, Loader2 } from "lucide-react";
import type { BatchSummaryResponse } from "@/types/document";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: number | string;
  hint?: string;
  icon: ReactNode;
  accent?: "default" | "open" | "missing" | "invalid" | "batch";
  loading?: boolean;
  emphasize?: boolean;
};

function KpiCard({ label, value, hint, icon, accent = "default", loading, emphasize }: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border px-3 py-2 transition-colors lg:rounded-xl lg:px-3.5 lg:py-2.5",
        accent === "open" &&
          "border-amber-200/70 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
        accent === "missing" &&
          "border-red-200/60 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/20",
        accent === "invalid" &&
          "border-orange-200/60 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-950/20",
        accent === "batch" &&
          "border-sky-200/60 bg-sky-50/40 dark:border-sky-900/40 dark:bg-sky-950/20",
        accent === "default" && "border-border/70 bg-background/80",
        emphasize && "ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:text-[11px]">
            {label}
          </p>
          {loading ? (
            <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight lg:text-xl">
              {typeof value === "number" ? value.toLocaleString() : value}
            </p>
          )}
          {hint && !loading && (
            <p className="mt-0.5 hidden text-[11px] text-muted-foreground xl:block">{hint}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md lg:h-8 lg:w-8 lg:rounded-lg",
            accent === "open" && "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
            accent === "missing" && "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
            accent === "invalid" &&
              "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
            accent === "batch" && "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
            accent === "default" && "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export type ValidationIssuesKpiData = {
  open: number;
  missing: number;
  invalid: number;
  filtered: number;
  filteredLabel: string;
};

type ValidationIssuesKpiStripProps = {
  kpis: ValidationIssuesKpiData;
  batchSummary: BatchSummaryResponse | null;
  examSelected: boolean;
  loading?: boolean;
};

export function ValidationIssuesKpiStrip({
  kpis,
  batchSummary,
  examSelected,
  loading,
}: ValidationIssuesKpiStripProps) {
  const unbatched = batchSummary?.pending_unbatched ?? 0;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2.5">
      <KpiCard
        label="Open"
        value={kpis.open}
        hint="Pending in scope"
        icon={<AlertCircle className="h-3.5 w-3.5 lg:h-4 lg:w-4" />}
        accent="open"
        loading={loading}
        emphasize={kpis.open > 0}
      />
      <KpiCard
        label="Missing"
        value={kpis.missing}
        hint="Open · no score"
        icon={<AlertTriangle className="h-3.5 w-3.5 lg:h-4 lg:w-4" />}
        accent="missing"
        loading={loading}
      />
      <KpiCard
        label="Invalid"
        value={kpis.invalid}
        hint="Open · bad value"
        icon={<AlertTriangle className="h-3.5 w-3.5 lg:h-4 lg:w-4" />}
        accent="invalid"
        loading={loading}
      />
      <KpiCard
        label={kpis.filteredLabel}
        value={kpis.filtered}
        hint="Matching table filters"
        icon={<ClipboardList className="h-3.5 w-3.5 lg:h-4 lg:w-4" />}
        loading={loading}
      />
      <KpiCard
        label="Unbatched"
        value={examSelected ? unbatched : "—"}
        hint={examSelected ? "Ready to pack" : "Select an exam"}
        icon={<Layers className="h-3.5 w-3.5 lg:h-4 lg:w-4" />}
        accent="batch"
        loading={loading && examSelected}
        emphasize={examSelected && unbatched > 0}
      />
    </div>
  );
}
