import type { FinanceCentreInspectorAnalysisResponse } from "@/lib/api";
import {
  isSubjectScopeSelected,
  type InspectorAnalysisTableRow,
  type SubjectScopeSelection,
} from "@/lib/inspector-analysis-report";

/** Compare query strings ignoring parameter order. */
export function searchQueriesEqual(a: string, b: string): boolean {
  const pa = new URLSearchParams(a);
  const pb = new URLSearchParams(b);
  const keysA = [...pa.keys()].sort();
  const keysB = [...pb.keys()].sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    const key = keysA[i]!;
    if (pa.getAll(key).join("\0") !== pb.getAll(key).join("\0")) return false;
  }
  return true;
}

export function patchInspectorAnalysisSearchParams(
  router: { replace: (href: string, options?: { scroll?: boolean }) => void },
  pathname: string,
  searchParams: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): void {
  const p = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "" || value === "all") p.delete(key);
    else p.set(key, value);
  }
  const next = p.toString();
  const cur = searchParams.toString();
  if (searchQueriesEqual(next, cur)) return;
  router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
}

export type StaffingFilter = "all" | "over" | "under" | "match" | "payroll_gaps";
export type DaysPayFilter = "all" | "over" | "under" | "match";
export type PayrollVsPostedFilter = "all" | "over" | "under" | "match";

export function postedOnlyCount(row: InspectorAnalysisTableRow): number {
  if (row.loadState !== "loaded") return 0;
  return Math.max(0, row.posted_inspector_count - row.inspectors_in_both);
}

export function isInspectorReportStale(
  loaded: FinanceCentreInspectorAnalysisResponse | null,
  examId: number | null,
  subjectFilter: SubjectScopeSelection,
  candidatesPerInspector: number,
): boolean {
  if (!loaded || examId === null || !isSubjectScopeSelected(subjectFilter)) return false;
  return (
    loaded.examination_id !== examId ||
    loaded.subject_filter !== subjectFilter ||
    loaded.candidates_per_inspector !== candidatesPerInspector
  );
}

export function countStaffingVariances(rows: InspectorAnalysisTableRow[]) {
  const loaded = rows.filter((r) => r.loadState === "loaded");
  return {
    all: loaded.length,
    over: loaded.filter((r) => r.paid_inspector_variance > 0).length,
    under: loaded.filter((r) => r.paid_inspector_variance < 0).length,
    match: loaded.filter((r) => r.paid_inspector_variance === 0).length,
    payrollGaps: loaded.filter((r) => postedOnlyCount(r) > 0).length,
  };
}

export function countDaysPayVariances(rows: InspectorAnalysisTableRow[]) {
  const loaded = rows.filter((r) => r.loadState === "loaded");
  return {
    all: loaded.length,
    over: loaded.filter((r) => Number(r.days_pay_variance_ghs) > 0).length,
    under: loaded.filter((r) => Number(r.days_pay_variance_ghs) < 0).length,
    match: loaded.filter((r) => Number(r.days_pay_variance_ghs) === 0).length,
  };
}

export function countPayrollVsPostedVariances(rows: InspectorAnalysisTableRow[]) {
  const loaded = rows.filter((r) => r.loadState === "loaded");
  return {
    all: loaded.length,
    over: loaded.filter((r) => Number(r.payroll_vs_posted_variance_ghs) > 0).length,
    under: loaded.filter((r) => Number(r.payroll_vs_posted_variance_ghs) < 0).length,
    match: loaded.filter((r) => Number(r.payroll_vs_posted_variance_ghs) === 0).length,
  };
}

export function matchesStaffingFilter(row: InspectorAnalysisTableRow, filter: StaffingFilter): boolean {
  if (filter === "all" || row.loadState !== "loaded") return filter === "all" || row.loadState !== "loaded";
  if (filter === "payroll_gaps") return postedOnlyCount(row) > 0;
  if (filter === "match") return row.paid_inspector_variance === 0;
  if (filter === "over") return row.paid_inspector_variance > 0;
  return row.paid_inspector_variance < 0;
}

export function matchesDaysPayFilter(row: InspectorAnalysisTableRow, filter: DaysPayFilter): boolean {
  if (filter === "all" || row.loadState !== "loaded") return filter === "all" || row.loadState !== "loaded";
  const v = Number(row.days_pay_variance_ghs);
  if (!Number.isFinite(v)) return true;
  if (filter === "match") return v === 0;
  if (filter === "over") return v > 0;
  return v < 0;
}

export function matchesPayrollVsPostedFilter(row: InspectorAnalysisTableRow, filter: PayrollVsPostedFilter): boolean {
  if (filter === "all" || row.loadState !== "loaded") return filter === "all" || row.loadState !== "loaded";
  const v = Number(row.payroll_vs_posted_variance_ghs);
  if (!Number.isFinite(v)) return true;
  if (filter === "match") return v === 0;
  if (filter === "over") return v > 0;
  return v < 0;
}

export function parseStaffingFilter(raw: string | null): StaffingFilter {
  if (raw === "over" || raw === "under" || raw === "match" || raw === "payroll_gaps") return raw;
  return "all";
}

export function parseDaysPayFilter(raw: string | null): DaysPayFilter {
  if (raw === "over" || raw === "under" || raw === "match") return raw;
  return "all";
}

export function parsePayrollVsPostedFilter(raw: string | null): PayrollVsPostedFilter {
  if (raw === "over" || raw === "under" || raw === "match") return raw;
  return "all";
}
