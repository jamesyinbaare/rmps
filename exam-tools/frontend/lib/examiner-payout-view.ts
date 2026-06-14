import type { AdminExaminerAllowanceRow } from "@/lib/api";

export type ExaminerPayoutView = "all" | "travel_commuting" | "allowances_marking";

export type ExaminerBogPayoutMode = ExaminerPayoutView;

export const EXAMINER_PAYOUT_VIEW_OPTIONS: { value: ExaminerPayoutView; label: string }[] = [
  { value: "all", label: "All together" },
  { value: "travel_commuting", label: "T&T & commuting" },
  { value: "allowances_marking", label: "Allowances & marking" },
];

export function parseExaminerPayoutView(raw: string | null | undefined): ExaminerPayoutView {
  if (raw === "travel_commuting" || raw === "allowances_marking" || raw === "all") return raw;
  return "all";
}

export function payoutAmountForView(row: AdminExaminerAllowanceRow, view: ExaminerPayoutView): string {
  if (view === "travel_commuting") return row.payout_travel_commuting_ghs;
  if (view === "allowances_marking") return row.payout_allowances_marking_ghs;
  return row.total_payable_ghs;
}

export function payoutColumnLabel(view: ExaminerPayoutView): string {
  if (view === "travel_commuting") return "Payout (T&T & commuting)";
  if (view === "allowances_marking") return "Payout (Allowances & marking)";
  return "Total payout";
}

export function bogExportFilenameSuffix(mode: ExaminerBogPayoutMode): string {
  if (mode === "travel_commuting") return "examiner_bog_travel_commuting";
  if (mode === "allowances_marking") return "examiner_bog_allowances_marking";
  return "examiner_bog";
}


export function sumPayoutViewOnPage(items: AdminExaminerAllowanceRow[], view: ExaminerPayoutView): number {
  return items.reduce((sum, row) => {
    const raw = payoutAmountForView(row, view);
    const n = Number.parseFloat(raw);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
