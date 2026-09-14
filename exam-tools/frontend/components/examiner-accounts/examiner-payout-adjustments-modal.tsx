"use client";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import type { AdminExaminerAllowanceRow, ExaminerPayoutAdjustmentRow } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";

export type PayoutAdjustmentDraft = {
  key: string;
  description: string;
  amount: string;
  is_taxable: boolean;
};

type Props = {
  open: boolean;
  row: AdminExaminerAllowanceRow | null;
  busy: boolean;
  error: string | null;
  lines: PayoutAdjustmentDraft[];
  onClose: () => void;
  onSubmit: () => void;
  onLinesChange: (lines: PayoutAdjustmentDraft[]) => void;
};

function newDraftLine(): PayoutAdjustmentDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    amount: "",
    is_taxable: false,
  };
}

export function draftsFromAdjustmentRows(rows: ExaminerPayoutAdjustmentRow[] | undefined): PayoutAdjustmentDraft[] {
  if (!rows?.length) return [];
  return rows
    .filter((row) => (row.source ?? "examiner") === "examiner")
    .map((row) => ({
      key: row.id ?? crypto.randomUUID(),
      description: row.description,
      amount: String(row.amount_ghs ?? ""),
      is_taxable: Boolean(row.is_taxable),
    }));
}

export function groupAdjustmentRows(
  rows: ExaminerPayoutAdjustmentRow[] | undefined,
): ExaminerPayoutAdjustmentRow[] {
  if (!rows?.length) return [];
  return rows.filter((row) => row.source === "group");
}

export function ExaminerPayoutAdjustmentsModal({
  open,
  row,
  busy,
  error,
  lines,
  onClose,
  onSubmit,
  onLinesChange,
}: Props) {
  if (!open || !row) return null;

  const groupLines = groupAdjustmentRows(row.payout_adjustments);

  function updateLine(key: string, patch: Partial<PayoutAdjustmentDraft>) {
    onLinesChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onLinesChange(lines.filter((line) => line.key !== key));
  }

  return (
    <OfficialModal
      title="Payout adjustments"
      subtitle={row.full_name}
      titleId="payout-adjustments-title"
      onRequestClose={onClose}
      formError={error}
      footer={
        <div className={officialModalFooterClass()}>
          <button type="button" className={officialAccountsBtnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={officialAccountsBtnPrimary} onClick={onSubmit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Optional named amounts for this examiner only. Taxed lines use the same 10% withholding as marking. Group
        special allowances are managed under Examiner rates → Allowance groups.
      </p>
      {groupLines.length > 0 ? (
        <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">From allowance groups (read-only)</p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {groupLines.map((line, idx) => (
              <li key={line.id ?? `${line.description}-${idx}`}>
                {line.description}
                {line.group_name ? ` · ${line.group_name}` : ""}: {line.amount_ghs}
                {line.is_taxable ? " (taxed)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-3">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No personal adjustments. Add a line to include an amount in their payout.</p>
        ) : null}
        {lines.map((line, index) => (
          <div key={line.key} className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Line {index + 1}</p>
              <button
                type="button"
                className="text-xs text-destructive underline-offset-2 hover:underline"
                onClick={() => removeLine(line.key)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
            <label className={formLabelClass} htmlFor={`adj-desc-${line.key}`}>
              Description
            </label>
            <input
              id={`adj-desc-${line.key}`}
              className={formInputClass}
              value={line.description}
              maxLength={200}
              onChange={(e) => updateLine(line.key, { description: e.target.value })}
              disabled={busy}
            />
            <label className={formLabelClass} htmlFor={`adj-amt-${line.key}`}>
              Amount (GHS)
            </label>
            <input
              id={`adj-amt-${line.key}`}
              type="number"
              min={0.01}
              step="0.01"
              className={formInputClass}
              value={line.amount}
              onChange={(e) => updateLine(line.key, { amount: e.target.value })}
              disabled={busy}
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={line.is_taxable}
                onChange={(e) => updateLine(line.key, { is_taxable: e.target.checked })}
                disabled={busy}
              />
              Taxed (10% withholding)
            </label>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${officialAccountsBtnSecondary} mt-3`}
        onClick={() => onLinesChange([...lines, newDraftLine()])}
        disabled={busy}
      >
        Add line
      </button>
    </OfficialModal>
  );
}
