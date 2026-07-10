"use client";

import { useId, useState } from "react";

import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { INPUT_FOCUS_RING } from "@/components/examiners/constants";
import { Button } from "@/components/ui/button";
import {
  EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS,
  type ExaminerAllowanceOptionalExportField,
} from "@/lib/examiner-allowance-export-fields";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  onConfirm: (fields: ExaminerAllowanceOptionalExportField[]) => void;
};

export function ExaminerAllowanceExportFieldsDialog({ open, onClose, busy, onConfirm }: Props) {
  const listId = useId();
  const [selected, setSelected] = useState<Record<ExaminerAllowanceOptionalExportField, boolean>>({
    subject_names: false,
    travel_zone: false,
  });

  function toggle(key: ExaminerAllowanceOptionalExportField, checked: boolean) {
    setSelected((prev) => ({ ...prev, [key]: checked }));
  }

  function handleConfirm() {
    const fields = EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS.filter((f) => selected[f.key]).map(
      (f) => f.key,
    );
    onConfirm(fields);
  }

  return (
    <CohortModalShell
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      title="Export Excel"
      description="Core identity, bank, and payout columns are always included. Optionally add:"
      className="h-auto max-h-[min(90vh,28rem)] max-w-md"
      footer={
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={handleConfirm}>
            {busy ? "Preparing…" : "Download"}
          </Button>
        </>
      }
    >
      <div id={listId} className="space-y-3">
        {EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS.map((field) => (
          <label key={field.key} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className={cn("mt-0.5 size-4 shrink-0 rounded border-border", INPUT_FOCUS_RING)}
              checked={selected[field.key]}
              disabled={busy}
              onChange={(e) => toggle(field.key, e.target.checked)}
            />
            <span>
              <span className="font-medium text-foreground">{field.label}</span>
              {field.hint ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">{field.hint}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </CohortModalShell>
  );
}
