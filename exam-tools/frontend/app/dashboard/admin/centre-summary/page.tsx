"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CentreSummaryCommandBar } from "@/components/centre-summary-command-bar";
import { RoleGuard } from "@/components/role-guard";
import { InvigilatorSummaryCard } from "@/components/centre-invigilator-summary-card";
import { OfficialRolesPanel } from "@/components/centre-official-roles-panel";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { SubjectScopeBadge } from "@/components/subject-scope-badge";
import {
  apiJson,
  displayBankCode,
  downloadFinanceCentreSchoolSummaryExport,
  downloadFinanceCentreSchoolSummaryBogExport,
  centreBogExportFilename,
  listExaminationCentres,
  schoolSummaryExportFilename,
  type AdminExamCentreOfficialRow,
  type Examination,
  type FinanceCentreSchoolSummaryResponse,
  type PerExamCentreItem,
  type TimetableSubjectFilter,
} from "@/lib/api";
import { getCachedCentreSchoolSummary, peekCachedCentreSchoolSummary } from "@/lib/finance-statistics-cache";
import {
  ATTENDANCE_SHEETS_HREF,
  buildAdminAttendanceSheetsHref,
} from "@/lib/finance-nav";
import {
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
  BANK_ACCOUNTS_LABEL,
  officialAccountsBtnSecondary,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";
import { OfficialAllowanceBreakdownCell } from "@/components/official-allowance-breakdown";
import { REGION_OPTIONS } from "@/lib/school-enums";

const DEFAULT_SUBJECT_FILTER: TimetableSubjectFilter = "CORE_ONLY";
const CENTRE_SUMMARY_SECTION_ID = "centre-summary";

const ALL_DESIGNATIONS = "__all__";
const DEFAULT_CENTRE_PAGE_SIZE = 25;
const CENTRE_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500, 1000] as const;

type SortKey = "name" | "designation" | "days";
type SortDir = "asc" | "desc";

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function SummarySkeleton() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-5" role="status" aria-label="Loading summary">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3 dark:bg-muted/20">
        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,2fr)_minmax(0,3fr)] lg:items-stretch">
          <div className="min-h-44 animate-pulse rounded-xl bg-card shadow-md" />
          <div className="min-h-36 animate-pulse rounded-xl bg-card shadow-md" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
    </div>
  );
}

function SummaryCardsRow({
  summary,
  examId,
  centerId,
  subjectFilter,
  designationFilter,
  onDesignationFilterChange,
  refreshing = false,
}: {
  summary: FinanceCentreSchoolSummaryResponse;
  examId: number;
  centerId: string;
  subjectFilter: TimetableSubjectFilter;
  designationFilter: string;
  onDesignationFilterChange: (value: string) => void;
  refreshing?: boolean;
}) {
  const inspectorsInScope =
    summary.subject_filter === subjectFilter ? (summary.assigned_inspectors ?? []) : [];

  const activeDesignation =
    designationFilter === ALL_DESIGNATIONS ? undefined : designationFilter;

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="rounded-xl border border-border/70 bg-muted/30 p-3 shadow-inner dark:bg-muted/20 sm:p-3.5">
        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,2fr)_minmax(0,3fr)] lg:items-stretch">
        <InvigilatorSummaryCard
          summary={summary}
          examId={examId}
          centerId={centerId}
          subjectFilter={subjectFilter}
          refreshing={refreshing}
          assignedInspectors={inspectorsInScope}
          inspectorsRefreshing={refreshing || summary.subject_filter !== subjectFilter}
        />
        <OfficialRolesPanel
          roleCounts={summary.role_counts}
          subjectFilter={subjectFilter}
          activeDesignation={activeDesignation}
          onRoleClick={(designation) =>
            onDesignationFilterChange(
              designationFilter === designation ? ALL_DESIGNATIONS : designation,
            )
          }
        />
        </div>
      </div>
    </div>
  );
}

function sortOfficials(rows: AdminExamCentreOfficialRow[], key: SortKey, dir: SortDir): AdminExamCentreOfficialRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "days") return (a.num_days - b.num_days) * mul;
    if (key === "designation") return a.designation.localeCompare(b.designation) * mul;
    return a.full_name.localeCompare(b.full_name) * mul;
  });
}

