"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { createPortal } from "react-dom";

import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export type ScanVerificationResultTone = "success" | "warning" | "error";

type Props = {
  open: boolean;
  tone: ScanVerificationResultTone;
  title: string;
  children?: ReactNode;
  onDismiss: () => void;
  autoDismissMs?: number;
  dismissLabel?: string;
};

const EXIT_MS = 220;

const toneConfig: Record<
  ScanVerificationResultTone,
  {
    icon: typeof CheckCircle2;
    accent: string;
    glow: string;
    panelBorder: string;
    headerBg: string;
    iconWrap: string;
    iconRing: string;
    titleColor: string;
    buttonRing: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    accent: "from-emerald-500 via-emerald-400 to-teal-400",
    glow: "shadow-emerald-500/20",
    panelBorder: "border-emerald-500/25",
    headerBg: "bg-linear-to-b from-emerald-500/10 via-emerald-500/5 to-transparent",
    iconWrap: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    iconRing: "ring-emerald-500/30",
    titleColor: "text-emerald-950 dark:text-emerald-50",
    buttonRing: "focus-visible:ring-emerald-500/40",
  },
  warning: {
    icon: AlertTriangle,
    accent: "from-amber-500 via-amber-400 to-orange-400",
    glow: "shadow-amber-500/20",
    panelBorder: "border-amber-500/25",
    headerBg: "bg-linear-to-b from-amber-500/10 via-amber-500/5 to-transparent",
    iconWrap: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    iconRing: "ring-amber-500/30",
    titleColor: "text-foreground",
    buttonRing: "focus-visible:ring-amber-500/40",
  },
  error: {
    icon: XCircle,
    accent: "from-destructive via-red-500 to-rose-500",
    glow: "shadow-destructive/25",
    panelBorder: "border-destructive/25",
    headerBg: "bg-linear-to-b from-destructive/10 via-destructive/5 to-transparent",
    iconWrap: "bg-destructive/15 text-destructive",
    iconRing: "ring-destructive/30",
    titleColor: "text-destructive",
    buttonRing: "focus-visible:ring-destructive/40",
  },
};

export function ScanVerifyingOverlay() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 motion-reduce:animate-none"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center gap-3 rounded-2xl border border-border/80 bg-card/95 px-5 py-3.5 text-sm font-medium text-foreground shadow-lg motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300 motion-reduce:animate-none">
        <span className="relative flex size-9 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-primary/20 motion-reduce:animate-none motion-safe:animate-ping" aria-hidden />
          <Loader2 className="relative size-5 animate-spin text-primary" aria-hidden />
        </span>
        Verifying scan…
      </div>
    </div>
  );
}

export function ScanVerificationResultOverlay({
  open,
  tone,
  title,
  children,
  onDismiss,
  autoDismissMs,
  dismissLabel = "Continue scanning",
}: Props) {
  const titleId = useId();
  const config = toneConfig[tone];
  const Icon = config.icon;
  const dismissRef = useRef(onDismiss);
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  dismissRef.current = onDismiss;

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    }
  }, [open]);

  const requestDismiss = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setVisible(false);
      dismissRef.current();
    }, EXIT_MS);
  }, [closing]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || closing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestDismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closing, requestDismiss, visible]);

  useEffect(() => {
    if (!visible || closing || autoDismissMs == null || autoDismissMs <= 0) return;
    const timer = window.setTimeout(requestDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, closing, requestDismiss, visible]);

  if (!visible) return null;

  const entering = !closing;
  const showAutoDismiss = autoDismissMs != null && autoDismissMs > 0 && tone === "success";

  return createPortal(
    <>
      <style>{`
        @keyframes scan-result-icon-pop {
          0% { transform: scale(0.72); opacity: 0; }
          55% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes scan-result-ring-pulse {
          0%, 100% { transform: scale(1); opacity: 0.45; }
          50% { transform: scale(1.12); opacity: 0.15; }
        }
        @keyframes scan-result-content-rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scan-result-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
      <div className="fixed inset-0 z-100 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Close dialog"
          className={cn(
            "absolute inset-0 bg-foreground/45 backdrop-blur-sm motion-reduce:animate-none",
            entering
              ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
              : "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:duration-200",
          )}
          onClick={requestDismiss}
        />
        <div
          role={tone === "success" ? "dialog" : "alertdialog"}
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "relative z-10 flex w-full max-w-md flex-col overflow-hidden border bg-card shadow-2xl motion-reduce:animate-none",
            "rounded-t-[1.75rem] sm:rounded-2xl",
            config.panelBorder,
            config.glow,
            entering
              ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 max-sm:motion-safe:slide-in-from-bottom sm:motion-safe:zoom-in-95 sm:motion-safe:slide-in-from-bottom-3"
              : "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:duration-200 max-sm:motion-safe:slide-out-to-bottom sm:motion-safe:zoom-out-95 sm:motion-safe:slide-out-to-bottom-3",
          )}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div
            className={cn("h-1 shrink-0 bg-linear-to-r", config.accent)}
            aria-hidden
          />
          {showAutoDismiss ? (
            <div className="h-0.5 shrink-0 overflow-hidden bg-muted/40" aria-hidden>
              <div
                className="h-full origin-left bg-linear-to-r from-emerald-500 to-teal-400 motion-reduce:animate-none"
                style={{
                  animation: `scan-result-progress ${autoDismissMs}ms linear forwards`,
                }}
              />
            </div>
          ) : null}

          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border/80 sm:hidden" aria-hidden />

          <div className={cn("px-5 pb-1 pt-5 sm:px-6 sm:pt-6", config.headerBg)}>
            <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
              <div className="relative mb-4 sm:mb-3">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full ring-4 motion-reduce:animate-none motion-safe:animate-[scan-result-ring-pulse_2s_ease-in-out_infinite]",
                    config.iconRing,
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "relative flex size-16 items-center justify-center rounded-full ring-4 motion-reduce:animate-none motion-safe:animate-[scan-result-icon-pop_420ms_cubic-bezier(0.34,1.56,0.64,1)_both]",
                    config.iconWrap,
                    config.iconRing,
                  )}
                >
                  <Icon className="size-8" strokeWidth={2.25} aria-hidden />
                </span>
              </div>
              <h2
                id={titleId}
                className={cn(
                  "text-xl font-semibold leading-snug tracking-tight motion-reduce:animate-none motion-safe:animate-[scan-result-content-rise_360ms_ease-out_120ms_both]",
                  config.titleColor,
                )}
              >
                {title}
              </h2>
            </div>
          </div>

          {children ? (
            <div
              className="px-5 py-4 text-sm motion-reduce:animate-none motion-safe:animate-[scan-result-content-rise_400ms_ease-out_180ms_both] sm:px-6"
            >
              {children}
            </div>
          ) : null}

          <div className="border-t border-border/70 px-5 py-4 motion-reduce:animate-none motion-safe:animate-[scan-result-content-rise_400ms_ease-out_240ms_both] sm:px-6">
            <button
              type="button"
              className={cn(
                officialAccountsBtnPrimary,
                "w-full shadow-sm transition-transform active:scale-[0.98] motion-reduce:transition-none",
                config.buttonRing,
              )}
              onClick={requestDismiss}
            >
              {dismissLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
