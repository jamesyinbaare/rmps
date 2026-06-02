"use client";

import { X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  centreLabel: string;
  scopeLabel: string;
  icon: LucideIcon;
  iconClassName?: string;
  headerAccentClassName?: string;
  contentClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function CentreSummaryDetailModal({
  open,
  onClose,
  title,
  centreLabel,
  scopeLabel,
  icon: Icon,
  iconClassName = "bg-primary/10 text-primary",
  headerAccentClassName = "from-primary/15 via-card to-card",
  contentClassName,
  footer,
  children,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-foreground/55 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[min(32rem,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border/80 bg-card shadow-2xl ring-1 ring-black/[0.06] outline-none dark:ring-white/[0.08] sm:max-h-[min(28rem,85vh)] sm:rounded-2xl"
      >
        <div
          className={cn(
            "relative border-b border-border/70 bg-gradient-to-br px-4 pb-4 pt-4 sm:px-5 sm:pt-5",
            headerAccentClassName,
          )}
        >
          <div
            className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/[0.07] blur-2xl"
            aria-hidden
          />
          <div className="flex items-start gap-3 pr-8">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-border/50",
                iconClassName,
              )}
            >
              <Icon className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
                <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {scopeLabel}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground" title={centreLabel}>
                {centreLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5", contentClassName)}>{children}</div>

        {footer ? (
          <div className="border-t border-border/70 bg-muted/25 px-4 py-3.5 sm:px-5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function CentreSummaryModalPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/60 bg-muted/10", className)}>
      {children}
    </div>
  );
}

export function CentreSummaryModalEmpty({ message }: { message: string }) {
  return <p className="py-12 text-center text-sm leading-relaxed text-muted-foreground">{message}</p>;
}

export function CentreSummaryModalLoading({ message }: { message: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      {message}
    </p>
  );
}
