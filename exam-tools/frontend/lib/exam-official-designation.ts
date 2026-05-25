import type { ExamCentreOfficialResponse, ExamOfficialDesignation } from "@/lib/api";

export const ALL_DESIGNATIONS_FILTER = "__all__";

/** Canonical designation order (matches backend PDF sort). */
export const DESIGNATION_DISPLAY_ORDER: readonly ExamOfficialDesignation[] = [
  "Supervisor",
  "Assistant Supervisor",
  "External Inspector",
  "Depot Keeper",
  "Police Officer",
  "Invigilator",
] as const;

const rankByLabel = new Map<string, number>(
  DESIGNATION_DISPLAY_ORDER.map((label, i) => [label, i]),
);

export function designationSortRank(label: string): number {
  return rankByLabel.get(label.trim()) ?? DESIGNATION_DISPLAY_ORDER.length;
}

export type ExamOfficialSortKey = "name" | "designation" | "days";
export type ExamOfficialSortDir = "asc" | "desc";

export function sortExamOfficialRows(
  rows: ExamCentreOfficialResponse[],
  key: ExamOfficialSortKey,
  dir: ExamOfficialSortDir,
): ExamCentreOfficialResponse[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "days") return (a.num_days - b.num_days) * mul;
    if (key === "designation") {
      const diff = designationSortRank(a.designation) - designationSortRank(b.designation);
      if (diff !== 0) return diff * mul;
      return a.full_name.localeCompare(b.full_name) * mul;
    }
    return a.full_name.localeCompare(b.full_name) * mul;
  });
}

export function matchesExamOfficialSearch(row: ExamCentreOfficialResponse, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.full_name.toLowerCase().includes(q) ||
    row.designation.toLowerCase().includes(q) ||
    row.bank_name.toLowerCase().includes(q) ||
    row.branch_name.toLowerCase().includes(q) ||
    row.bank_code.toLowerCase().includes(q) ||
    row.account_number.toLowerCase().includes(q) ||
    row.telephone_number.toLowerCase().includes(q)
  );
}

export function filterExamOfficialRows(
  rows: ExamCentreOfficialResponse[],
  options: {
    search: string;
    designationFilter: string;
  },
): ExamCentreOfficialResponse[] {
  let out = rows;
  if (options.designationFilter !== ALL_DESIGNATIONS_FILTER) {
    out = out.filter((r) => r.designation === options.designationFilter);
  }
  const q = options.search.trim();
  if (q) {
    out = out.filter((r) => matchesExamOfficialSearch(r, q));
  }
  return out;
}
