import type { VisibilityState } from "@tanstack/react-table";

/** Human-readable labels for the column visibility popover (leaf columns only). */
export const INSPECTOR_COLUMN_TOGGLE_LABELS: Record<string, string> = {
  total_candidates: "Candidates",
  exam_days: "Exam days",
  inspectors_required: "Required",
  external_inspector_count: "Paid",
  posted_inspector_count: "Posted",
  unique_inspector_count: "Unique",
  inspectors_in_both: "In both",
  paid_inspector_variance: "Variance",
  candidates_per_paid_inspector: "Cand./inspector",
  total_inspector_pay_ghs: "Total pay (GHS)",
  max_inspector_assigned_days: "Max assigned",
  assigned_days_variance: "Days var.",
  pay_at_exam_days_ghs: "Pay @ exam days",
  pay_at_assigned_days_ghs: "Pay @ assigned",
  days_pay_variance_ghs: "Days pay var.",
  pay_at_posted_count_ghs: "Pay @ posted",
  payroll_vs_posted_variance_ghs: "Payroll vs posted",
};

export function inspectorColumnToggleLabel(columnId: string): string {
  return INSPECTOR_COLUMN_TOGGLE_LABELS[columnId] ?? columnId.replace(/_/g, " ");
}

export function isInspectorColumnVisible(columnVisibility: VisibilityState, columnId: string): boolean {
  return columnVisibility[columnId] !== false;
}
