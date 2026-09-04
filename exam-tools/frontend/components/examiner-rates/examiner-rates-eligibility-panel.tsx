"use client";

import {
  ExaminerRatesPaneHeader,
  ExaminerRatesPayRuleNote,
} from "@/components/examiner-rates/shared";
import type { RosterAllowanceEligibilityRow } from "@/lib/api";
import {
  ROSTER_ALLOWANCE_ELIGIBILITY_KEYS,
  ROSTER_ALLOWANCE_ELIGIBILITY_LABELS,
} from "@/lib/examiner-rates-draft";

type Props = {
  editing: boolean;
  saving: boolean;
  eligibilityRows: RosterAllowanceEligibilityRow[];
  onToggle: (rosterSource: string, key: (typeof ROSTER_ALLOWANCE_ELIGIBILITY_KEYS)[number], enabled: boolean) => void;
};

export function ExaminerRatesEligibilityPanel({
  editing,
  saving,
  eligibilityRows,
  onToggle,
}: Props) {
  return (
    <div>
      <ExaminerRatesPaneHeader
        groupLabel="Who qualifies"
        title="By roster source"
        description="Control which allowance lines apply based on how examiners were added to the roster."
      />
      <div className="mb-4">
        <ExaminerRatesPayRuleNote />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Roster source</th>
              {ROSTER_ALLOWANCE_ELIGIBILITY_KEYS.map((key) => (
                <th key={key} className="px-3 py-2 font-medium text-center">
                  {ROSTER_ALLOWANCE_ELIGIBILITY_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eligibilityRows.map((row) => (
              <tr key={row.roster_source} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{row.label}</td>
                {ROSTER_ALLOWANCE_ELIGIBILITY_KEYS.map((key) => (
                  <td key={key} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(row.allowances[key])}
                      disabled={!editing || saving}
                      onChange={(e) => onToggle(row.roster_source, key, e.target.checked)}
                      aria-label={`${row.label} ${ROSTER_ALLOWANCE_ELIGIBILITY_LABELS[key]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Special examiners default to marking plus role allowances (responsibility, inconvenience, CE report).
        </p>
      </div>
    </div>
  );
}
