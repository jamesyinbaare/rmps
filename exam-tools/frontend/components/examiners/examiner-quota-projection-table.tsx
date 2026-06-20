"use client";

import { ExaminerQuotaUtilizationBar } from "@/components/examiners/examiner-quota-utilization-bar";
import type { QuotaAssessmentResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

export type QuotaProjectionTableRow =
  | QuotaAssessmentResponse["summary_by_group"][number]
  | NonNullable<QuotaAssessmentResponse["summary_by_gender"]>[number];

export function formatQuotaPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

export function quotaPercentTotal(rows: Array<{ quota_percent?: number | null }>): number {
  return rows.reduce((sum, row) => sum + (row.quota_percent ?? 0), 0);
}

type Props = {
  rows: QuotaProjectionTableRow[];
  showRole: boolean;
  genderMode?: boolean;
  proposedColumnLabel?: string;
};

export function ExaminerQuotaProjectionTable({
  rows,
  showRole,
  genderMode = false,
  proposedColumnLabel = "+Upload",
}: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2">{genderMode ? "Gender" : "Region group"}</th>
              {showRole ? <th className="px-3 py-2">Role</th> : null}
              <th className="px-3 py-2 text-right">Cap</th>
              <th className="px-3 py-2 text-right">Quota %</th>
              <th className="px-3 py-2 text-right">Current</th>
              <th className="px-3 py-2 text-right">{proposedColumnLabel}</th>
              <th className="px-3 py-2 text-right">After</th>
              <th className="px-3 py-2">Fill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const label = genderMode
                ? (row as NonNullable<QuotaAssessmentResponse["summary_by_gender"]>[number]).gender_label
                : (row as QuotaAssessmentResponse["summary_by_group"][number]).group_name;
              const roleLabel = !genderMode && showRole
                ? (row as QuotaAssessmentResponse["summary_by_group"][number]).examiner_type_label
                : null;
              const rowKey = genderMode
                ? (row as NonNullable<QuotaAssessmentResponse["summary_by_gender"]>[number]).gender
                : `${(row as QuotaAssessmentResponse["summary_by_group"][number]).group_id}-${(row as QuotaAssessmentResponse["summary_by_group"][number]).examiner_type ?? "total"}`;
              return (
                <tr key={rowKey} className={cn(row.over_cap && "bg-destructive/5")}>
                  <td className="px-3 py-2 font-medium">{label}</td>
                  {showRole ? <td className="px-3 py-2 text-muted-foreground">{roleLabel}</td> : null}
                  <td className="px-3 py-2 text-right tabular-nums">{row.quota ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatQuotaPercent(row.quota_percent)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.current_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">+{row.proposed_count}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums font-medium",
                      row.over_cap && "text-destructive",
                    )}
                  >
                    {row.combined_count}
                  </td>
                  <td className="px-3 py-2">
                    <ExaminerQuotaUtilizationBar
                      combined={row.combined_count}
                      quota={row.quota}
                      overCap={row.over_cap}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
