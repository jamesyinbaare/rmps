"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const MODAL_ANIMATION_MS = 200;

type CohortModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeDisabled?: boolean;
  /** When set, backdrop / X / Escape call this instead of onClose (e.g. dirty-state guard). */
  onCloseAttempt?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
};

export function CohortModalShell({
  open,
  onClose,
  title,
  description,
  closeDisabled = false,
  onCloseAttempt,
  footer,
  children,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
}: CohortModalShellProps) {
  const titleId = useId();
  const requestClose = onCloseAttempt ?? onClose;

  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, MODAL_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDisabled, mounted, requestClose]);

  if (!mounted) return null;

  const entering = !closing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className={cn(
          "absolute inset-0 bg-foreground/50 backdrop-blur-[1px] motion-reduce:animate-none",
          entering
            ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
            : "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:duration-200",
        )}
        disabled={closeDisabled}
        onClick={() => {
          if (!closeDisabled) requestClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl motion-reduce:animate-none",
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary/60 before:content-['']",
          entering
            ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
            : "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-95 motion-safe:slide-out-to-bottom-2 motion-safe:duration-200",
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6",
            headerClassName,
          )}
        >
          <div className="min-w-0 flex-1 pr-2">
            <h2 id={titleId} className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={closeDisabled}
            onClick={requestClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-5 sm:px-6", bodyClassName)}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>

        {footer ? (
          <div
            className={cn(
              "flex min-h-0 shrink-0 flex-col border-t border-border bg-card px-5 py-4 sm:px-6",
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
