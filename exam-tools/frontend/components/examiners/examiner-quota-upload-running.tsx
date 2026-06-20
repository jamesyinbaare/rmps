"use client";

import { CheckCircle2, FileSpreadsheet, Layers, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Reading spreadsheet rows", icon: FileSpreadsheet },
  { label: "Matching regions and roles", icon: MapPin },
  { label: "Checking regional group caps", icon: Layers },
  { label: "Evaluating gender limits", icon: Users },
  { label: "Building quota report", icon: CheckCircle2 },
] as const;

const MOCK_BARS = [
  { label: "Group A", delay: "0s" },
  { label: "Group B", delay: "0.35s" },
  { label: "Group C", delay: "0.7s" },
] as const;

type Props = {
  fileName: string;
  subjectLabel: string;
};

export function ExaminerQuotaUploadRunningView({ fileName, subjectLabel }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % STEPS.length);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const activeStep = STEPS[stepIndex];
  const ActiveIcon = activeStep.icon;

  return (
    <>
      <style>{`
        @keyframes quota-upload-scan {
          0% { top: 0.5rem; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { top: calc(100% - 2.5rem); opacity: 0; }
        }
        @keyframes quota-upload-shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes quota-upload-bar {
          0%, 100% { width: 22%; opacity: 0.55; }
          50% { width: 78%; opacity: 1; }
        }
        @keyframes quota-upload-orbit {
          from { transform: rotate(0deg) translateX(2rem) rotate(0deg); }
          to { transform: rotate(360deg) translateX(2rem) rotate(-360deg); }
        }
        @keyframes quota-upload-pulse-ring {
          0% { transform: scale(0.92); opacity: 0.45; }
          50% { transform: scale(1.06); opacity: 0.15; }
          100% { transform: scale(0.92); opacity: 0.45; }
        }
      `}</style>

      <div
        className="relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-br from-primary/6 via-background to-muted/20 px-4 py-8 sm:px-8 sm:py-10"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Running quota assessment"
      >
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden
        >
          <div
            className="absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-primary/10 to-transparent"
            style={{ animation: "quota-upload-shimmer 2.4s ease-in-out infinite" }}
          />
        </div>

        <div className="relative mx-auto flex max-w-lg flex-col items-center text-center">
          <div className="relative mb-6 flex size-28 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full border border-primary/20"
              style={{ animation: "quota-upload-pulse-ring 2.4s ease-in-out infinite" }}
            />
            <div
              className="absolute inset-2 rounded-full border border-primary/15"
              style={{ animation: "quota-upload-pulse-ring 2.4s ease-in-out infinite 0.4s" }}
            />
            <div className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/30 bg-background shadow-lg shadow-primary/10">
              <FileSpreadsheet className="size-8 text-primary" aria-hidden />
            </div>
            <div
              className="absolute size-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
              style={{ animation: "quota-upload-orbit 3s linear infinite" }}
            />
            <div
              className="absolute size-1.5 rounded-full bg-emerald-500/80"
              style={{ animation: "quota-upload-orbit 3s linear infinite 1s" }}
            />
          </div>

          <div className="relative mb-6 w-full max-w-xs rounded-xl border border-border/80 bg-background/90 p-3 shadow-sm backdrop-blur-sm">
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "h-2 rounded-full bg-muted",
                      row === 0 ? "w-3" : "w-2",
                    )}
                    style={{ animationDelay: `${row * 120}ms` }}
                  />
                  <div
                    className="h-2 flex-1 rounded-full bg-muted/80 animate-pulse"
                    style={{ animationDelay: `${row * 120}ms`, animationDuration: "1.6s" }}
                  />
                  <div
                    className="h-2 w-6 rounded-full bg-muted/60 animate-pulse"
                    style={{ animationDelay: `${row * 120 + 60}ms`, animationDuration: "1.6s" }}
                  />
                </div>
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-x-2 h-8 rounded-md bg-linear-to-b from-primary/0 via-primary/20 to-primary/0"
              style={{ animation: "quota-upload-scan 2.2s ease-in-out infinite" }}
            />
          </div>

          <div className="min-h-[4.5rem] w-full space-y-2">
            <div
              key={stepIndex}
              className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-sm font-medium text-foreground">
                <ActiveIcon className="size-4 text-primary motion-safe:animate-pulse" aria-hidden />
                {activeStep.label}
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="size-1 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                </span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Checking <span className="font-medium text-foreground">{fileName}</span> against caps for{" "}
              <span className="font-medium text-foreground">{subjectLabel}</span>
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
            {STEPS.map((step, index) => (
              <div
                key={step.label}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  index === stepIndex ? "w-6 bg-primary" : index < stepIndex ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted",
                )}
              />
            ))}
          </div>

          <div className="mt-8 grid w-full max-w-sm gap-2.5">
            {MOCK_BARS.map((bar) => (
              <div key={bar.label} className="flex items-center gap-3 text-left">
                <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {bar.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/80">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-emerald-500/70 via-primary/80 to-amber-500/70"
                    style={{
                      animation: "quota-upload-bar 2.2s ease-in-out infinite",
                      animationDelay: bar.delay,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">Dry run only — nothing is saved to the roster.</p>
        </div>
      </div>
    </>
  );
}
