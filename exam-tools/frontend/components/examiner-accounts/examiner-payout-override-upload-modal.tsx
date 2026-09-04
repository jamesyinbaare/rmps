"use client";

import { InvitationModalShell } from "@/components/examiner-invitations/invitation-modal-shell";
import type { ExaminerPayoutOverrideBulkImportResponse } from "@/lib/api";
import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";

type Props = {
  contextLabel?: string | null;
  open: boolean;
  busy: boolean;
  error: string | null;
  result: ExaminerPayoutOverrideBulkImportResponse | null;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onFileSelected: (file: File) => void;
};

export function ExaminerPayoutOverrideUploadModal({
  contextLabel,
  open,
  busy,
  error,
  result,
  onClose,
  onDownloadTemplate,
  onFileSelected,
}: Props) {
  if (!open) return null;

  return (
    <InvitationModalShell
      title="Upload special examiners"
      titleId="payout-override-upload-title"
      onClose={onClose}
      canClose={!busy}
      footer={
        <button type="button" className={officialAccountsBtnSecondary} onClick={onClose} disabled={busy}>
          {result ? "Close" : "Cancel"}
        </button>
      }
    >
      {contextLabel ? (
        <p className="text-sm font-medium text-foreground">{contextLabel}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        For examiners who did not go through invitation. Columns: <span className="font-mono">name</span>,{" "}
        <span className="font-mono">examiner_type</span>, <span className="font-mono">region</span>,{" "}
        <span className="font-mono">bank_code</span>, <span className="font-mono">account_number</span>, optional{" "}
        <span className="font-mono">description</span>, <span className="font-mono">paper_1_allocation</span> and/or{" "}
        <span className="font-mono">paper_2_allocation</span> (at least one required), optional{" "}
        <span className="font-mono">report_count</span> (CE/ACE/TL default 1; AE default 0). Marking
        uses exam-wide default Paper 1 / Paper 2 rates. Phone is not required.
      </p>
      <div className="mt-3">
        <button type="button" className={officialAccountsBtnSecondary} disabled={busy} onClick={onDownloadTemplate}>
          Download Excel template
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-4">
        <input
          type="file"
          accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={busy}
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFileSelected(f);
          }}
        />
      </div>
      {result ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">
            Created {result.created_count}, updated {result.updated_count}.
          </p>
          {result.errors.length ? (
            <ul className="mt-2 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs text-destructive">
              {result.errors.map((err, i) => (
                <li key={`${err.row_number}-${i}`}>
                  Row {err.row_number}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </InvitationModalShell>
  );
}
