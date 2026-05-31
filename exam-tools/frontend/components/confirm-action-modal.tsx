"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useState } from "react";

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnPrimary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

export type ConfirmActionResult = {
  rememberChoice: boolean;
};

export type ConfirmActionModalProps = {
  title: string;
  messages: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  rememberOptionLabel?: string;
  onCancel: () => void;
  onConfirm: (result: ConfirmActionResult) => void;
};

export function ConfirmActionModal({
  title,
  messages,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  busy = false,
  rememberOptionLabel,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const titleId = useId();
  const descId = useId();
  const rememberId = useId();
  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    setRememberChoice(false);
  }, [title, messages.join("\n")]);

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={cancelLabel}
        className="absolute inset-0 bg-foreground/40"
        onClick={() => !busy && onCancel()}
        disabled={busy}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
              {title}
            </h2>
            <div id={descId} className="mt-2 space-y-2 text-sm text-muted-foreground">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          </div>
        </div>
        {rememberOptionLabel ? (
          <label
            htmlFor={rememberId}
            className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground"
          >
            <input
              id={rememberId}
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input-border accent-primary"
              checked={rememberChoice}
              disabled={busy}
              onChange={(e) => setRememberChoice(e.target.checked)}
            />
            <span>{rememberOptionLabel}</span>
          </label>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => onConfirm({ rememberChoice })}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function saveScriptControlConfirmMessages(meta: {
  hadVerified: boolean;
  hadEnvelopes: boolean;
}): string[] {
  const parts: string[] = [];
  if (meta.hadVerified) parts.push("Depot verification for this series will be cleared.");
  if (meta.hadEnvelopes) {
    parts.push(
      "If envelope totals change, existing script allocation assignments for this series may be removed.",
    );
  }
  return parts;
}

export const SCRIPT_CONTROL_SAVE_CONFIRM_TITLE = "Save updated counts?";
export const SCRIPT_CONTROL_SAVE_CONFIRM_REMEMBER_LABEL =
  "Don't show this warning again for this session";
