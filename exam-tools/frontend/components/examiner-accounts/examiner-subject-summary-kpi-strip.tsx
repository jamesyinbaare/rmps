"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileStack,
  MinusCircle,
  Users,
  UserSquare2,
} from "lucide-react";

import type { SubjectTypeEnum } from "@/lib/api";
import { cn } from "@/lib/utils";

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

function subjectTypeLabel(type: SubjectTypeEnum | string): string {
  return type === "ELECTIVE" ? "Elective" : "Core";
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
        "flex min-w-0 flex-col justify-between rounded-xl border border-border/70 bg-card/90 px-3.5 py-3 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

type Props = {
  subjectCode: string;
  subjectName: string;
  subjectType?: SubjectTypeEnum | string;
  paperNumber?: number | null;
  registered: number;
  allocated: number;
  variance: number;
  examinerCount: number;
  refreshing?: boolean;
};

export function ExaminerSubjectSummaryKpiStrip({
  subjectCode,
  subjectName,
  subjectType,
  paperNumber,
  registered,
  allocated,
  variance,
  examinerCount,
  refreshing = false,
}: Props) {
  const tone = toneTheme(varianceTone(variance));
  const fillPct =
    registered > 0 ? Math.min(100, Math.round((allocated / registered) * 100)) : allocated > 0 ? 100 : 0;

  return (
    <div className="relative shrink-0 px-4 pb-3 sm:px-5" aria-busy={refreshing}>
      {refreshing ? (
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/35" aria-hidden />
      ) : null}

      <div className="rounded-xl border border-border/70 bg-muted/25 p-3 shadow-inner dark:bg-muted/15 sm:p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Subject in scope
            </p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">
              <span className="font-mono">{subjectCode}</span>
              <span className="mx-2 text-muted-foreground/60">·</span>
              <span>{subjectName}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {subjectType ? (
                <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-xs font-medium text-foreground">
                  {subjectTypeLabel(subjectType)}
                </span>
              ) : null}
              {paperNumber != null ? (
                <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-xs font-medium text-foreground">
                  Paper {paperNumber}
                </span>
              ) : null}
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tone.badge)}>
                <tone.Icon className="size-3.5 shrink-0" aria-hidden />
                {tone.label}
              </span>
            </div>
          </div>

          <div className="w-full min-w-0 lg:max-w-xs">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Allocation vs registered</span>
              <span className="tabular-nums">
                {allocated.toLocaleString()} / {registered.toLocaleString()}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width] duration-300", tone.bar)}
                style={{ width: `${fillPct}%` }}
                role="presentation"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
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
            value={variance > 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString()}
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
      </div>
    </div>
  );
}

export function ExaminerSubjectSummaryKpiSkeleton() {
  return (
    <div className="shrink-0 px-4 pb-3 sm:px-5" role="status" aria-label="Loading summary">
      <div className="rounded-xl border border-border/70 bg-muted/25 p-3.5">
        <div className="h-12 animate-pulse rounded-lg bg-muted/50" />
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
