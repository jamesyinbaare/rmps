"use client";

import { InvitationModalShell } from "@/components/examiner-invitations/invitation-modal-shell";
import type { AdminExaminerAllowanceRow } from "@/lib/api";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";

type Props = {
  row: AdminExaminerAllowanceRow | null;
  description: string;
  paper1: string;
  paper2: string;
  busy: boolean;
  error: string | null;
  onDescriptionChange: (value: string) => void;
  onPaper1Change: (value: string) => void;
  onPaper2Change: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function ExaminerSpecialAllocationModal({
  row,
  description,
  paper1,
  paper2,
  busy,
  error,
  onDescriptionChange,
  onPaper1Change,
  onPaper2Change,
  onClose,
  onSubmit,
}: Props) {
  if (!row) return null;

  return (
    <InvitationModalShell
      title="Edit special examiner allocation"
      titleId="special-allocation-title"
      onClose={onClose}
      canClose={!busy}
      footer={
        <>
          <button type="button" className={officialAccountsBtnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={officialAccountsBtnPrimary} onClick={onSubmit} disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {row.full_name} · marking uses exam-wide default Paper 1 / Paper 2 rates.
      </p>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Description</span>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm"
            value={description}
            maxLength={200}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Short label for this special examiner"
            disabled={busy}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Paper 1 scripts</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm tabular-nums"
            value={paper1}
            onChange={(e) => onPaper1Change(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Paper 2 scripts</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm tabular-nums"
            value={paper2}
            onChange={(e) => onPaper2Change(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </InvitationModalShell>
  );
}
