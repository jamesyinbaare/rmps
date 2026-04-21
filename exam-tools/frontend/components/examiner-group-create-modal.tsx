"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export type ExaminerGroupCreateModalProps = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  /** Server or validation message */
  error: string | null;
  regionOptions: { value: string; label: string }[];
  zIndexClass?: string;
  onCreate: (name: string, sourceRegions: string[]) => Promise<string | null>;
};

export function ExaminerGroupCreateModal({
  open,
  onClose,
  busy,
  error,
  regionOptions,
  zIndexClass = "z-50",
  onCreate,
}: ExaminerGroupCreateModalProps) {
  const [name, setName] = useState("");
  const [regionDraft, setRegionDraft] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setRegionDraft({});
      setLocalError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const combinedError = localError ?? error;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/50 p-4`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && !submitting) onClose();
      }}
    >
      <div
        className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eg-create-title"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <h2 id="eg-create-title" className="text-base font-semibold text-card-foreground">
          Create marking group
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose examiner <strong className="font-medium text-foreground">home</strong> regions for this cohort. Every
          roster examiner whose home region you select is added to the group. For the solver, scripts from schools in those
          same regions count as this cohort&apos;s scripts. Each region can belong to only one group per examination.
        </p>
        {combinedError ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {combinedError}
          </p>
        ) : null}
        <div className="mt-4 space-y-4">
          <div>
            <label className={formLabelClass} htmlFor="eg-create-name">
              Group name
            </label>
            <input
              id="eg-create-name"
              className={`${formInputClass} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Northern cohort"
              disabled={busy || submitting}
            />
          </div>
          <div>
            <p className={formLabelClass}>Examiner home regions (cohort)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Select at least one home region. Members are assigned automatically.</p>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {regionOptions.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={`shrink-0 rounded border-border ${inputFocusRing}`}
                    checked={regionDraft[r.value] ?? false}
                    disabled={busy || submitting}
                    onChange={(e) =>
                      setRegionDraft((prev) => ({ ...prev, [r.value]: e.target.checked }))
                    }
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={busy || submitting}
            onClick={() => {
              setLocalError(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || submitting || !name.trim()}
            onClick={() => {
              void (async () => {
                setLocalError(null);
                const regs = Object.entries(regionDraft)
                  .filter(([, v]) => v)
                  .map(([k]) => k);
                if (regs.length === 0) {
                  setLocalError("Select at least one examiner home region.");
                  return;
                }
                setSubmitting(true);
                try {
                  const err = await onCreate(name.trim(), regs);
                  if (err) {
                    setLocalError(err);
                    return;
                  }
                  onClose();
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
          >
            Create group
          </Button>
        </div>
      </div>
    </div>
  );
}
