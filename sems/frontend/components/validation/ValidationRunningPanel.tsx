"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Loader2, ScanSearch } from "lucide-react";
import type { ValidationProgressUpdate } from "@/lib/run-validation-scope";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "running" | "complete" | "error";

type ValidationStep = {
  key: string;
  label: string;
  status: StepStatus;
};

type ValidationRunningPanelProps = {
  progress: ValidationProgressUpdate | null;
  stepStatuses: Map<string, StepStatus>;
  subjectIds: number[];
  subjects: Array<{ id: number; code: string; name: string }>;
  examLabel?: string;
};

function buildSteps(
  subjectIds: number[],
  subjects: Array<{ id: number; code: string; name: string }>,
  stepStatuses: Map<string, StepStatus>
): ValidationStep[] {
  if (subjectIds.length === 0) {
    return [
      {
        key: "all",
        label: "All subjects",
        status: stepStatuses.get("all") ?? "running",
      },
    ];
  }

  return subjectIds.map((id) => {
    const subject = subjects.find((s) => s.id === id);
    return {
      key: String(id),
      label: subject ? `${subject.code} — ${subject.name}` : `Subject ${id}`,
      status: stepStatuses.get(String(id)) ?? "pending",
    };
  });
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === "error") {
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  }
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />;
}

export function ValidationRunningPanel({
  progress,
  stepStatuses,
  subjectIds,
  subjects,
  examLabel,
}: ValidationRunningPanelProps) {
  const steps = useMemo(
    () => buildSteps(subjectIds, subjects, stepStatuses),
    [subjectIds, subjects, stepStatuses]
  );

  const total = progress?.total ?? steps.length;
  const current = progress?.current ?? 0;
  const activeLabel = progress?.label ?? "Preparing…";

  const completedCount = steps.filter((s) => s.status === "complete" || s.status === "error").length;
  const hasRunning = steps.some((s) => s.status === "running");
  const progressUnits = completedCount + (hasRunning ? 0.45 : 0);
  const ringPercent = total > 0 ? Math.min(100, (progressUnits / total) * 100) : 0;
  const percent = Math.round(ringPercent);

  const circumference = 2 * Math.PI * 54;
  const strokeOffset = circumference - (ringPercent / 100) * circumference;

  return (
    <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center overflow-hidden px-8 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--primary)_0%,transparent_65%)] opacity-[0.07]" />

      <div className="relative mb-8 flex items-center justify-center">
        <span className="validation-ring-pulse absolute h-36 w-36 rounded-full border border-primary/30" />
        <span
          className="validation-ring-pulse absolute h-28 w-28 rounded-full border border-primary/20"
          style={{ animationDelay: "0.35s" }}
        />

        <svg className="relative h-32 w-32 -rotate-90" viewBox="0 0 120 120" aria-hidden>
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted/50"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-primary transition-all duration-700 ease-out"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <ScanSearch className="mb-1 h-6 w-6 text-primary" />
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{percent}%</span>
        </div>

        <div className="validation-scan-line pointer-events-none absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      </div>

      <div className="validation-fade-up w-full max-w-lg text-center">
        <p className="text-lg font-medium tracking-tight">Validating scores</p>
        {examLabel && <p className="mt-1 text-sm text-muted-foreground">{examLabel}</p>}
        <p className="mt-3 text-sm font-medium text-primary">{activeLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Step {Math.max(current, 1)} of {total}
        </p>
      </div>

      <div className="validation-fade-up mt-8 w-full max-w-lg" style={{ animationDelay: "80ms" }}>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
          <div className="validation-shimmer-slide absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
        </div>
      </div>

      <ul
        className="validation-fade-up mt-8 w-full max-w-lg space-y-2"
        style={{ animationDelay: "140ms" }}
      >
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-500",
              step.status === "running" &&
                "border-primary/30 bg-primary/5 shadow-sm ring-1 ring-primary/15",
              step.status === "complete" &&
                "border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
              step.status === "error" &&
                "border-destructive/30 bg-destructive/5",
              step.status === "pending" && "border-border/60 bg-muted/20 opacity-70"
            )}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <StepIcon status={step.status} />
            <span className="min-w-0 flex-1 truncate font-medium">{step.label}</span>
            {step.status === "running" && (
              <span className="text-xs text-primary">Scanning…</span>
            )}
            {step.status === "complete" && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">Done</span>
            )}
            {step.status === "error" && (
              <span className="text-xs text-destructive">Failed</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
