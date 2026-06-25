"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileStack,
  MinusCircle,
  Users,
  UserSquare2,
} from "lucide-react";

import { cn } from "@/lib/utils";

const KPI_EXPANDED_STORAGE_KEY = "examiner-subject-kpi-expanded";

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
        card: "border-destructive/30 bg-gradient-to-br from-destructive/[0.06] via-card to-card",
        value: "text-destructive",
        badge: "bg-destructive/12 text-destructive",
        bar: "bg-destructive",
        Icon: AlertCircle,
        label: "Over allocated",
      };
    case "match":
      return {
        card: "border-success/30 bg-gradient-to-br from-success/[0.06] via-card to-card",
        value: "text-success",
        badge: "bg-success/12 text-success",
        bar: "bg-success",
        Icon: CheckCircle2,
        label: "Balanced",
      };
    case "under":
      return {
        card: "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-card to-card dark:border-amber-400/30",
        value: "text-amber-700 dark:text-amber-400",
        badge: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
        bar: "bg-amber-500 dark:bg-amber-400",
        Icon: MinusCircle,
        label: "Under allocated",
      };
  }
}

function formatVariance(variance: number): string {
  return variance > 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString();
}

function readDefaultExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = sessionStorage.getItem(KPI_EXPANDED_STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    /* ignore */
  }
  const tallEnough = window.innerHeight >= 900;
  const wideEnough = window.matchMedia("(min-width: 1280px)").matches;
  return tallEnough && wideEnough;
}

function VarianceBadge({ tone }: { tone: ReturnType<typeof toneTheme> }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone.badge,
      )}
    >
      <tone.Icon className="size-3.5 shrink-0" aria-hidden />
      {tone.label}
    </span>
  );
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between rounded-xl border border-border/70 bg-card/90 px-3 py-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          title={hint}
        >
          {label}
        </p>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
    </div>
  );
}

type Props = {
  subjectCode: string;
  subjectName: string;
  subjectType?: string;
  paperNumber?: number | null;
  registered: number;
  allocated: number;
  variance: number;
  examinerCount: number;
  refreshing?: boolean;
};

export function ExaminerSubjectSummaryKpiStrip({
  registered,
  allocated,
  variance,
  examinerCount,
  refreshing = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExpanded(readDefaultExpanded());
    setHydrated(true);
  }, []);

  const tone = toneTheme(varianceTone(variance));
  const fillPct =
    registered > 0 ? Math.min(100, Math.round((allocated / registered) * 100)) : allocated > 0 ? 100 : 0;
  const varianceLabel = formatVariance(variance);

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(KPI_EXPANDED_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="relative shrink-0 px-4 py-2 sm:px-5" aria-busy={refreshing}>
      {refreshing ? (
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/35" aria-hidden />
      ) : null}

      <div
        className={cn(
          "rounded-xl border border-border/70 bg-muted/25 shadow-inner dark:bg-muted/15",
          expanded ? "p-2.5 sm:p-3" : "p-2.5",
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <VarianceBadge tone={tone} />
            <div className="hidden h-4 w-px shrink-0 bg-border/70 sm:block" aria-hidden />
            <p className="min-w-0 text-sm tabular-nums text-foreground">
              <span className="text-muted-foreground">Reg</span>{" "}
              <span className="font-medium">{registered.toLocaleString()}</span>
              <span className="mx-1.5 text-muted-foreground/50" aria-hidden>
                ·
              </span>
              <span className="text-muted-foreground">Alloc</span>{" "}
              <span className="font-medium">{allocated.toLocaleString()}</span>
              <span className="mx-1.5 text-muted-foreground/50" aria-hidden>
                ·
              </span>
              <span className="text-muted-foreground">Var</span>{" "}
              <span className={cn("font-medium", tone.value)}>{varianceLabel}</span>
              <span className="mx-1.5 text-muted-foreground/50" aria-hidden>
                ·
              </span>
              <span className="text-muted-foreground">Examiners</span>{" "}
              <span className="font-medium">{examinerCount.toLocaleString()}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div
              className="hidden h-1 w-20 overflow-hidden rounded-full bg-muted sm:block lg:w-28"
              title={`${allocated.toLocaleString()} allocated of ${registered.toLocaleString()} registered`}
              role="presentation"
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-300", tone.bar)}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
              onClick={toggleExpanded}
              aria-expanded={hydrated ? expanded : false}
              aria-controls="examiner-subject-kpi-details"
            >
              {expanded ? (
                <>
                  Hide
                  <ChevronUp className="size-3.5" aria-hidden />
                </>
              ) : (
                <>
                  Details
                  <ChevronDown className="size-3.5" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>

        {expanded ? (
          <div
            id="examiner-subject-kpi-details"
            className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricTile
              label="Registered"
              value={registered.toLocaleString()}
              hint="Candidates entered for this subject"
              icon={Users}
            />
            <MetricTile
              label="Allocated scripts"
              value={allocated.toLocaleString()}
              hint="Scripts assigned across all papers"
              icon={FileStack}
            />
            <MetricTile
              label="Variance"
              value={varianceLabel}
              hint="Allocated minus registered"
              icon={tone.Icon}
              className={tone.card}
            />
            <MetricTile
              label="Examiners"
              value={examinerCount.toLocaleString()}
              hint="With bank accounts on this subject"
              icon={UserSquare2}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ExaminerSubjectSummaryKpiSkeleton() {
  return (
    <div className="shrink-0 px-4 py-2 sm:px-5" role="status" aria-label="Loading summary">
      <div className="rounded-xl border border-border/70 bg-muted/25 p-2.5">
        <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
      </div>
    </div>
  );
}
