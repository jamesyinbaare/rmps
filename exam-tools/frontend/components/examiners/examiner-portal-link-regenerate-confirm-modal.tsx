"use client";

import { useEffect, useId, useState } from "react";

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnDestructive =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-destructive px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

type Props = {
  subjectName: string;
  showSendSmsOption?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (options: { sendSms: boolean }) => void;
};

export function ExaminerPortalLinkRegenerateConfirmModal({
  subjectName,
  showSendSmsOption = false,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [sendSms, setSendSms] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel link regeneration"
        className="absolute inset-0 bg-foreground/40"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
          Generate new portal link?
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            The current portal link for <span className="font-medium text-foreground">{subjectName}</span>{" "}
            will stop working immediately. Anyone with the old link will lose access to the examiner
            portal.
          </p>
          <p>Share the new link only with the intended examiner.</p>
          {showSendSmsOption ? (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={sendSms}
                disabled={busy}
                onChange={(e) => setSendSms(e.target.checked)}
              />
              <span>Send the new link by SMS</span>
            </label>
          ) : null}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={btnDestructive}
            disabled={busy}
            onClick={() => onConfirm({ sendSms })}
          >
            {busy ? "Generating…" : "Generate new link"}
          </button>
        </div>
      </div>
    </div>
  );
}
