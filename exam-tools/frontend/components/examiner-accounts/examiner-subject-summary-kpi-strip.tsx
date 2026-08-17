"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type ExaminerSubjectPaperKpi = {
  paperNumber: number;
  registered: number;
  allocated: number;
  variance: number;
};

type VarianceTone = "over" | "match" | "under";

function varianceTone(variance: number): VarianceTone {
  if (variance > 0) return "over";
  if (variance < 0) return "under";
  return "match";
}

function toneTheme(tone: VarianceTone) {
  switch (tone) {
    case "over":
      return {
        value: "text-destructive",
        chip: "bg-destructive/10 text-destructive ring-destructive/20",
        Icon: AlertCircle,
        label: "Over",
      };
    case "match":
      return {
        value: "text-success",
        chip: "bg-success/10 text-success ring-success/20",
        Icon: CheckCircle2,
        label: "OK",
      };
    case "under":
      return {
        value: "text-amber-700 dark:text-amber-400",
        chip: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300 dark:ring-amber-400/30",
        Icon: MinusCircle,
        label: "Under",
      };
  }
}

function formatVariance(variance: number): string {
  return variance > 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString();
}

type Props = {
  subjectCode: string;
  subjectName: string;
  subjectType?: string;
  paperNumber?: number | null;
  papers: ExaminerSubjectPaperKpi[];
  examinerCount: number;
  refreshing?: boolean;
};

export function ExaminerSubjectSummaryKpiStrip({
  papers,
  paperNumber = null,
  examinerCount,
  refreshing = false,
}: Props) {
  const visiblePapers = useMemo(() => {
    if (paperNumber == null) return papers;
    const match = papers.find((p) => p.paperNumber === paperNumber);
    if (match) return [match];
    return [
      {
        paperNumber,
        registered: papers[0]?.registered ?? 0,
        allocated: 0,
        variance: -(papers[0]?.registered ?? 0),
      },
    ];
  }, [papers, paperNumber]);

  const registered = visiblePapers[0]?.registered ?? 0;
  const aggregateVariance = useMemo(
    () => visiblePapers.reduce((sum, p) => sum + p.variance, 0),
    [visiblePapers],
  );
  const overall = toneTheme(varianceTone(aggregateVariance));

  return (
    <div className="relative shrink-0 px-4 py-1.5 sm:px-5" aria-busy={refreshing}>
      {refreshing ? (
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/35" aria-hidden />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 dark:bg-muted/10">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
            overall.chip,
          )}
          title={
            visiblePapers.length > 1
              ? "Status across papers (each paper compared to registered candidates separately)"
              : undefined
          }
        >
          <overall.Icon className="size-3 shrink-0" aria-hidden />
          {overall.label}
        </span>

        <span className="text-xs tabular-nums text-muted-foreground">
          Reg <span className="font-medium text-foreground">{registered.toLocaleString()}</span>
        </span>

        <span className="hidden h-3 w-px bg-border/70 sm:block" aria-hidden />

        {visiblePapers.map((p) => {
          const tone = toneTheme(varianceTone(p.variance));
          return (
            <span
              key={p.paperNumber}
              className="inline-flex items-center gap-1 text-xs tabular-nums"
              title={`Paper ${p.paperNumber}: ${p.allocated.toLocaleString()} allocated of ${p.registered.toLocaleString()} registered`}
            >
              <span className="font-medium text-muted-foreground">P{p.paperNumber}</span>
              <span className="font-medium text-foreground">{p.allocated.toLocaleString()}</span>
              <span className={cn("font-medium", tone.value)}>({formatVariance(p.variance)})</span>
            </span>
          );
        })}

        <span className="hidden h-3 w-px bg-border/70 sm:block" aria-hidden />

        <span className="text-xs tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{examinerCount.toLocaleString()}</span>{" "}
          examiners
        </span>
      </div>
    </div>
  );
}

export function ExaminerSubjectSummaryKpiSkeleton() {
  return (
    <div className="shrink-0 px-4 py-1.5 sm:px-5" role="status" aria-label="Loading summary">
      <div className="h-8 animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}
