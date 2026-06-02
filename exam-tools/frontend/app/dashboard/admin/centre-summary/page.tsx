"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { InvigilatorSummaryCard } from "@/components/centre-invigilator-summary-card";
import { OfficialRolesPanel } from "@/components/centre-official-roles-panel";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { SubjectScopeBadge, timetableFilterBadgeScope } from "@/components/subject-scope-badge";
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
import { formInputClass } from "@/lib/form-classes";
import {
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
  BANK_ACCOUNTS_LABEL,
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";
import { subjectScopeBadgeClass } from "@/lib/subject-scope-display";
import { OfficialAllowanceBreakdownCell } from "@/components/official-allowance-breakdown";
import { REGION_OPTIONS } from "@/lib/school-enums";

const DEFAULT_SUBJECT_FILTER: TimetableSubjectFilter = "CORE_ONLY";

const SUBJECT_SCOPE_OPTIONS: { value: TimetableSubjectFilter; label: string; hint: string }[] = [
  { value: "CORE_ONLY", label: "Core", hint: "Core subjects only" },
  { value: "ELECTIVE_ONLY", label: "Elective", hint: "Elective subjects only" },
  { value: "ALL", label: "All", hint: "Include core and elective examination days" },
];

const ALL_DESIGNATIONS = "__all__";

type SortKey = "name" | "designation" | "days";
type SortDir = "asc" | "desc";

const filterToolbarClass =
  "border-b border-border bg-muted/20 px-3 py-2.5 sm:px-4";
const filterToolbarRowClass = "flex flex-wrap items-end gap-x-3 gap-y-2";
const filterFieldClass = "flex min-w-0 flex-col gap-0.5";
const filterLabelClass = "text-[11px] font-medium leading-none text-muted-foreground";
const filterSelectClass =
  "block w-full min-h-8 rounded-md border border-input-border bg-input px-2.5 text-xs text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

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

function SubjectScopeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: TimetableSubjectFilter;
  onChange: (value: TimetableSubjectFilter) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(filterFieldClass, "w-fit shrink-0")}
      title="Choose which subject types to include in centre totals and official lists."
    >
      <span className={filterLabelClass}>Scope</span>
      <div
        className="inline-flex min-h-8 shrink-0 rounded-md border border-input-border bg-muted/30 p-0.5"
        role="radiogroup"
        aria-label="Subject scope"
      >
        {SUBJECT_SCOPE_OPTIONS.map((opt) => {
          const id = `centre-summary-scope-${opt.value}`;
          const checked = value === opt.value;
          const badgeScope = timetableFilterBadgeScope(opt.value);
          return (
            <label
              key={opt.value}
              htmlFor={id}
              title={opt.hint}
              className={cn(
                "flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded px-2 text-xs font-medium transition-colors",
                checked
                  ? cn("shadow-sm ring-1 ring-success/30", subjectScopeBadgeClass(badgeScope))
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <input
                id={id}
                type="radio"
                name="centre-summary-scope"
                className="sr-only"
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
              />
              {opt.label}
            </label>
          );
        })}
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

function ExportButton({
  disabled,
  busy,
  label,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        officialAccountsBtnPrimary,
        "min-h-8 px-3 py-1.5 text-xs sm:w-auto [&_svg]:size-3.5",
      )}
      disabled={disabled || busy}
      title={disabled ? "Select a centre to export" : undefined}
      onClick={onClick}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          Exporting…
        </>
      ) : (
        <>
          <Download className="mr-2 size-4" aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

function AdminCentreSummaryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centers, setCenters] = useState<PerExamCentreItem[]>([]);
  const [centerId, setCenterId] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<TimetableSubjectFilter>(DEFAULT_SUBJECT_FILTER);
  const [regionFilter, setRegionFilter] = useState("");
  const [summary, setSummary] = useState<FinanceCentreSchoolSummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportBogBusy, setExportBogBusy] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);

  const [tableSearch, setTableSearch] = useState("");
  const [designationFilter, setDesignationFilter] = useState(ALL_DESIGNATIONS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await listExaminationCentres(examId, { subject_filter: subjectFilter });
        if (cancelled) return;
        setCenters(data.items);
        setCenterId((cur) => (cur && data.items.some((c) => c.id === cur) ? cur : ""));
      } catch {
        if (!cancelled) setCenters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, subjectFilter]);

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
    const cid = sp.get("centerId")?.trim();
    if (cid) setCenterId(cid);
    const st = sp.get("st");
    if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") setSubjectFilter(st);
    const reg = sp.get("region")?.trim() ?? "";
    if (reg && REGION_OPTIONS.some((r) => r.value === reg)) setRegionFilter(reg);
    setUrlHydrated(true);
  }, [exams, searchParams]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (centerId.trim()) p.set("centerId", centerId.trim());
    if (subjectFilter !== DEFAULT_SUBJECT_FILTER) p.set("st", subjectFilter);
    if (regionFilter) p.set("region", regionFilter);
    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [urlHydrated, examId, centerId, subjectFilter, regionFilter, pathname, router, searchParams]);

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
    setCenterId((cur) =>
      cur && filteredCenters.some((c) => c.id === cur) ? cur : "",
    );
  }, [filteredCenters]);

  const centerOptions = useMemo(
    () =>
      filteredCenters.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
      })),
    [filteredCenters],
  );

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

  async function onExport() {
    if (examId === null || !summary || !centerId.trim()) return;
    setExportBusy(true);
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
      setExportBusy(false);
    }
  }

  async function onExportBog() {
    if (examId === null || !summary || !centerId.trim()) return;
    setExportBogBusy(true);
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
      setExportBogBusy(false);
    }
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

  const examOfficialsHref =
    examId != null && centerId.trim()
      ? `${OFFICIAL_ACCOUNTS_ADMIN_HREF}?exam=${examId}&centerId=${encodeURIComponent(centerId.trim())}`
      : OFFICIAL_ACCOUNTS_ADMIN_HREF;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const exportDisabled = !summary || !canLoad || exportBusy || exportBogBusy;
  const exportControl = (
    <div className="flex flex-row gap-1.5">
      <ExportButton
        disabled={exportDisabled}
        busy={exportBusy}
        label="Export Excel"
        onClick={() => void onExport()}
      />
      <ExportButton
        disabled={exportDisabled}
        busy={exportBogBusy}
        label="Export BoG"
        onClick={() => void onExportBog()}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <OfficialAccountsPageIntro description="Bank accounts and allowances for one examination centre." />

      <div className={officialAccountsPanelClass}>
        <div className={filterToolbarClass}>
          <div className={filterToolbarRowClass}>
            <div className={cn(filterFieldClass, "min-w-[10rem] flex-1 sm:max-w-xs")}>
              <label className={filterLabelClass} htmlFor="centre-summary-exam">
                Examination
              </label>
              <select
                id="centre-summary-exam"
                className={filterSelectClass}
                value={examId ?? ""}
                onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
                disabled={exams.length === 0}
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {formatExamLabel(ex)}
                  </option>
                ))}
              </select>
            </div>
            <SubjectScopeToggle
              value={subjectFilter}
              onChange={setSubjectFilter}
              disabled={exams.length === 0}
            />
            <div className={cn(filterFieldClass, "w-28 shrink-0 sm:w-32")}>
              <label className={filterLabelClass} htmlFor="centre-summary-region">
                Region
              </label>
              <select
                id="centre-summary-region"
                className={filterSelectClass}
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                disabled={centers.length === 0 || regionSelectOptions.length === 0}
              >
                <option value="">All</option>
                {regionSelectOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={cn(filterFieldClass, "min-w-[12rem] flex-1 sm:min-w-[14rem]")}>
              <span className={filterLabelClass}>Centre</span>
              <SearchableCombobox
                options={centerOptions}
                value={centerId}
                onChange={setCenterId}
                placeholder="Select centre…"
                searchPlaceholder="Code or name…"
                emptyText={
                  filteredCenters.length
                    ? "No match."
                    : regionFilter
                      ? "No centres in this region."
                      : subjectFilter !== "ALL"
                        ? "No centres for this scope."
                        : "No centres."
                }
                widthClass="w-full min-w-0"
                triggerClassName="min-h-8 rounded-md px-2.5 text-xs"
                showAllOption={false}
                disabled={filteredCenters.length === 0}
              />
            </div>
            <div className="ml-auto shrink-0 pb-0.5">{exportControl}</div>
          </div>
        </div>

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

            <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-2 sm:flex-row sm:items-end sm:gap-2 sm:px-4">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <label className="sr-only" htmlFor="centre-summary-search">
                  Search officials
                </label>
                <input
                  id="centre-summary-search"
                  type="search"
                  className={formInputClass}
                  placeholder="Search officials…"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                />
              </div>
              <div className="min-w-0 flex-1 sm:max-w-[11rem]">
                <label className="sr-only" htmlFor="centre-summary-designation">
                  Designation
                </label>
                <select
                  id="centre-summary-designation"
                  className={formInputClass}
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
              <p className="pb-2 text-xs text-muted-foreground sm:ml-auto sm:max-w-xs sm:text-right sm:pb-2.5">
                {filteredOfficials.length} official{filteredOfficials.length === 1 ? "" : "s"}
                {busy ? " · updating…" : ""}
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
                  {filteredOfficials.map((row, index) => {
                    const isInvigilator = row.designation === "Invigilator";
                    return (
                      <tr
                        key={row.id}
                        className={cn("hover:bg-muted/30", isInvigilator && "bg-success/5")}
                      >
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</td>
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
