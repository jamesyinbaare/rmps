"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  apiJson,
  DEFAULT_INSPECTOR_CANDIDATES_RATIO,
  normalizeInspectorAnalysisRow,
  parseInspectorCandidatesRatio,
  type Examination,
  type FinanceCentreInspectorAnalysisResponse,
  type FinanceCentreInspectorAnalysisRow,
  type TimetableSubjectFilter,
} from "@/lib/api";
import {
  loadInspectorAnalysisWithProgress,
  peekCachedInspectorAnalysis,
} from "@/lib/finance-statistics-cache";
import { searchQueriesEqual } from "@/lib/inspector-analysis-page-utils";

export type SubjectScopeSelection = TimetableSubjectFilter | "";

export type InspectorAnalysisTableRow = FinanceCentreInspectorAnalysisRow & {
  loadState: "loading" | "loaded";
};

export function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

export function isSubjectScopeSelected(scope: SubjectScopeSelection): scope is TimetableSubjectFilter {
  return scope === "ALL" || scope === "CORE_ONLY" || scope === "ELECTIVE_ONLY";
}

export function shellCentreToRow(c: {
  center_id: string;
  center_code: string;
  center_name: string;
}): InspectorAnalysisTableRow {
  return {
    center_id: c.center_id,
    center_code: c.center_code,
    center_name: c.center_name,
    subject_filter: "ALL",
    total_candidates: 0,
    exam_days: 0,
    external_inspector_count: 0,
    posted_inspector_count: 0,
    unique_inspector_count: 0,
    inspectors_in_both: 0,
    total_inspector_pay_ghs: "0",
    max_inspector_assigned_days: 0,
    assigned_days_variance: 0,
    pay_at_exam_days_ghs: "0",
    pay_at_assigned_days_ghs: "0",
    days_pay_variance_ghs: "0",
    pay_at_posted_count_ghs: "0",
    payroll_vs_posted_variance_ghs: "0",
    inspectors_required: 0,
    paid_inspector_variance: 0,
    candidates_per_paid_inspector: null,
    loadState: "loading",
  };
}

export function rowToLoaded(row: FinanceCentreInspectorAnalysisRow): InspectorAnalysisTableRow {
  return { ...normalizeInspectorAnalysisRow(row), loadState: "loaded" };
}

function mergeCentreRow(
  rows: InspectorAnalysisTableRow[],
  loaded: FinanceCentreInspectorAnalysisRow,
): InspectorAnalysisTableRow[] {
  return rows.map((r) => (r.center_id === loaded.center_id ? rowToLoaded(loaded) : r));
}