function readSubjectFilterFromParams(sp: URLSearchParams): TimetableSubjectFilter {
  const st = sp.get("st");
  if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") return st;
  return DEFAULT_SUBJECT_FILTER;
}

function AdminCentreSummaryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(() => {
    const n = Number.parseInt(searchParams.get("exam") ?? "", 10);
    return Number.isNaN(n) ? null : n;
  });
  const [centers, setCenters] = useState<PerExamCentreItem[]>([]);
  const [centresBusy, setCentresBusy] = useState(false);
  const [centerId, setCenterId] = useState(() => searchParams.get("centerId")?.trim() ?? "");
  const [subjectFilter, setSubjectFilter] = useState<TimetableSubjectFilter>(() =>
    readSubjectFilterFromParams(searchParams),
  );
  const [regionFilter, setRegionFilter] = useState(() => {
    const reg = searchParams.get("region")?.trim() ?? "";
    return reg && REGION_OPTIONS.some((r) => r.value === reg) ? reg : "";
  });
  const [summary, setSummary] = useState<FinanceCentreSchoolSummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);

  const [tableSearch, setTableSearch] = useState("");
  const [designationFilter, setDesignationFilter] = useState(ALL_DESIGNATIONS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_CENTRE_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tableSearch, designationFilter, sortKey, sortDir, centerId, subjectFilter, examId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
        setExamListError(null);
      } catch (e) {
        if (!cancelled) setExamListError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (examId == null) {
      setCenters([]);
      setCentresBusy(false);
      return;
    }
    let cancelled = false;
    setCentresBusy(true);
    void (async () => {
      try {
        const data = await listExaminationCentres(examId, { subject_filter: subjectFilter });
        if (cancelled) return;
        setCenters(data.items);
        setCenterId((cur) => {
          if (!cur) return "";
          return data.items.some((c) => c.id === cur) ? cur : "";
        });
      } catch {
        if (!cancelled) setCenters([]);
      } finally {
        if (!cancelled) setCentresBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, subjectFilter]);

  useEffect(() => {
    const cid = searchParams.get("centerId")?.trim();
    if (cid) setCenterId(cid);
  }, [searchParams]);

  useEffect(() => {
    if (exams.length === 0) return;
    const sp = searchParams;
    const rawExam = sp.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) setExamId(n);
    } else {
      setExamId((cur) => (cur === null && exams.length ? exams[0]!.id : cur));
    }
    const st = sp.get("st");
    if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") setSubjectFilter(st);
    const reg = sp.get("region")?.trim() ?? "";
    if (reg && REGION_OPTIONS.some((r) => r.value === reg)) setRegionFilter(reg);
    else if (!reg) setRegionFilter("");
    setUrlHydrated(true);
  }, [exams, searchParams]);

  useEffect(() => {
    if (!urlHydrated) return;
    const urlCenterId = searchParams.get("centerId")?.trim() ?? "";
    const centerIdForUrl =
      centerId.trim() || (centresBusy || centers.length === 0 ? urlCenterId : "");
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (centerIdForUrl) p.set("centerId", centerIdForUrl);
    if (subjectFilter !== DEFAULT_SUBJECT_FILTER) p.set("st", subjectFilter);
    if (regionFilter) p.set("region", regionFilter);
    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    urlHydrated,
    examId,
    centerId,
    subjectFilter,
    regionFilter,
    centresBusy,
    centers.length,
    pathname,
    router,
    searchParams,
  ]);

  const regionSelectOptions = useMemo(() => {
    const present = new Set(
      centers.map((c) => c.region).filter((r): r is string => Boolean(r?.trim())),
    );
    return REGION_OPTIONS.filter((r) => present.has(r.value));
  }, [centers]);

  const filteredCenters = useMemo(() => {
    if (!regionFilter) return centers;
    return centers.filter((c) => c.region === regionFilter);
  }, [centers, regionFilter]);

  useEffect(() => {
    if (!regionFilter || regionSelectOptions.length === 0) return;
    if (!regionSelectOptions.some((r) => r.value === regionFilter)) {
      setRegionFilter("");
    }
  }, [regionFilter, regionSelectOptions]);

  useEffect(() => {
    if (centresBusy || centers.length === 0) return;
    setCenterId((cur) =>
      cur && filteredCenters.some((c) => c.id === cur) ? cur : "",
    );
  }, [filteredCenters, centresBusy, centers.length]);

  const centerOptions = useMemo(() => {
    const opts = filteredCenters.map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.name}`,
    }));
    const id = centerId.trim();
    if (!id || opts.some((o) => o.value === id)) return opts;
    const fromList = centers.find((c) => c.id === id);
    if (fromList) {
      return [{ value: id, label: `${fromList.code} — ${fromList.name}` }, ...opts];
    }
    if (summary?.center_id === id) {
      return [
        { value: id, label: `${summary.center_code} — ${summary.center_name}` },
        ...opts,
      ];
    }
    if (centresBusy || centers.length === 0) {
      return [{ value: id, label: "Loading centre…" }, ...opts];
    }
    return opts;
  }, [filteredCenters, centerId, centers, summary]);

  const fetchSummary = useCallback(async (options?: { revalidate?: boolean }) => {
    if (examId === null || !centerId.trim()) {
      setSummary(null);
      return;
    }
    setBusy(true);
    setLoadError(null);
    try {
      const result = await getCachedCentreSchoolSummary({
        examId,
        centerId: centerId.trim(),
        subject_filter: subjectFilter,
        revalidate: options?.revalidate,
        onUpdate: (data) => setSummary(data),
      });
      setSummary(result.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load bank accounts by centre");
    } finally {
      setBusy(false);
    }
  }, [examId, centerId, subjectFilter]);

  useEffect(() => {
    if (examId === null || !centerId.trim()) {
      setSummary(null);
      return;
    }
    const cached = peekCachedCentreSchoolSummary(examId, centerId.trim(), subjectFilter);
    if (cached) setSummary(cached);
  }, [examId, centerId, subjectFilter]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  async function onExportExcel() {
    if (examId === null || !summary || !centerId.trim()) return;
    setExportBusy(`${CENTRE_SUMMARY_SECTION_ID}:excel`);
    setLoadError(null);
    const filename = schoolSummaryExportFilename(
      summary.center_code,
      summary.center_name,
      subjectFilter,
    );
    try {
      await downloadFinanceCentreSchoolSummaryExport({
        examId,
        centerId: centerId.trim(),
        subject_filter: subjectFilter,
        filename,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  async function onExportBog() {
    if (examId === null || !summary || !centerId.trim()) return;
    setExportBusy(`${CENTRE_SUMMARY_SECTION_ID}:bog`);
    setLoadError(null);
    const filename = centreBogExportFilename(
      summary.center_code,
      summary.center_name,
      subjectFilter,
    );
    try {
      await downloadFinanceCentreSchoolSummaryBogExport({
        examId,
        centerId: centerId.trim(),
        subject_filter: subjectFilter,
        filename,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "BoG export failed");
    } finally {
      setExportBusy(null);
    }
  }

  function onExportMenu(key: string) {
    if (key === "excel") void onExportExcel();
    else if (key === "bog") void onExportBog();
  }

  const officials = summary?.officials ?? [];
  const canLoad = examId !== null && centerId.trim().length > 0;
  const initialLoading = canLoad && busy && !summary;
  const refreshing = canLoad && busy && !!summary;

  const designationOptions = useMemo(() => {
    const labels = new Set(officials.map((o) => o.designation));
    return [
      { value: ALL_DESIGNATIONS, label: "All designations" },
      ...[...labels].sort().map((d) => ({ value: d, label: d })),
    ];
  }, [officials]);

  const filteredOfficials = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    let rows = officials;
    if (designationFilter !== ALL_DESIGNATIONS) {
      rows = rows.filter((r) => r.designation === designationFilter);
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q) ||
          r.telephone_number.includes(q) ||
          r.account_number.includes(q) ||
          r.bank_name.toLowerCase().includes(q),
      );
    }
    return sortOfficials(rows, sortKey, sortDir);
  }, [officials, tableSearch, designationFilter, sortKey, sortDir]);

  const paginatedOfficials = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOfficials.slice(start, start + pageSize);
  }, [filteredOfficials, page, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredOfficials.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filteredOfficials.length, page, pageSize]);

  const examOfficialsHref =
    examId != null && centerId.trim()
      ? `${OFFICIAL_ACCOUNTS_ADMIN_HREF}?exam=${examId}&centerId=${encodeURIComponent(centerId.trim())}`
      : OFFICIAL_ACCOUNTS_ADMIN_HREF;

  const attendanceSheetsHref = canLoad
    ? buildAdminAttendanceSheetsHref({
        examId: examId!,
        centerId: centerId.trim(),
        subjectFilter,
      })
    : ATTENDANCE_SHEETS_HREF;

  const centreEmptyText = filteredCenters.length
    ? "No match."
    : regionFilter
      ? "No centres in this region."
      : subjectFilter !== "ALL"
        ? "No centres for this scope."
        : "No centres.";

  const exportOptions = useMemo(
    () => [
      { key: "excel", label: "Export Excel", primary: true },
      { key: "bog", label: "Export BoG" },
    ],
    [],
  );

  const exportDisabled = !summary || !canLoad || !!exportBusy;
  const exportDisabledReason = !canLoad
    ? "Select a centre to export"
    : !summary
      ? "Load centre summary first"
      : undefined;

  const officialsMeta = busy
    ? "Updating officials…"
    : `${filteredOfficials.length} official${filteredOfficials.length === 1 ? "" : "s"}${
        filteredOfficials.length > pageSize
          ? ` · page ${page} of ${Math.max(1, Math.ceil(filteredOfficials.length / pageSize))}`
          : ""
      }`;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-3">
      <div className={officialAccountsPanelClass}>
        <CentreSummaryCommandBar
          exams={exams}
          examId={examId}
          onExamChange={setExamId}
          formatExamLabel={formatExamLabel}
          subjectFilter={subjectFilter}
          onSubjectFilterChange={setSubjectFilter}
          regionFilter={regionFilter}
          onRegionChange={setRegionFilter}
          regionOptions={regionSelectOptions}
          centerId={centerId}
          onCentreChange={setCenterId}
          centerOptions={centerOptions}
          centresDisabled={centers.length === 0 || filteredCenters.length === 0}
          centreEmptyText={centreEmptyText}
          attendanceSheetsHref={attendanceSheetsHref}
          canLoad={canLoad}
          exportOptions={exportOptions}
          exportDisabled={exportDisabled}
          exportDisabledReason={exportDisabledReason}
          exportBusy={exportBusy}
          onExport={onExportMenu}
        />

        {examListError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{examListError}</p>
          </div>
        ) : null}

        {loadError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{loadError}</p>
            {canLoad ? (
              <button type="button" className={officialAccountsBtnSecondary} onClick={() => void fetchSummary()}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!canLoad ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center sm:px-5">
            <Building2 className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-foreground">Choose an examination centre</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Pick an examination, subject scope, and centre above.
            </p>
          </div>
        ) : null}

        {initialLoading ? <SummarySkeleton /> : null}

        {summary ? (
          <div className="relative" aria-busy={refreshing}>
            {refreshing ? (
              <div className="pointer-events-none absolute inset-0 z-10 bg-background/40" aria-hidden />
            ) : null}
            <SummaryCardsRow
              summary={summary}
              examId={examId!}
              centerId={centerId.trim()}
              subjectFilter={subjectFilter}
              designationFilter={designationFilter}
              onDesignationFilterChange={setDesignationFilter}
              refreshing={refreshing}
            />

            <div
              className={cn(
                officialAccountsCommandBarClass,
                "border-t border-border/60 py-3 sm:py-3.5",
              )}
            >
              <div className={cn(officialAccountsCommandBarRowClass, "items-end")}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="centre-summary-search">
                    Search officials
                  </label>
                  <input
                    id="centre-summary-search"
                    type="search"
                    className={cn(officialAccountsCommandBarSearchClass, "max-w-none")}
                    placeholder="Name, designation, account, phone…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="flex w-full min-w-0 flex-col gap-1 sm:w-48">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="centre-summary-designation">
                    Designation
                  </label>
                  <select
                    id="centre-summary-designation"
                    className={cn(officialAccountsCommandBarControlClass, "w-full")}
                    value={designationFilter}
                    onChange={(e) => setDesignationFilter(e.target.value)}
                  >
                    {designationOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p
                  className="hidden shrink-0 self-end pb-2.5 text-sm tabular-nums text-muted-foreground lg:block"
                  aria-live="polite"
                >
                  {officialsMeta}
                </p>
              </div>
              <p className="text-sm tabular-nums text-muted-foreground lg:hidden" aria-live="polite">
                {officialsMeta}
              </p>
            </div>

            <div className="max-h-[min(32rem,60vh)] overflow-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                  <tr className="border-b border-border/60 text-left">
                    <th
                      rowSpan={2}
                      className="w-10 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      #
                    </th>
                    <th colSpan={3} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Official
                    </th>
                    <th colSpan={4} className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Bank account
                    </th>
                    <th colSpan={2} className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact & duty
                    </th>
                    <th className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Allowance
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-3 py-2.5">
                      <button type="button" className="font-semibold hover:underline" onClick={() => toggleSort("name")}>
                        Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button
                        type="button"
                        className="font-semibold hover:underline"
                        onClick={() => toggleSort("designation")}
                      >
                        Designation {sortKey === "designation" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Scope</th>
                    <th className="border-l border-border/60 px-3 py-2.5 font-semibold">Bank</th>
                    <th className="px-3 py-2.5 font-semibold">Branch</th>
                    <th className="px-3 py-2.5 font-semibold">Code</th>
                    <th className="px-3 py-2.5 font-semibold">Account no.</th>
                    <th className="border-l border-border/60 px-3 py-2.5">
                      <button type="button" className="font-semibold hover:underline" onClick={() => toggleSort("days")}>
                        Days {sortKey === "days" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Phone</th>
                    <th className="border-l border-border/60 px-3 py-2.5 font-semibold">Total allowance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {!busy && filteredOfficials.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center">
                        <p className="text-sm font-medium text-foreground">
                          {officials.length === 0
                            ? "No officials recorded for this centre"
                            : "No officials match your filters"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {officials.length === 0 ? (
                            <>
                              Account details are entered by the inspector at the centre.{" "}
                              <Link href={examOfficialsHref} className="font-medium text-primary hover:underline">
                                Open {BANK_ACCOUNTS_LABEL}
                              </Link>
                            </>
                          ) : (
                            "Try clearing search or designation filter."
                          )}
                        </p>
                      </td>
                    </tr>
                  ) : null}
                  {paginatedOfficials.map((row, index) => {
                    const isInvigilator = row.designation === "Invigilator";
                    const rowNumber = (page - 1) * pageSize + index + 1;
                    return (
                      <tr
                        key={row.id}
                        className={cn("hover:bg-muted/30", isInvigilator && "bg-success/5")}
                      >
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">{rowNumber}</td>
                        <td className="px-3 py-2 font-medium">{row.full_name}</td>
                        <td className="px-3 py-2">{row.designation}</td>
                        <td className="px-3 py-2">
                          <SubjectScopeBadge scope={row.subject_scope} />
                        </td>
                        <td className="max-w-40 truncate border-l border-border/60 px-3 py-2" title={row.bank_name}>
                          {row.bank_name}
                        </td>
                        <td className="max-w-40 truncate px-3 py-2" title={row.branch_name}>
                          {row.branch_name}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{displayBankCode(row.bank_code)}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">{row.account_number}</td>
                        <td
                          className={cn(
                            "border-l border-border/60 px-3 py-2 tabular-nums",
                            isInvigilator && "font-semibold",
                          )}
                        >
                          {row.num_days}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.telephone_number}</td>
                        <td className="border-l border-border/60 px-3 py-2">
                          <OfficialAllowanceBreakdownCell
                            row={row}
                            examinationId={examId}
                            officialName={row.full_name}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <OfficialAccountsPagination
              page={page}
              pageSize={pageSize}
              total={filteredOfficials.length}
              busy={busy}
              pageSizeOptions={[...CENTRE_PAGE_SIZE_OPTIONS]}
              recordLabel="official"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminCentreSummaryPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <AdminCentreSummaryContent />
    </RoleGuard>
  );
}
