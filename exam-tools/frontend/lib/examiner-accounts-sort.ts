import type { AdminExaminerAllowanceRow } from "@/lib/api";
import { payoutAmountForView, type ExaminerPayoutView } from "@/lib/examiner-payout-view";

export type ExaminerAccountsSortKey = "full_name" | "bank_name" | "scripts" | "payout";
export type ExaminerAccountsSortDir = "asc" | "desc";

export function scriptsCountForRow(
  row: AdminExaminerAllowanceRow,
  subjectId: number | null,
  paperNumber: number | null,
): number {
  if (subjectId == null) return row.total_allocated_scripts;
  return row.subject_breakdowns
    .filter((b) => b.subject_id === subjectId && (paperNumber == null || b.paper_number === paperNumber))
    .reduce((sum, b) => sum + b.allocated_booklets, 0);
}

export function sortExaminerAccountRows(
  items: AdminExaminerAllowanceRow[],
  sortKey: ExaminerAccountsSortKey,
  sortDir: ExaminerAccountsSortDir,
  opts: { subjectId: number | null; paperNumber: number | null; payoutView: ExaminerPayoutView },
): AdminExaminerAllowanceRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "full_name":
        cmp = a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
        break;
      case "bank_name":
        cmp = (a.bank_name ?? "").localeCompare(b.bank_name ?? "", undefined, { sensitivity: "base" });
        break;
      case "scripts":
        cmp =
          scriptsCountForRow(a, opts.subjectId, opts.paperNumber) -
          scriptsCountForRow(b, opts.subjectId, opts.paperNumber);
        break;
      case "payout": {
        const na = Number.parseFloat(payoutAmountForView(a, opts.payoutView));
        const nb = Number.parseFloat(payoutAmountForView(b, opts.payoutView));
        cmp = (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
        break;
      }
    }
    return cmp * dir;
  });
}

export function toggleExaminerAccountsSort(
  currentKey: ExaminerAccountsSortKey,
  currentDir: ExaminerAccountsSortDir,
  nextKey: ExaminerAccountsSortKey,
): { sortKey: ExaminerAccountsSortKey; sortDir: ExaminerAccountsSortDir } {
  if (currentKey === nextKey) {
    return { sortKey: nextKey, sortDir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { sortKey: nextKey, sortDir: "asc" };
}
