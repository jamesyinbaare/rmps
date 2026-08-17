"use client";

import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { ExaminerAllowanceIncludeExcludeLists } from "@/components/examiner-accounts/examiner-allowance-include-exclude-lists";
import { Button } from "@/components/ui/button";
import {
  EXAMINER_ALLOWANCE_DOWNLOAD_COPY,
  type ExaminerAllowanceDownloadKind,
} from "@/lib/examiner-allowance-download-copy";

export type ExaminerAllowanceDownloadScope = {
  examinationLabel: string;
  subjectLabel?: string | null;
  paperNumber?: number | null;
  cohortLabel?: string | null;
  regionLabel?: string | null;
  examinerCount: number;
};

type Props = {
  open: boolean;
  kind: ExaminerAllowanceDownloadKind | null;
  scope: ExaminerAllowanceDownloadScope | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ExaminerAllowanceDownloadConfirmDialog({
  open,
  kind,
  scope,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const copy = kind ? EXAMINER_ALLOWANCE_DOWNLOAD_COPY[kind] : null;

  const scopeBits = scope
    ? [
        scope.examinationLabel,
        scope.subjectLabel,
        scope.paperNumber != null ? `Paper ${scope.paperNumber}` : null,
        scope.cohortLabel,
        scope.regionLabel,
        `${scope.examinerCount.toLocaleString()} examiner${scope.examinerCount === 1 ? "" : "s"}`,
      ].filter(Boolean)
    : [];

  return (
    <CohortModalShell
      open={open && kind != null && copy != null}
      onClose={onClose}
      closeDisabled={busy}
      title={copy?.title ?? "Confirm download"}
      description="Check what this file contains, then confirm to download."
      className="h-auto max-h-none max-w-xl overflow-visible"
      headerClassName="py-3"
      bodyClassName="flex-none overflow-visible py-3 sm:py-3.5"
      footerClassName="py-3"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !kind} onClick={onConfirm}>
            {busy ? "Preparing…" : "Confirm download"}
          </Button>
        </div>
      }
    >
      {copy ? (
        <div className="space-y-3 text-sm">
          {scopeBits.length > 0 ? (
            <p className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{scopeBits[0]}</span>
              {scopeBits.slice(1).map((bit) => (
                <span key={String(bit)}>
                  <span className="mx-1.5 text-border">·</span>
                  {bit}
                </span>
              ))}
            </p>
          ) : null}

          <p className="text-sm leading-snug text-foreground">{copy.summary}</p>

          <ExaminerAllowanceIncludeExcludeLists
            includes={copy.includes}
            excludes={copy.excludes}
            includeHeading="Included"
            excludeHeading="Not included"
          />

          <p className="text-xs leading-snug text-muted-foreground">{copy.formatNote}</p>
        </div>
      ) : null}
    </CohortModalShell>
  );
}
