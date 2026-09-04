"use client";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import {
  ExaminerRatesPaneHeader,
  RatesSectionHeader,
  rateAmountInputClass,
} from "@/components/examiner-rates/shared";
import { formatGhsAmount } from "@/lib/format-ghs";
import type { DefaultDaysDraft, SittingRateDraft } from "@/lib/examiner-rates-draft";

type Props = {
  editing: boolean;
  sittingRates: SittingRateDraft;
  defaultDays: DefaultDaysDraft;
  onSittingChange: (role: string, value: string) => void;
  onDefaultDaysChange: (role: string, value: string) => void;
};

export function ExaminerRatesSittingPanel({
  editing,
  sittingRates,
  defaultDays,
  onSittingChange,
  onDefaultDaysChange,
}: Props) {
  return (
    <div>
      <ExaminerRatesPaneHeader
        groupLabel="Amounts"
        title="Sitting"
        description="Paid as daily rate × number of days (exam default or per-examiner override on the roster)."
      />
      <div className="space-y-5">
        <section className="rounded-xl border border-border bg-card">
          <RatesSectionHeader step={1} title="Daily rate by role" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium text-right">Daily rate (GHS)</th>
                </tr>
              </thead>
              <tbody>
                {EXAMINER_TYPE_OPTIONS.map((role) => (
                  <tr key={role.value} className="border-b border-border/60">
                    <td className="px-3 py-2">{role.label}</td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className={rateAmountInputClass}
                          value={sittingRates[role.value] ?? ""}
                          onChange={(e) => onSittingChange(role.value, e.target.value)}
                        />
                      ) : (
                        <span className="block text-right tabular-nums">
                          {formatGhsAmount(sittingRates[role.value] || null)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card">
          <RatesSectionHeader
            step={2}
            title="Default days by role"
            description="Used when an examiner has no days override on the roster."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium text-right">Default days</th>
                </tr>
              </thead>
              <tbody>
                {EXAMINER_TYPE_OPTIONS.map((role) => (
                  <tr key={role.value} className="border-b border-border/60">
                    <td className="px-3 py-2">{role.label}</td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className={rateAmountInputClass}
                          value={defaultDays[role.value] ?? ""}
                          onChange={(e) => onDefaultDaysChange(role.value, e.target.value)}
                        />
                      ) : (
                        <span className="block text-right tabular-nums">
                          {defaultDays[role.value]?.trim() || "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
