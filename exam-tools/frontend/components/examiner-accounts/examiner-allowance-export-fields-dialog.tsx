"use client";

import { useId, useState } from "react";

import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { ExaminerAllowanceIncludeExcludeLists } from "@/components/examiner-accounts/examiner-allowance-include-exclude-lists";
import { INPUT_FOCUS_RING } from "@/components/examiners/constants";
import { Button } from "@/components/ui/button";
import type { ExaminerAllowanceDownloadScope } from "@/components/examiner-accounts/examiner-allowance-download-confirm-dialog";
import { EXAMINER_ALLOWANCE_DOWNLOAD_COPY } from "@/lib/examiner-allowance-download-copy";
import {
  EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS,
  type ExaminerAllowanceOptionalExportField,
} from "@/lib/examiner-allowance-export-fields";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  scope?: ExaminerAllowanceDownloadScope | null;
  onConfirm: (fields: ExaminerAllowanceOptionalExportField[]) => void;
};

export function ExaminerAllowanceExportFieldsDialog({
  open,
  onClose,
  busy,
  scope,
  onConfirm,
}: Props) {
  const listId = useId();
  const copy = EXAMINER_ALLOWANCE_DOWNLOAD_COPY.excel;
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
      title={copy.title}
      description="Check what this file contains, optionally add columns, then confirm to download."
      className="h-auto max-h-none max-w-xl overflow-visible"
      headerClassName="py-3"
      bodyClassName="flex-none overflow-visible py-3 sm:py-3.5"
      footerClassName="py-3"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={handleConfirm}>
            {busy ? "Preparing…" : "Confirm download"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {scope ? (
          <p className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{scope.examinationLabel}</span>
            {scope.subjectLabel ? (
              <>
                <span className="mx-1.5 text-border">·</span>
                {scope.subjectLabel}
              </>
            ) : null}
            {scope.paperNumber != null ? (
              <>
                <span className="mx-1.5 text-border">·</span>
                Paper {scope.paperNumber}
              </>
            ) : null}
            <span className="mx-1.5 text-border">·</span>
            {scope.examinerCount.toLocaleString()} examiner
            {scope.examinerCount === 1 ? "" : "s"}
          </p>
        ) : null}

        <p className="text-sm leading-snug text-foreground">{copy.summary}</p>

        <ExaminerAllowanceIncludeExcludeLists
          includes={copy.includes}
          includeHeading="Always included"
        />

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Optional columns
          </p>
          <div id={listId} className="grid gap-2 sm:grid-cols-2">
            {EXAMINER_ALLOWANCE_OPTIONAL_EXPORT_FIELDS.map((field) => (
              <label key={field.key} className="flex cursor-pointer items-start gap-2 text-sm">
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
        </div>
      </div>
    </CohortModalShell>
  );
}
