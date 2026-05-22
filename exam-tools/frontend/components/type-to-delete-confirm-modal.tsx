"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { formInputClass, formLabelClass } from "@/lib/form-classes";

export const DELETE_CONFIRMATION_WORD = "delete";

export function isDeleteConfirmationValid(value: string): boolean {
  return value.trim().toLowerCase() === DELETE_CONFIRMATION_WORD;
}

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnDanger =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

export type TypeToDeleteConfirmModalProps = {
  title: string;
  titleId?: string;
  description: ReactNode;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmButtonLabel?: string;
};

export function TypeToDeleteConfirmModal({
  title,
  titleId: titleIdProp,
  description,
  children,
  onCancel,
  onConfirm,
  busy = false,
  confirmButtonLabel = "Delete",
}: TypeToDeleteConfirmModalProps) {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;
  const inputId = useId();
  const [confirmText, setConfirmText] = useState("");

  const canConfirm = isDeleteConfirmationValid(confirmText) && !busy;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-foreground/40"
        onClick={() => !busy && onCancel()}
        disabled={busy}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted-foreground">{description}</div>
        {children ? <div className="mt-3">{children}</div> : null}
        <div className="mt-4">
          <label className={formLabelClass} htmlFor={inputId}>
            Type <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRMATION_WORD}</span> to
            confirm
          </label>
          <input
            id={inputId}
            className={formInputClass}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={DELETE_CONFIRMATION_WORD}
            disabled={busy}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 max-sm:pb-[max(0px,env(safe-area-inset-bottom,0px))] sm:flex-row sm:justify-end">
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={btnDanger} onClick={onConfirm} disabled={!canConfirm}>
            {busy ? "Deleting…" : confirmButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
