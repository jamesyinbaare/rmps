"use client";

import { useEffect, useId } from "react";

const btnSecondary =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";
const btnDestructive =
  "inline-flex min-h-11 w-full min-w-[44px] items-center justify-center rounded-lg bg-destructive px-3 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:min-h-10 sm:w-auto";

type Props = {
  rosterTotal: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ExaminerReferenceCodesRegenerateConfirmModal({
  rosterTotal,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel regeneration"
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
          Regenerate all reference codes?
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            This will replace every reference code on this examination&apos;s roster (
            {rosterTotal.toLocaleString()} examiner{rosterTotal === 1 ? "" : "s"}).
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>New codes use the saved region groups and each examiner&apos;s current home region and role.</li>
            <li>Sequences restart per subject, group, and role (e.g. MATH301-NAE1, MATH301-NAE2, …).</li>
            <li>Printed or exported materials that use old codes may no longer match.</li>
          </ul>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={btnDestructive} disabled={busy} onClick={onConfirm}>
            {busy ? "Regenerating…" : "Regenerate all codes"}
          </button>
        </div>
      </div>
    </div>
  );
}
