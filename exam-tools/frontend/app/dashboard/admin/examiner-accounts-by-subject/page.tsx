"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen } from "lucide-react";

import { ExaminerAccountsColumnsPopover } from "@/components/examiner-accounts/examiner-accounts-columns-popover";
import { ExaminerAccountsTable } from "@/components/examiner-accounts/examiner-accounts-table";
import {
  ExaminerSubjectSummaryKpiSkeleton,
  ExaminerSubjectSummaryKpiStrip,
} from "@/components/examiner-accounts/examiner-subject-summary-kpi-strip";
import { ExaminerSubjectSummaryCommandBar } from "@/components/examiner-accounts/examiner-subject-summary-command-bar";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  downloadAdminExaminerAllowancesBogExport,
  downloadAdminExaminerAllowancesExport,
  getExaminationExaminerMarkingRates,
  listAdminExaminerAllowances,
  listAdminExaminerMarkingSubjectSummary,
  listAdminSubjectMarkingGroups,
  type AdminExaminerAllowanceRow,
  type AdminExaminerMarkingSubjectSummaryRow,
  type ExaminerAllowanceSubjectRef,
  type Examination,
  type SubjectMarkingGroupRow,
} from "@/lib/api";
import { buildExaminerMarkingAttendanceSheetsHref } from "@/lib/finance-nav";
import {
  EXAMINER_PAYOUTS_HREF,
  officialAccountsBtnSecondary,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPageLayoutClass,
  officialAccountsPanelFillClass,
  officialAccountsTabPanelClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import {
  parseScriptControlSubjectTypeFilter,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import {
  bogExportFilenameSuffix,
  parseExaminerPayoutView,
  sumPayoutViewOnPage,
  type ExaminerPayoutView,
} from "@/lib/examiner-payout-view";
import { EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY } from "@/lib/examiner-accounts-table-columns";
import { formatGhsAmount } from "@/lib/format-ghs";
import { cn } from "@/lib/utils";
import type { VisibilityState } from "@tanstack/react-table";

const SECTION_ID = "examiner-subject-summary";
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function exportFilenameBase(exam: Examination | null, subjectCode?: string, paperNumber?: number | null): string {
  if (!exam) return "exam";
  const parts = [String(exam.year), exam.exam_series?.trim() || "", exam.exam_type.trim()];
  if (subjectCode?.trim()) parts.push(subjectCode.trim());
  if (paperNumber != null) parts.push(`p${paperNumber}`);
  const raw = `${exam.id}_${parts.filter(Boolean).join("_")}`;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || `exam_${exam.id}`;
}

function parsePaperNumber(raw: string | null, allowed: number[]): number | null {
  if (!raw?.trim() || allowed.length === 0) return allowed[0] ?? null;
  const n = Number.parseInt(raw, 10);
  return !Number.isNaN(n) && allowed.includes(n) ? n : allowed[0] ?? null;
}

function ExaminerAccountsBySubjectContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState("");
  const [paperNumber, setPaperNumber] = useState<number | null>(null);
  const [regionFilter, setRegionFilter] = useState("");
  const [cohortFilter, setCohortFilter] = useState("");
  const [cohorts, setCohorts] = useState<SubjectMarkingGroupRow[]>([]);
  const [cohortsBusy, setCohortsBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [summaries, setSummaries] = useState<AdminExaminerMarkingSubjectSummaryRow[]>([]);
  const [subjectRefs, setSubjectRefs] = useState<ExaminerAllowanceSubjectRef[]>([]);
  const [items, setItems] = useState<AdminExaminerAllowanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [rowsBusy, setRowsBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [payoutView, setPayoutView] = useState<ExaminerPayoutView>("all");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY,
  );
  const [urlHydrated, setUrlHydrated] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRowsKeyRef = useRef("");
  const pendingSubjectFromUrlRef = useRef<string | null>(null);
  const pendingPaperFromUrlRef = useRef<string | null | undefined>(undefined);
  const pendingCohortFromUrlRef = useRef<string | null>(null);

  const parsedSubjectId = subjectId ? Number.parseInt(subjectId, 10) : null;
  const canLoad = examId != null && !!subjectId.trim();

  const subjectRefById = useMemo(() => {
    const map = new Map<number, ExaminerAllowanceSubjectRef>();
    for (const ref of subjectRefs) map.set(ref.id, ref);
    return map;
  }, [subjectRefs]);

  const filteredSummaries = useMemo(() => {
    return summaries.filter((row) => {
      const ref = subjectRefById.get(row.subject_id);
      if (!ref) return true;
      if (subjectTypeFilter === "all") return true;
      return ref.subject_type === subjectTypeFilter;
    });
  }, [summaries, subjectRefById, subjectTypeFilter]);

  const subjectOptions = useMemo(
    () =>
      filteredSummaries.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} — ${s.subject_name}`,
      })),
    [filteredSummaries],
  );

  const selectedSubjectRef = parsedSubjectId != null ? subjectRefById.get(parsedSubjectId) ?? null : null;
  const paperNumbers = selectedSubjectRef?.paper_numbers ?? [];

  const cohortOptions = useMemo(
    () =>
      cohorts.map((cohort) => ({
        value: cohort.id,
        label: `${cohort.name} (${cohort.examiner_ids.length} examiner${cohort.examiner_ids.length === 1 ? "" : "s"})`,
      })),
    [cohorts],
  );

  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === cohortFilter) ?? null,
    [cohorts, cohortFilter],
  );

  const regionOptionsForFilter = useMemo(() => {
    if (!cohortFilter || !selectedCohort) return REGION_OPTIONS;
    const allowed = new Set(selectedCohort.member_regions ?? []);
    return REGION_OPTIONS.filter((region) => allowed.has(region.value));
  }, [cohortFilter, selectedCohort]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (!cancelled) setExams(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load examinations.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlHydrated) return;
    const rawExam = searchParams.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) setExamId(n);
    } else {
      setExamId(exams[0]!.id);
    }
    setSubjectTypeFilter(parseScriptControlSubjectTypeFilter(searchParams.get("stype")));
    const subjectFromUrl = searchParams.get("subject")?.trim() ?? "";
    pendingSubjectFromUrlRef.current = subjectFromUrl || null;
    setSubjectId(subjectFromUrl);
    pendingPaperFromUrlRef.current = searchParams.get("paper");
    const cohortFromUrl = searchParams.get("cohort")?.trim() ?? "";
    pendingCohortFromUrlRef.current = cohortFromUrl || null;
    setCohortFilter(cohortFromUrl);
    const reg = searchParams.get("region")?.trim() ?? "";
    setRegionFilter(reg && REGION_OPTIONS.some((r) => r.value === reg) ? reg : "");
    setSearchQuery(searchParams.get("search")?.trim() ?? "");
    const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    setPage(!Number.isNaN(rawPage) && rawPage > 0 ? rawPage : 1);
    const rawPageSize = Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
    setPageSize(
      PAGE_SIZE_OPTIONS.includes(rawPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? rawPageSize
        : DEFAULT_PAGE_SIZE,
    );
    setPayoutView(parseExaminerPayoutView(searchParams.get("payoutView")));
    setUrlHydrated(true);
  }, [exams, searchParams, urlHydrated]);

  const syncUrl = useCallback(
    (patch: {
      examId?: number | null;
      subjectType?: ScriptControlSubjectTypeFilter;
      subjectId?: string;
      paper?: number | null;
      region?: string;
      cohort?: string;
      search?: string;
      page?: number;
      pageSize?: number;
      payoutView?: ExaminerPayoutView;
    }) => {
      const p = new URLSearchParams();
      const nextExam = patch.examId !== undefined ? patch.examId : examId;
      const nextSubjectType = patch.subjectType ?? subjectTypeFilter;
      const nextSubject = patch.subjectId !== undefined ? patch.subjectId : subjectId;
      const nextPaper = patch.paper !== undefined ? patch.paper : paperNumber;
      const nextRegion = patch.region !== undefined ? patch.region : regionFilter;
      const nextCohort = patch.cohort !== undefined ? patch.cohort : cohortFilter;
      const nextSearch = patch.search !== undefined ? patch.search : searchQuery;
      const nextPage = patch.page ?? page;
      const nextPageSize = patch.pageSize ?? pageSize;
      const nextPayoutView = patch.payoutView ?? payoutView;
      if (nextExam != null) p.set("exam", String(nextExam));
      if (nextSubjectType !== "all") p.set("stype", nextSubjectType);
      if (nextSubject.trim()) p.set("subject", nextSubject.trim());
      if (nextPaper != null) p.set("paper", String(nextPaper));
      if (nextRegion) p.set("region", nextRegion);
      if (nextCohort.trim()) p.set("cohort", nextCohort.trim());
      if (nextSearch.trim()) p.set("search", nextSearch.trim());
      if (nextPage > 1) p.set("page", String(nextPage));
      if (nextPageSize !== DEFAULT_PAGE_SIZE) p.set("pageSize", String(nextPageSize));
      if (nextPayoutView !== "all") p.set("payoutView", nextPayoutView);
      const nextQuery = p.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) return;
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [
      examId,
      page,
      pageSize,
      paperNumber,
      pathname,
      payoutView,
      regionFilter,
      cohortFilter,
      router,
      searchParams,
      searchQuery,
      subjectId,
      subjectTypeFilter,
    ],
  );

  const fetchExamData = useCallback(async () => {
    if (examId == null) return;
    setSummaryBusy(true);
    setLoadError(null);
    try {
      const [summaryData, markingRates] = await Promise.all([
        listAdminExaminerMarkingSubjectSummary(examId),
        getExaminationExaminerMarkingRates(examId),
      ]);
      setSummaries(summaryData.items);
      setSubjectRefs(markingRates.subjects);

      const pendingSubject = pendingSubjectFromUrlRef.current;
      pendingSubjectFromUrlRef.current = null;

      if (summaryData.items.length === 0) {
        setSubjectId("");
        return;
      }

      setSubjectId((prev) => {
        if (prev && summaryData.items.some((s) => String(s.subject_id) === prev)) return prev;
        if (pendingSubject && summaryData.items.some((s) => String(s.subject_id) === pendingSubject)) {
          return pendingSubject;
        }
        return String(summaryData.items[0]!.subject_id);
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load subject summary.");
      setSummaries([]);
      setSubjectRefs([]);
      setSubjectId("");
    } finally {
      setSummaryBusy(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!urlHydrated || examId == null) return;
    void fetchExamData();
  }, [urlHydrated, examId, fetchExamData]);

  useEffect(() => {
    if (!subjectId.trim()) {
      setPaperNumber(null);
      return;
    }
    const ref = subjectRefById.get(Number.parseInt(subjectId, 10));
    const papers = ref?.paper_numbers ?? [];
    setPaperNumber((prev) => {
      if (pendingPaperFromUrlRef.current !== undefined) {
        const pendingRaw = pendingPaperFromUrlRef.current;
        pendingPaperFromUrlRef.current = undefined;
        return parsePaperNumber(pendingRaw, papers);
      }
      if (prev != null && papers.includes(prev)) return prev;
      return papers[0] ?? null;
    });
  }, [subjectId, subjectRefById]);

  useEffect(() => {
    if (!urlHydrated || examId == null || !subjectId.trim() || parsedSubjectId == null) {
      setCohorts([]);
      return;
    }
    let cancelled = false;
    setCohortsBusy(true);
    void (async () => {
      try {
        const rows = await listAdminSubjectMarkingGroups(examId, parsedSubjectId);
        if (cancelled) return;
        setCohorts(rows);
        const pendingCohort = pendingCohortFromUrlRef.current;
        pendingCohortFromUrlRef.current = null;
        setCohortFilter((prev) => {
          if (prev && rows.some((row) => row.id === prev)) return prev;
          if (pendingCohort && rows.some((row) => row.id === pendingCohort)) return pendingCohort;
          return "";
        });
      } catch (e) {
        if (!cancelled) {
          setCohorts([]);
          setLoadError(e instanceof Error ? e.message : "Failed to load cohorts.");
        }
      } finally {
        if (!cancelled) setCohortsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlHydrated, examId, subjectId, parsedSubjectId]);

  useEffect(() => {
    if (!urlHydrated || cohortsBusy) return;
    if (!cohortFilter) return;
    if (!cohorts.some((cohort) => cohort.id === cohortFilter)) {
      setCohortFilter("");
      loadedRowsKeyRef.current = "";
      syncUrl({ cohort: "", page: 1 });
    }
  }, [cohorts, cohortFilter, cohortsBusy, urlHydrated, syncUrl]);

  useEffect(() => {
    if (!urlHydrated || cohortsBusy) return;
    if (!cohortFilter || !selectedCohort) return;
    if (regionFilter && !selectedCohort.member_regions.includes(regionFilter)) {
      setRegionFilter("");
      loadedRowsKeyRef.current = "";
      syncUrl({ region: "", page: 1 });
    }
  }, [cohortFilter, cohortsBusy, regionFilter, selectedCohort, urlHydrated, syncUrl]);

  useEffect(() => {
    if (!urlHydrated || summaryBusy) return;
    if (filteredSummaries.length === 0) {
      setSubjectId((prev) => (prev ? "" : prev));
      return;
    }
    setSubjectId((prev) => {
      if (prev && filteredSummaries.some((s) => String(s.subject_id) === prev)) return prev;
      return String(filteredSummaries[0]!.subject_id);
    });
  }, [filteredSummaries, summaryBusy, urlHydrated]);

  const rowsQueryKey = useMemo(
    () => `${examId}:${subjectId}:${cohortFilter}:${regionFilter}:${searchQuery.trim()}:${pageSize}`,
    [examId, subjectId, cohortFilter, regionFilter, searchQuery, pageSize],
  );

  const fetchRows = useCallback(
    async (targetPage: number, force = false) => {
      if (examId == null || !subjectId.trim()) {
        setItems([]);
        setTotal(0);
        return;
      }
      const key = `${rowsQueryKey}:${targetPage}`;
      if (!force && loadedRowsKeyRef.current === key) return;

      setRowsBusy(true);
      setLoadError(null);
      try {
        const res = await listAdminExaminerAllowances({
          examination_id: examId,
          subject_id: Number.parseInt(subjectId, 10),
          group_id: cohortFilter || null,
          region: regionFilter || null,
          search: searchQuery.trim() || null,
          skip: (targetPage - 1) * pageSize,
          limit: pageSize,
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(targetPage);
        loadedRowsKeyRef.current = key;
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examiners.");
        setItems([]);
        setTotal(0);
      } finally {
        setRowsBusy(false);
      }
    },
    [examId, cohortFilter, pageSize, regionFilter, rowsQueryKey, searchQuery, subjectId],
  );

  useEffect(() => {
    if (!urlHydrated) return;
    void fetchRows(page);
  }, [urlHydrated, page, fetchRows]);

  useEffect(() => {
    if (!urlHydrated) return;
    syncUrl({});
  }, [
    urlHydrated,
    examId,
    subjectTypeFilter,
    subjectId,
    paperNumber,
    regionFilter,
    cohortFilter,
    searchQuery,
    page,
    pageSize,
    payoutView,
    syncUrl,
  ]);

  const selectedSummary = useMemo(
    () => summaries.find((s) => String(s.subject_id) === subjectId) ?? null,
    [summaries, subjectId],
  );

  const selectedExam = exams.find((e) => e.id === examId) ?? null;

  const allAccountsHref = useMemo(() => {
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (regionFilter) p.set("region", regionFilter);
    const qs = p.toString();
    return qs ? `${EXAMINER_PAYOUTS_HREF}?${qs}` : EXAMINER_PAYOUTS_HREF;
  }, [examId, regionFilter]);

  const paperSheetsHref = useMemo(() => {
    if (examId == null || !subjectId.trim() || !cohortFilter) return null;
    return buildExaminerMarkingAttendanceSheetsHref({
      examId,
      subjectId,
      cohortId: cohortFilter,
      subjectType: subjectTypeFilter,
    });
  }, [cohortFilter, examId, subjectId, subjectTypeFilter]);

  const exportOptions = useMemo(
    () => [
      { key: "excel", label: "Export Excel", primary: true },
      { key: "bog_all", label: "BoG — All together" },
      { key: "bog_travel_commuting", label: "BoG — T&T & commuting" },
      { key: "bog_allowances_marking", label: "BoG — Allowances & marking" },
    ],
    [],
  );

  const exportDisabled = !canLoad || total === 0 || !!exportBusy;
  const exportDisabledReason = !canLoad
    ? "Select a subject to export"
    : total === 0
      ? "No records to export"
      : undefined;

  async function onExport(key: string) {
    if (examId == null || !selectedExam || !subjectId.trim()) return;
    setExportBusy(`${SECTION_ID}:${key}`);
    try {
      const base = exportFilenameBase(selectedExam, selectedSummary?.subject_code, paperNumber);
      const exportParams = {
        examination_id: examId,
        subject_id: Number.parseInt(subjectId, 10),
        group_id: cohortFilter || null,
        region: regionFilter || null,
        search: searchQuery.trim() || null,
      };
      if (key === "excel") {
        await downloadAdminExaminerAllowancesExport({
          ...exportParams,
          filename: `${base}_examiner_allowances.xlsx`,
        });
      } else if (key === "bog_all") {
        await downloadAdminExaminerAllowancesBogExport({
          ...exportParams,
          payout_mode: "all",
          filename: `${base}_${bogExportFilenameSuffix("all")}.xlsx`,
        });
      } else if (key === "bog_travel_commuting") {
        await downloadAdminExaminerAllowancesBogExport({
          ...exportParams,
          payout_mode: "travel_commuting",
          filename: `${base}_${bogExportFilenameSuffix("travel_commuting")}.xlsx`,
        });
      } else if (key === "bog_allowances_marking") {
        await downloadAdminExaminerAllowancesBogExport({
          ...exportParams,
          payout_mode: "allowances_marking",
          filename: `${base}_${bogExportFilenameSuffix("allowances_marking")}.xlsx`,
        });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportBusy(null);
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setPage(1);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadedRowsKeyRef.current = "";
      syncUrl({ search: q, page: 1 });
    }, 300);
  }

  const subjectEmptyText = summaryBusy
    ? "Loading subjects…"
    : filteredSummaries.length
      ? "No match."
      : subjectTypeFilter !== "all"
        ? "No subjects for this type."
        : "No subjects with data.";

  const cohortEmptyText = cohortsBusy
    ? "Loading cohorts…"
    : cohorts.length
      ? "No match."
      : "No cohorts for this subject.";

  const regionEmptyText =
    cohortFilter && selectedCohort && regionOptionsForFilter.length === 0
      ? "No regions in this cohort."
      : "No region found.";

  const initialLoading = summaryBusy && summaries.length === 0;
  const busy = summaryBusy || rowsBusy;
  const pagePayoutTotal = useMemo(() => sumPayoutViewOnPage(items, payoutView), [items, payoutView]);

  const tableMeta = busy
    ? "Updating examiners…"
    : `${total.toLocaleString()} examiner${total === 1 ? "" : "s"} · ${formatGhsAmount(String(pagePayoutTotal))} on this page`;

  return (
    <div className={officialAccountsPageLayoutClass}>
      <div className={officialAccountsPanelFillClass}>
        <ExaminerSubjectSummaryCommandBar
          exams={exams}
          examId={examId}
          onExamChange={(id) => {
            setExamId(id);
            setSubjectId("");
            setPaperNumber(null);
            setCohortFilter("");
            setCohorts([]);
            setSummaries([]);
            setSubjectRefs([]);
            pendingSubjectFromUrlRef.current = null;
            pendingPaperFromUrlRef.current = undefined;
            pendingCohortFromUrlRef.current = null;
            setPage(1);
            loadedRowsKeyRef.current = "";
            syncUrl({ examId: id, subjectId: "", paper: null, cohort: "", page: 1 });
          }}
          formatExamLabel={formatExamLabel}
          subjectTypeFilter={subjectTypeFilter}
          onSubjectTypeFilterChange={(stype) => {
            setSubjectTypeFilter(stype);
            setSubjectId("");
            setPaperNumber(null);
            setCohortFilter("");
            setCohorts([]);
            setPage(1);
            loadedRowsKeyRef.current = "";
            syncUrl({ subjectType: stype, subjectId: "", paper: null, cohort: "", page: 1 });
          }}
          subjectId={subjectId}
          onSubjectChange={(id) => {
            setSubjectId(id);
            setCohortFilter("");
            setPage(1);
            loadedRowsKeyRef.current = "";
            syncUrl({ subjectId: id, cohort: "", page: 1 });
          }}
          subjectOptions={subjectOptions}
          subjectsDisabled={summaryBusy && subjectOptions.length === 0}
          subjectEmptyText={subjectEmptyText}
          paperNumbers={paperNumbers}
          paperNumber={paperNumber}
          onPaperNumberChange={(paper) => {
            setPaperNumber(paper);
            syncUrl({ paper });
          }}
          cohortFilter={cohortFilter}
          onCohortChange={(cohort) => {
            setCohortFilter(cohort);
            setPage(1);
            loadedRowsKeyRef.current = "";
            const nextCohort = cohort ? cohorts.find((row) => row.id === cohort) ?? null : null;
            const regionStillValid =
              !regionFilter ||
              !cohort ||
              (nextCohort?.member_regions.includes(regionFilter) ?? false);
            const nextRegion = regionStillValid ? regionFilter : "";
            if (!regionStillValid) setRegionFilter("");
            syncUrl({ cohort, region: nextRegion, page: 1 });
          }}
          cohortOptions={cohortOptions}
          cohortsDisabled={cohortsBusy}
          cohortEmptyText={cohortEmptyText}
          regionFilter={regionFilter}
          onRegionChange={(region) => {
            setRegionFilter(region);
            setPage(1);
            loadedRowsKeyRef.current = "";
            syncUrl({ region, page: 1 });
          }}
          regionOptions={regionOptionsForFilter}
          regionEmptyText={regionEmptyText}
          allAccountsHref={allAccountsHref}
          canLoad={canLoad}
          exportOptions={exportOptions}
          exportDisabled={exportDisabled}
          exportDisabledReason={exportDisabledReason}
          exportBusy={exportBusy}
          onExport={(key) => void onExport(key)}
          paperSheetsHref={paperSheetsHref}
        />

        {loadError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{loadError}</p>
            {canLoad ? (
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={() => void fetchRows(page, true)}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!canLoad && !initialLoading ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center sm:px-5">
            <BookOpen className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-foreground">Choose a subject</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Pick an examination, subject type, and subject above to review examiner bank accounts.
            </p>
          </div>
        ) : null}

        {initialLoading ? <ExaminerSubjectSummaryKpiSkeleton /> : null}

        {selectedSummary && selectedSubjectRef ? (
          <ExaminerSubjectSummaryKpiStrip
            subjectCode={selectedSummary.subject_code}
            subjectName={selectedSummary.subject_name}
            subjectType={selectedSubjectRef.subject_type}
            paperNumber={paperNumber}
            registered={selectedSummary.registered_candidates}
            allocated={selectedSummary.total_allocated_scripts}
            variance={selectedSummary.variance}
            examinerCount={cohortFilter ? total : selectedSummary.examiner_count}
            refreshing={summaryBusy && summaries.length > 0}
          />
        ) : null}

        {canLoad ? (
          <section className={officialAccountsTabPanelClass}>
            <div className={cn(officialAccountsCommandBarClass, "shrink-0 border-t border-border/60 py-3")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 max-w-xl">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="examiner-subject-search">
                    Search examiners
                  </label>
                  <input
                    id="examiner-subject-search"
                    type="search"
                    className={cn(officialAccountsCommandBarSearchClass, "mt-1 w-full max-w-none")}
                    placeholder="Name or phone…"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    disabled={rowsBusy && items.length === 0}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ExaminerAccountsColumnsPopover
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    disabled={rowsBusy && items.length === 0}
                    hideSubjectsToggle
                  />
                  <p className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
                    {tableMeta}
                  </p>
                </div>
              </div>
            </div>

            <ExaminerAccountsTable
              items={items}
              busy={busy}
              emptyLabel="No examiners on this subject."
              hasActiveFilters={!!searchQuery.trim() || !!regionFilter || !!cohortFilter}
              page={page}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              onPageChange={(p) => {
                setPage(p);
                loadedRowsKeyRef.current = "";
                syncUrl({ page: p });
              }}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
                loadedRowsKeyRef.current = "";
                syncUrl({ pageSize: size, page: 1 });
              }}
              subjectId={parsedSubjectId}
              paperNumber={paperNumber}
              payoutView={payoutView}
              onPayoutViewChange={(view) => {
                setPayoutView(view);
                syncUrl({ payoutView: view });
              }}
              columnVisibility={columnVisibility}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default function ExaminerAccountsBySubjectPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <ExaminerAccountsBySubjectContent />
    </RoleGuard>
  );
}
