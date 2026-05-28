"use client";

import { useEffect, useId } from "react";

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnPrimary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

export type DiscardChangesConfirmModalProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

export function DiscardChangesConfirmModal({ onCancel, onConfirm }: DiscardChangesConfirmModalProps) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Keep editing"
        className="absolute inset-0 bg-foreground/40"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
          Discard changes?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You have unsaved changes. If you leave now, they will be lost.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel}>
            Keep editing
          </button>
          <button type="button" className={btnPrimary} onClick={onConfirm}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
