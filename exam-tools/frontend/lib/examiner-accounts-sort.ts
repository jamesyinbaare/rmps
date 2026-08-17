import type { AdminExaminerAllowanceRow, SubjectMarkingBreakdownRow } from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import { payoutAmountForView, type ExaminerPayoutView } from "@/lib/examiner-payout-view";

export type ExaminerAccountsSortKey = "full_name" | "bank_name" | "scripts" | "payout";
export type ExaminerAccountsSortDir = "asc" | "desc";

export type ExaminerPaperScriptLine = {
  paperNumber: number;
  booklets: number;
  ratePerScriptGhs: string | null;
  rateLabel: string | null;
};

/** Breakdowns for a subject, optionally narrowed to one paper. Only rows with scripts. */
export function paperBreakdownsForSubject(
  row: AdminExaminerAllowanceRow,
  subjectId: number | null,
  paperNumber: number | null,
): SubjectMarkingBreakdownRow[] {
  let rows = row.subject_breakdowns.filter((b) => b.allocated_booklets > 0);
  if (subjectId != null) {
    rows = rows.filter((b) => b.subject_id === subjectId);
  }
  if (paperNumber != null) {
    rows = rows.filter((b) => b.paper_number === paperNumber);
  }
  return [...rows].sort((a, b) => a.paper_number - b.paper_number);
}

export function formatCompactRateGhs(rate: string | null | undefined): string | null {
  if (rate == null || rate === "") return null;
  const formatted = formatGhsAmount(rate);
  return formatted === "—" ? null : formatted;
}

export function paperScriptLinesForRow(
  row: AdminExaminerAllowanceRow,
  subjectId: number | null,
  paperNumber: number | null,
): ExaminerPaperScriptLine[] {
  return paperBreakdownsForSubject(row, subjectId, paperNumber).map((b) => ({
    paperNumber: b.paper_number,
    booklets: b.allocated_booklets,
    ratePerScriptGhs: b.rate_per_script_ghs ?? null,
    rateLabel: formatCompactRateGhs(b.rate_per_script_ghs),
  }));
}

export function scriptsCountForRow(
  row: AdminExaminerAllowanceRow,
  subjectId: number | null,
  paperNumber: number | null,
): number {
  if (subjectId == null && paperNumber == null) return row.total_allocated_scripts;
  return paperBreakdownsForSubject(row, subjectId, paperNumber).reduce(
    (sum, b) => sum + b.allocated_booklets,
    0,
  );
}

export function scriptsCellTitle(lines: ExaminerPaperScriptLine[], total: number): string {
  if (total <= 0) return "No scripts";
  if (lines.length === 0) return `${total.toLocaleString()} scripts`;
  return lines
    .map((line) => {
      const rate = line.rateLabel ? ` × ${line.rateLabel}` : "";
      return `P${line.paperNumber} · ${line.booklets.toLocaleString()}${rate}`;
    })
    .join("\n");
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
