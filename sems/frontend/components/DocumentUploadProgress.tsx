"use client";

import { useEffect } from "react";
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Download,
  Fingerprint,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadPhase =
  | "idle"
  | "hashing"
  | "reserving"
  | "uploading"
  | "confirming"
  | "complete"
  | "error";

export function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STEPS: { id: UploadPhase; label: string; icon: typeof Fingerprint }[] = [
  { id: "hashing", label: "Check", icon: Fingerprint },
  { id: "reserving", label: "Reserve", icon: ShieldCheck },
  { id: "uploading", label: "Upload", icon: CloudUpload },
  { id: "confirming", label: "Confirm", icon: CheckCircle2 },
];

const PHASE_ORDER: UploadPhase[] = ["hashing", "reserving", "uploading", "confirming"];

function phaseIndex(phase: UploadPhase): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? (phase === "complete" ? PHASE_ORDER.length : -1) : idx;
}

export function DocumentUploadAnimationStyles() {
  useEffect(() => {
    const id = "document-upload-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes upload-shimmer {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }
      @keyframes upload-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.06); opacity: 0.92; }
      }
      @keyframes upload-check-pop {
        0% { transform: scale(0.6); opacity: 0; }
        60% { transform: scale(1.08); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .motion-safe\\:animate-\\[upload-shimmer_1\\.6s_ease-in-out_infinite\\],
        .motion-safe\\:animate-\\[upload-pulse_2s_ease-in-out_infinite\\],
        .motion-safe\\:animate-\\[upload-check-pop_0\\.45s_ease-out\\] {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

function UploadPhaseStepper({ phase }: { phase: UploadPhase }) {
  const activeIdx = phaseIndex(phase);

  return (
    <ol className="flex items-center justify-between gap-1" aria-label="Upload progress steps">
      {STEPS.map((step, index) => {
        const isComplete = activeIdx > index || phase === "complete";
        const isActive = activeIdx === index && phase !== "complete";
        const Icon = step.icon;

        return (
          <li
            key={step.id}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            aria-current={isActive ? "step" : undefined}
          >
            <div
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300",
                isComplete &&
                  "border-emerald-500/80 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                isActive &&
                  "border-primary bg-primary/10 text-primary shadow-[0_0_0_3px] shadow-primary/20 motion-safe:animate-[upload-pulse_2s_ease-in-out_infinite]",
                !isComplete &&
                  !isActive &&
                  "border-muted-foreground/20 bg-muted/40 text-muted-foreground"
              )}
            >
              {isComplete ? (
                <Check
                  className="h-4 w-4 motion-safe:animate-[upload-check-pop_0.45s_ease-out]"
                  aria-hidden
                />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-4 w-4" aria-hidden />
              )}
            </div>
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                isActive ? "text-primary" : isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function UploadProgressBar({
  value,
  shimmering,
}: {
  value: number;
  shimmering: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-primary/15">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-primary/70 transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
      {shimmering && clamped > 0 && clamped < 100 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-[upload-shimmer_1.6s_ease-in-out_infinite]"
          style={{ width: `${clamped}%` }}
        />
      ) : null}
    </div>
  );
}

export interface DocumentUploadProgressProps {
  phase: UploadPhase;
  progress: number;
  statusLabel: string;
  filesProcessed: number;
  filesTotal: number;
  currentWave: number;
  totalWaves: number;
  bytesUploaded: number;
  bytesTotal: number;
}

export function DocumentUploadProgressPanel({
  phase,
  progress,
  statusLabel,
  filesProcessed,
  filesTotal,
  currentWave,
  totalWaves,
  bytesUploaded,
  bytesTotal,
}: DocumentUploadProgressProps) {
  const showBytes = phase === "uploading" || phase === "confirming";

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-4 duration-300">
      <DocumentUploadAnimationStyles />
      <UploadPhaseStepper phase={phase} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{statusLabel}</p>
          <span className="tabular-nums text-sm font-semibold text-primary">{progress}%</span>
        </div>
        <UploadProgressBar
          value={progress}
          shimmering={phase !== "complete" && phase !== "idle"}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground tabular-nums">
            {filesProcessed.toLocaleString()}
          </span>
          {" / "}
          <span className="tabular-nums">{filesTotal.toLocaleString()}</span> files
        </span>
        {totalWaves > 1 ? (
          <span>
            Batch{" "}
            <span className="font-medium text-foreground tabular-nums">{currentWave}</span>
            {" / "}
            <span className="tabular-nums">{totalWaves}</span>
          </span>
        ) : null}
        {showBytes && bytesTotal > 0 ? (
          <span>
            <span className="font-medium text-foreground tabular-nums">
              {formatUploadBytes(bytesUploaded)}
            </span>
            {" / "}
            {formatUploadBytes(bytesTotal)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export interface UploadSummaryProps {
  success: string | null;
  summary: {
    confirmed: number;
    failed: number;
    alreadyUploaded: number;
  };
  alreadyUploaded: string[];
  failures: { file_name: string; error: string }[];
  onDownloadFailures: () => void;
}

export function DocumentUploadSummary({
  success,
  summary,
  alreadyUploaded,
  failures,
  onDownloadFailures,
}: UploadSummaryProps) {
  const allSuccess = summary.failed === 0;

  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 space-y-3 rounded-xl border p-4 duration-300",
        allSuccess
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card"
          : "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card"
      )}
    >
      <DocumentUploadAnimationStyles />
      <div className="flex items-start gap-3">
        {allSuccess ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 motion-safe:animate-[upload-check-pop_0.45s_ease-out] dark:text-emerald-400" />
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
            <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{success}</p>
          <p className="text-xs text-muted-foreground">
            Confirmed files are queued for ID extraction.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div
          className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-center duration-300 fill-mode-both [animation-delay:80ms]"
        >
          <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {summary.confirmed.toLocaleString()}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Confirmed
          </p>
        </div>
        <div
          className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg bg-sky-500/10 px-3 py-2.5 text-center duration-300 fill-mode-both [animation-delay:160ms]"
        >
          <p className="text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-400">
            {summary.alreadyUploaded.toLocaleString()}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Already there
          </p>
        </div>
        <div
          className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-center duration-300 fill-mode-both [animation-delay:240ms]"
        >
          <p className="text-lg font-semibold tabular-nums text-destructive">
            {summary.failed.toLocaleString()}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Failed
          </p>
        </div>
      </div>

      {alreadyUploaded.length > 0 && (
        <details className="animate-in fade-in-0 rounded-lg border bg-muted/20 px-3 py-2 text-xs duration-200">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            {alreadyUploaded.length.toLocaleString()} already uploaded
          </summary>
          <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-muted-foreground">
            {alreadyUploaded.slice(0, 20).map((name, i) => (
              <div key={`${name}-${i}`} className="truncate">
                {name}
              </div>
            ))}
            {alreadyUploaded.length > 20 && (
              <div>…and {(alreadyUploaded.length - 20).toLocaleString()} more</div>
            )}
          </div>
        </details>
      )}

      {failures.length > 0 && (
        <div className="animate-in fade-in-0 space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 duration-200">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-destructive">
              {failures.length.toLocaleString()} file(s) need attention
            </p>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted"
              onClick={onDownloadFailures}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {failures.slice(0, 12).map((f, i) => (
              <div key={`${f.file_name}-${i}`} className="truncate">
                <span className="font-medium text-foreground/80">{f.file_name}</span>
                {" — "}
                {f.error}
              </div>
            ))}
            {failures.length > 12 && (
              <div>…and {(failures.length - 12).toLocaleString()} more in the CSV</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
