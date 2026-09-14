"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import type { AllowanceGroupAdjustmentRow, AllowanceGroupRow } from "@/lib/api";
import { putExaminationAllowanceGroupAdjustments } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";

type DraftLine = {
  key: string;
  description: string;
  amount: string;
  is_taxable: boolean;
};

function draftsFromRows(rows: AllowanceGroupAdjustmentRow[] | undefined): DraftLine[] {
  if (!rows?.length) return [];
  return rows.map((row) => ({
    key: row.id ?? crypto.randomUUID(),
    description: row.description,
    amount: String(row.amount_ghs ?? ""),
    is_taxable: Boolean(row.is_taxable),
  }));
}

function newDraftLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    description: "",
    amount: "",
    is_taxable: false,
  };
}

type Props = {
  examinationId: number;
  group: AllowanceGroupRow;
  canEdit: boolean;
  onSaved: (group: AllowanceGroupRow) => void;
};

export function ExaminerRatesGroupAdjustments({
  examinationId,
  group,
  canEdit,
  onSaved,
}: Props) {
  const [lines, setLines] = useState<DraftLine[]>(() => draftsFromRows(group.adjustments));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines(draftsFromRows(group.adjustments));
    setError(null);
  }, [group.id, group.adjustments]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save() {
    const payload: { description: string; amount_ghs: string; is_taxable: boolean }[] = [];
    for (const line of lines) {
      const description = line.description.trim();
      const amount = Number.parseFloat(line.amount);
      if (!description && !line.amount.trim()) continue;
      if (!description) {
        setError("Each special allowance needs a description.");
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Each special allowance amount must be greater than 0.");
        return;
      }
      payload.push({
        description,
        amount_ghs: amount.toFixed(2),
        is_taxable: line.is_taxable,
      });
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await putExaminationAllowanceGroupAdjustments(
        examinationId,
        group.id,
        payload,
      );
      onSaved(updated);
      setLines(draftsFromRows(updated.adjustments));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <h3 className="text-sm font-medium text-foreground">Special allowances</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Named amounts for members of {group.name}. Applied live: leaving the group removes them; rejoining
        restores them. Super Admin only.
      </p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 space-y-3">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No special allowances on this group.</p>
        ) : null}
        {lines.map((line, index) => (
          <div key={line.key} className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Line {index + 1}</p>
              {canEdit ? (
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-2 hover:underline"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  disabled={busy}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <label className={formLabelClass} htmlFor={`group-adj-desc-${line.key}`}>
              Description
            </label>
            <input
              id={`group-adj-desc-${line.key}`}
              className={formInputClass}
              value={line.description}
              maxLength={200}
              onChange={(e) => updateLine(line.key, { description: e.target.value })}
              disabled={!canEdit || busy}
            />
            <label className={formLabelClass} htmlFor={`group-adj-amt-${line.key}`}>
              Amount (GHS)
            </label>
            <input
              id={`group-adj-amt-${line.key}`}
              type="number"
              min={0.01}
              step="0.01"
              className={formInputClass}
              value={line.amount}
              onChange={(e) => updateLine(line.key, { amount: e.target.value })}
              disabled={!canEdit || busy}
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={line.is_taxable}
                onChange={(e) => updateLine(line.key, { is_taxable: e.target.checked })}
                disabled={!canEdit || busy}
              />
              Taxed (10% withholding)
            </label>
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={officialAccountsBtnSecondary}
            onClick={() => setLines((prev) => [...prev, newDraftLine()])}
            disabled={busy}
          >
            <Plus className="size-4" />
            Add line
          </button>
          <button type="button" className={officialAccountsBtnPrimary} onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save special allowances"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
