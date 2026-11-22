"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  Image as ImageIcon,
  RefreshCw,
  Shield,
  Wifi,
  X,
} from "lucide-react";
import type { BulkUploadProgressState } from "@/lib/bulk-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useAnimatedNumber(target: number, durationMs = 380) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const from = displayRef.current;
    if (from === target) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return display;
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 backdrop-blur-[2px]",
        tone === "success" &&
          "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30",
        tone === "danger" &&
          "border-red-200/80 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/25",
        tone === "neutral" && "border-border/80 bg-background/70"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

export function BulkUploadProgressCard({
  progress,
  mode = "upload",
  unitLabel = "rows",
  onDismiss,
}: {
  progress: BulkUploadProgressState;
  mode?: "upload" | "validation";
  unitLabel?: string;
  onDismiss?: () => void;
}) {
  const isValidation = mode === "validation";
  const isRetrying = progress.phase === "retrying";
  const isError = progress.phase === "error";
  const isDone = progress.phase === "done";
  const isActive = !isDone && !isError;
  const canDismiss = Boolean(onDismiss) && (isDone || isError);

  const percent = useAnimatedNumber(Math.round(progress.percent));
  const successful = useAnimatedNumber(progress.successful);
  const failed = useAnimatedNumber(progress.failed);
  const remaining = useAnimatedNumber(progress.remaining);

  const eyebrow = isError
    ? isValidation
      ? "Validation interrupted"
      : "Upload interrupted"
    : isDone
      ? isValidation
        ? "Validation complete"
        : "Upload complete"
      : isRetrying
        ? "Retrying connection"
        : progress.phase === "preparing"
          ? "Preparing"
          : progress.phase === "finishing"
            ? "Finishing"
            : isValidation
              ? "Validating file"
              : "Uploading securely";

  const totalBatches = progress.totalBatches;
  const currentBatch = Math.min(progress.currentBatch, totalBatches || 0);
  const maxDots = 16;
  let dotStart = 1;
  let dotEnd = totalBatches;
  if (totalBatches > maxDots) {
    const half = Math.floor(maxDots / 2);
    dotStart = Math.max(1, currentBatch - half);
    dotEnd = Math.min(totalBatches, dotStart + maxDots - 1);
    dotStart = Math.max(1, dotEnd - maxDots + 1);
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-none"
      role="status"
      aria-live="polite"
      aria-busy={isActive}
    >
      <div
        aria-hidden
        className={cn(
          "bulk-progress-mesh pointer-events-none absolute inset-0 opacity-90",
          !isActive && "opacity-40"
        )}
      />
      {isActive && (
        <div
          aria-hidden
          className="bulk-progress-scan pointer-events-none absolute inset-x-0 h-16 opacity-70"
        />
      )}

      <div className="relative px-5 py-5 md:px-6 md:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
            <p className="mt-1.5 text-base font-medium leading-snug text-foreground md:text-lg">
              {progress.message}
            </p>
            {totalBatches > 0 && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Batch {currentBatch} of {totalBatches}
                {progress.totalRows > 0
                  ? ` · ${progress.totalRows} ${unitLabel}`
                  : ""}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-start gap-2">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl border",
                isError &&
                  "border-destructive/25 bg-destructive/10 text-destructive",
                isDone &&
                  "bulk-progress-success-pop border-primary/25 bg-primary/12 text-primary",
                isRetrying &&
                  "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300",
                isActive &&
                  !isRetrying &&
                  "bulk-progress-breathe border-primary/20 bg-primary/10 text-primary"
              )}
            >
              {isError ? (
                <CircleAlert className="h-5 w-5" />
              ) : isDone ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : isRetrying ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : progress.phase === "preparing" ? (
                unitLabel === "photos" ? (
                  <ImageIcon className="h-5 w-5" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )
              ) : progress.phase === "finishing" ? (
                <Shield className="h-5 w-5" />
              ) : (
                <Wifi className="h-5 w-5" />
              )}
            </div>
            {canDismiss && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={onDismiss}
                aria-label="Dismiss progress"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Progress
            </p>
            <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-foreground tabular-nums md:text-5xl">
              {percent}
              <span className="ml-0.5 text-2xl text-muted-foreground md:text-3xl">
                %
              </span>
            </p>
          </div>
          <p className="pb-1 text-right text-xs text-muted-foreground">
            {isValidation
              ? `Checking ${unitLabel}`
              : "Sending batches"}
            <br />
            <span className="font-medium text-foreground/80">
              {isActive ? "In progress" : isDone ? "Finished" : "Stopped"}
            </span>
          </p>
        </div>

        <div className="relative mt-4">
          <div className="h-3.5 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/60">
            <div
              className={cn(
                "bulk-progress-rail-fill relative h-full rounded-full",
                isError
                  ? "bg-destructive"
                  : isDone
                    ? "bg-primary"
                    : "bg-gradient-to-r from-primary/85 via-primary to-primary/90"
              )}
              style={{
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
              }}
            >
              {isActive && (
                <>
                  <div className="bulk-progress-sheen pointer-events-none absolute inset-y-0 w-1/3" />
                  <span
                    aria-hidden
                    className="bulk-progress-tip absolute top-1/2 right-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-background ring-2 ring-primary"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {totalBatches > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {dotStart > 1 && (
              <span className="mr-1 text-[10px] text-muted-foreground">…</span>
            )}
            {Array.from({ length: dotEnd - dotStart + 1 }, (_, i) => {
              const batch = dotStart + i;
              const done =
                batch < currentBatch || (isDone && batch <= totalBatches);
              const active = batch === currentBatch && isActive;
              return (
                <span
                  key={batch}
                  title={`Batch ${batch}`}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    done && "bulk-progress-dot-lit bg-primary",
                    active &&
                      "bg-primary/70 ring-2 ring-primary/30 ring-offset-1 ring-offset-background",
                    !done && !active && "bg-border"
                  )}
                />
              );
            })}
            {dotEnd < totalBatches && (
              <span className="ml-1 text-[10px] text-muted-foreground">…</span>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <StatChip
            label={isValidation ? "Would succeed" : "Successful"}
            value={successful}
            tone="success"
          />
          <StatChip label="Failed" value={failed} tone="danger" />
          <StatChip label="Remaining" value={remaining} tone="neutral" />
        </div>

        {isRetrying && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Poor connection detected — automatically retrying this batch.
          </p>
        )}

        {canDismiss && (
          <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