export function useInspectorAnalysisReport() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examId, setExamId] = useState<number | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<SubjectScopeSelection>("");
  const [candidatesPerInspector, setCandidatesPerInspector] = useState(DEFAULT_INSPECTOR_CANDIDATES_RATIO);
  const [rowSearch, setRowSearch] = useState("");
  const [centreRows, setCentreRows] = useState<InspectorAnalysisTableRow[]>([]);
  const [loadedSummary, setLoadedSummary] = useState<FinanceCentreInspectorAnalysisResponse | null>(null);
  const [summaryActive, setSummaryActive] = useState(false);
  const [statsBusy, setStatsBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [shellBusy, setShellBusy] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const urlInitRef = useRef(false);
  const loadRunRef = useRef(0);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setExamsLoading(true);
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
        setExamListError(null);
        setExamId((cur) => (cur === null && list.length ? list[0]!.id : cur));
      } catch (e) {
        if (!cancelled) setExamListError(e instanceof Error ? e.message : "Failed to load examinations");
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlInitRef.current) return;
    urlInitRef.current = true;
    const sp = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : searchParams.toString(),
    );
    const rawExam = sp.get("exam");
    if (rawExam) {
      const id = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(id) && exams.some((e) => e.id === id)) setExamId(id);
    }
    const q = sp.get("q");
    if (q != null) setRowSearch(q);
    const st = sp.get("st");
    if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") setSubjectFilter(st);
    setCandidatesPerInspector(parseInspectorCandidatesRatio(sp.get("ratio")));
    setUrlHydrated(true);
  }, [exams]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams(searchParamsRef.current.toString());
    if (examId != null) p.set("exam", String(examId));
    else p.delete("exam");
    const q = rowSearch.trim();
    if (q) p.set("q", q);
    else p.delete("q");
    if (isSubjectScopeSelected(subjectFilter)) p.set("st", subjectFilter);
    else p.delete("st");
    p.set("ratio", String(candidatesPerInspector));
    const next = p.toString();
    const cur = searchParamsRef.current.toString();
    if (searchQueriesEqual(next, cur)) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [urlHydrated, examId, rowSearch, subjectFilter, candidatesPerInspector, pathname, router]);

  useEffect(() => {
    loadRunRef.current += 1;
    if (examId !== null && isSubjectScopeSelected(subjectFilter)) {
      const cached = peekCachedInspectorAnalysis(examId, subjectFilter, candidatesPerInspector);
      if (cached) {
        setCentreRows(cached.centres.map(rowToLoaded));
        setLoadedSummary(cached);
        setSummaryActive(true);
        setStatsBusy(false);
        setShellBusy(false);
        setSummaryError(null);
        return;
      }
    }
    setSummaryActive(false);
    setCentreRows([]);
    setLoadedSummary(null);
    setStatsBusy(false);
    setSummaryError(null);
  }, [examId, subjectFilter, candidatesPerInspector]);

  const loadSummary = useCallback(async (options?: { revalidate?: boolean }) => {
    if (examId === null || !isSubjectScopeSelected(subjectFilter)) return;
    const runId = ++loadRunRef.current;
    const revalidate = options?.revalidate === true;
    setShellBusy(!revalidate);
    setStatsBusy(false);
    setSummaryError(null);
    if (revalidate) {
      setCentreRows([]);
      setLoadedSummary(null);
      setSummaryActive(false);
    }

    try {
      const result = await loadInspectorAnalysisWithProgress(
        {
          examId,
          subject_filter: subjectFilter,
          candidates_per_inspector: candidatesPerInspector,
          revalidate,
          onUpdate: (data) => {
            if (loadRunRef.current !== runId) return;
            setCentreRows(data.centres.map(rowToLoaded));
            setLoadedSummary(data);
            setStatsBusy(false);
          },
        },
        {
          onShellLoaded: (shell) => {
            if (loadRunRef.current !== runId) return;
            setCentreRows(shell.centres.map(shellCentreToRow));
            setSummaryActive(true);
            setShellBusy(false);
            setStatsBusy(true);
          },
          onCentreLoaded: (row) => {
            if (loadRunRef.current !== runId) return;
            setCentreRows((prev) => mergeCentreRow(prev, row));
          },
        },
      );
      if (loadRunRef.current !== runId) return;
      setCentreRows(result.data.centres.map(rowToLoaded));
      setLoadedSummary(result.data);
      setSummaryActive(true);
      setShellBusy(false);
      setStatsBusy(result.isRevalidating);
    } catch (e) {
      if (loadRunRef.current !== runId) return;
      setSummaryError(e instanceof Error ? e.message : "Failed to load inspector analysis");
      setSummaryActive(false);
      setShellBusy(false);
      setStatsBusy(false);
    }
  }, [examId, subjectFilter, candidatesPerInspector]);

  const selectedExam = useMemo(
    () => (examId != null ? exams.find((e) => e.id === examId) ?? null : null),
    [exams, examId],
  );

  const totals = loadedSummary?.totals ?? null;
  const activeRatio = loadedSummary?.candidates_per_inspector ?? candidatesPerInspector;
  const scopeSelected = isSubjectScopeSelected(subjectFilter);
  const loadedCount = centreRows.filter((r) => r.loadState === "loaded").length;
  const canLoad = examId !== null && scopeSelected && !shellBusy && !statsBusy;

  return {
    exams,
    examsLoading,
    examId,
    setExamId,
    examListError,
    subjectFilter,
    setSubjectFilter,
    candidatesPerInspector,
    setCandidatesPerInspector,
    rowSearch,
    setRowSearch,
    centreRows,
    loadedSummary,
    summaryActive,
    statsBusy,
    summaryError,
    shellBusy,
    selectedExam,
    totals,
    activeRatio,
    scopeSelected,
    loadedCount,
    canLoad,
    loadSummary,
    urlHydrated,
  };
}
