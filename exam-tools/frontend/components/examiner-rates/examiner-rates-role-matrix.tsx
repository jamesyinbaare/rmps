"use client";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import {
  ExaminerRatesPaneHeader,
  rateAmountInputClass,
} from "@/components/examiner-rates/shared";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  EXAMINER_ALLOWANCE_TYPE_OPTIONS,
  EXAMINER_ALLOWANCE_TYPE_SHORT_LABELS,
  roleCellKey,
  type RoleRateDraft,
} from "@/lib/examiner-rates-draft";
import { cn } from "@/lib/utils";

type Props = {
  editing: boolean;
  saving: boolean;
  roleRates: RoleRateDraft;
  cellErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

export function ExaminerRatesRoleMatrix({
  editing,
  saving,
  roleRates,
  cellErrors,
  onChange,
}: Props) {
  return (
    <div>
      <ExaminerRatesPaneHeader
        groupLabel="Amounts"
        title="Role allowances"
        description="Flat amounts by examiner role. One row per role; columns are the non-sitting, non-marking allowances."
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 font-medium">Role</th>
              {EXAMINER_ALLOWANCE_TYPE_OPTIONS.map((col) => (
                <th key={col.value} className="px-3 py-2 font-medium text-right" title={col.label}>
                  {EXAMINER_ALLOWANCE_TYPE_SHORT_LABELS[col.value]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMINER_TYPE_OPTIONS.map((role) => (
              <tr key={role.value} className="border-b border-border/60 last:border-0">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground">
                  {role.label}
                </td>
                {EXAMINER_ALLOWANCE_TYPE_OPTIONS.map((col) => {
                  const key = roleCellKey(col.value, role.value);
                  return (
                    <td key={col.value} className="px-3 py-2">
                      {editing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={saving}
                          className={cn(rateAmountInputClass, cellErrors[key] && "border-destructive")}
                          value={roleRates[key] ?? ""}
                          onChange={(e) => onChange(key, e.target.value)}
                          aria-label={`${role.label} ${col.label}`}
                          aria-invalid={Boolean(cellErrors[key])}
                        />
                      ) : (
                        <span className="block text-right tabular-nums">
                          {formatGhsAmount(roleRates[key] || null)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
