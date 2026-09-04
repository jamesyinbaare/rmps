"use client";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import type { AdminExaminerAllowanceRow } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";

type Props = {
  open: boolean;
  row: AdminExaminerAllowanceRow | null;
  busy: boolean;
  error: string | null;
  value: string;
  onClose: () => void;
  onSubmit: () => void;
  onValueChange: (v: string) => void;
};

export function ExaminerCeReportCountModal({
  open,
  row,
  busy,
  error,
  value,
  onClose,
  onSubmit,
  onValueChange,
}: Props) {
  if (!open || !row) return null;

  const isAe = row.examiner_type === "assistant_examiner";

  return (
    <OfficialModal
      title="Report allowance count"
      subtitle={row.full_name}
      titleId="ce-report-count-title"
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
      <label className={formLabelClass} htmlFor="ce-report-count">
        Number of reports (multiplies reporting allowance)
      </label>
      <input
        id="ce-report-count"
        type="number"
        min={0}
        step={1}
        className={formInputClass}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {isAe
          ? "Assistant examiners default to 0. Any examiner can be set to any number ≥ 0."
          : "CE, ACE, and TL default to 1. Any examiner can be set to any number ≥ 0."}
      </p>
    </OfficialModal>
  );
}
