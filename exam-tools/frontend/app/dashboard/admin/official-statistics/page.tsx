"use client";

import Link from "next/link";
import { getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { Download, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataTable } from "@/components/data-table";
import { OfficialAccountsExamMeta, OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  downloadFinanceCentreOfficialStatisticsExport,
  officialStatisticsExportFilename,
  type Examination,
  type FinanceCentreOfficialStatisticsResponse,
  type FinanceCentreOfficialStatisticsRow,
  type TimetableSubjectFilter,
} from "@/lib/api";
import {
  loadOfficialStatisticsWithProgress,
  peekCachedOfficialStatistics,
} from "@/lib/finance-statistics-cache";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF,
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
  officialAccountsPanelClass,
  officialAccountsPanelFooterClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type SubjectScopeSelection = TimetableSubjectFilter | "";

const SUBJECT_FILTER_OPTIONS: { value: TimetableSubjectFilter; label: string }[] = [
  { value: "ALL", label: "All subjects" },
  { value: "CORE_ONLY", label: "Core only" },
  { value: "ELECTIVE_ONLY", label: "Electives only" },
];

const filterFieldClass = "flex min-w-0 flex-col gap-1.5";
const filterControlClass = `${formInputClass} mt-0`;
const filterHintClass = "min-h-10 text-xs leading-snug text-muted-foreground";

type OfficialStatisticsTableRow = FinanceCentreOfficialStatisticsRow & {
  loadState: "loading" | "loaded";
};

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function isSubjectScopeSelected(scope: SubjectScopeSelection): scope is TimetableSubjectFilter {
  return scope === "ALL" || scope === "CORE_ONLY" || scope === "ELECTIVE_ONLY";
}

function centreSummaryHref(examId: number, centerId: string, subjectFilter: TimetableSubjectFilter): string {
  const q = new URLSearchParams();
  q.set("exam", String(examId));
  q.set("centerId", centerId);
  if (subjectFilter !== "ALL") q.set("st", subjectFilter);
  return `${OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF}?${q.toString()}`;
}

function shellCentreToRow(c: {
  center_id: string;
  center_code: string;
  center_name: string;
}): OfficialStatisticsTableRow {
  return {
    center_id: c.center_id,
    center_code: c.center_code,
    center_name: c.center_name,
    invigilator_count: 0,
    invigilator_days: 0,
    expected_invigilator_days: 0,
    invigilator_variance: 0,
    external_inspector: 0,
    supervisor: 0,
    assistant_supervisor: 0,
    police_officer: 0,
    depot_keeper: 0,
    total_officials: 0,
    loadState: "loading",
  };
}

function rowToLoaded(row: FinanceCentreOfficialStatisticsRow): OfficialStatisticsTableRow {
  return { ...row, loadState: "loaded" };
}

function sumOfficialStatisticsTotals(rows: OfficialStatisticsTableRow[]): FinanceCentreOfficialStatisticsRow | null {
  const loaded = rows.filter((r) => r.loadState === "loaded");
  if (loaded.length === 0) return null;
  const invDays = loaded.reduce((n, r) => n + r.invigilator_days, 0);
  const expected = loaded.reduce((n, r) => n + r.expected_invigilator_days, 0);
  return {
    center_id: "00000000-0000-0000-0000-000000000000",
    center_code: "TOTAL",
    center_name: "",
    invigilator_count: loaded.reduce((n, r) => n + r.invigilator_count, 0),
    invigilator_days: invDays,
    expected_invigilator_days: expected,
    invigilator_variance: invDays - expected,
    external_inspector: loaded.reduce((n, r) => n + r.external_inspector, 0),
    supervisor: loaded.reduce((n, r) => n + r.supervisor, 0),
    assistant_supervisor: loaded.reduce((n, r) => n + r.assistant_supervisor, 0),
    police_officer: loaded.reduce((n, r) => n + r.police_officer, 0),
    depot_keeper: loaded.reduce((n, r) => n + r.depot_keeper, 0),
    total_officials: loaded.reduce((n, r) => n + r.total_officials, 0),
  };
}

function numCell(value: number) {
  return <span className="tabular-nums">{value.toLocaleString()}</span>;
}

function loadingCell() {
  return <span className="inline-block h-4 w-8 animate-pulse rounded bg-muted-foreground/20" aria-hidden />;
}

type InvigilationTone = "over" | "match" | "under";

function invigilationTone(variance: number): InvigilationTone {
  if (variance > 0) return "over";
  if (variance < 0) return "under";
  return "match";
}

function varianceCellClass(variance: number): string {
  const tone = invigilationTone(variance);
  switch (tone) {
    case "over":
      return "rounded-md bg-destructive/10 px-2 py-0.5 font-medium text-destructive";
    case "under":
      return "rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-300";
    case "match":
      return "rounded-md bg-success/10 px-2 py-0.5 font-medium text-success";
  }
}

function varianceLabel(variance: number): string {
  if (variance === 0) return "0";
  if (variance > 0) return `+${variance}`;
  return String(variance);
}

function varianceCell(value: number) {
  return <span className={cn("tabular-nums", varianceCellClass(value))}>{varianceLabel(value)}</span>;
}

function OfficialStatisticsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examId, setExamId] = useState<number | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<SubjectScopeSelection>("");
  const [rowSearch, setRowSearch] = useState("");
  const [centreRows, setCentreRows] = useState<OfficialStatisticsTableRow[]>([]);
  const [loadedSummary, setLoadedSummary] = useState<FinanceCentreOfficialStatisticsResponse | null>(null);
  const [summaryActive, setSummaryActive] = useState(false);
  const [statsBusy, setStatsBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [shellBusy, setShellBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "centre", desc: false }]);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const urlInitRef = useRef(false);
  const loadRunRef = useRef(0);

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
    const sp = new URLSearchParams(searchParams.toString());
    const rawExam = sp.get("exam");
    if (rawExam) {
      const id = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(id) && exams.some((e) => e.id === id)) setExamId(id);
    }
    const q = sp.get("q");
    if (q != null) setRowSearch(q);
    const st = sp.get("st");
    if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") setSubjectFilter(st);
    setUrlHydrated(true);
  }, [exams, searchParams]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (rowSearch.trim()) p.set("q", rowSearch.trim());
    if (isSubjectScopeSelected(subjectFilter)) p.set("st", subjectFilter);
    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [urlHydrated, examId, rowSearch, subjectFilter, pathname, router, searchParams]);

  useEffect(() => {
    loadRunRef.current += 1;
    if (examId !== null && isSubjectScopeSelected(subjectFilter)) {
      const cached = peekCachedOfficialStatistics(examId, subjectFilter);
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
  }, [examId, subjectFilter]);

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
      const result = await loadOfficialStatisticsWithProgress(
        {
          examId,
          subject_filter: subjectFilter,
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
          onCalculating: () => {
            if (loadRunRef.current !== runId) return;
            setStatsBusy(true);
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
      setSummaryError(e instanceof Error ? e.message : "Failed to load statistics");
      setSummaryActive(false);
      setShellBusy(false);
      setStatsBusy(false);
    }
  }, [examId, subjectFilter]);

  const selectedExam = useMemo(
    () => (examId != null ? exams.find((e) => e.id === examId) ?? null : null),
    [exams, examId],
  );

  const filteredRows = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    if (!q) return centreRows;
    return centreRows.filter(
      (r) => r.center_code.toLowerCase().includes(q) || r.center_name.toLowerCase().includes(q),
    );
  }, [centreRows, rowSearch]);

  const centresStillLoading = statsBusy;
  const totals = loadedSummary?.totals ?? sumOfficialStatisticsTotals(centreRows);
  const scopeSelected = isSubjectScopeSelected(subjectFilter);

  const columns = useMemo<ColumnDef<OfficialStatisticsTableRow>[]>(
    () => [
      {
        id: "centre",
        accessorFn: (row) => `${row.center_code} ${row.center_name}`,
        header: "Centre",
        cell: ({ row }) => {
          const r = row.original;
          if (examId == null || !scopeSelected) {
            return (
              <span>
                <span className="font-medium text-foreground">{r.center_code}</span>
                <span className="text-muted-foreground"> — {r.center_name}</span>
              </span>
            );
          }
          return (
            <Link
              href={centreSummaryHref(examId, r.center_id, subjectFilter)}
              className="font-medium text-primary hover:underline"
            >
              {r.center_code}
              <span className="font-normal text-muted-foreground"> — {r.center_name}</span>
            </Link>
          );
        },
        meta: { sortAriaLabel: "Sort by centre" },
      },
      {
        accessorKey: "invigilator_count",
        header: "Invigilators",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by invigilators" },
      },
      {
        accessorKey: "invigilator_days",
        header: "Invigilator days",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by invigilator days" },
      },
      {
        accessorKey: "expected_invigilator_days",
        header: "Expected days",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by expected days" },
      },
      {
        accessorKey: "invigilator_variance",
        header: "Difference",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? varianceCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by difference" },
      },
      {
        accessorKey: "external_inspector",
        header: "Ext. inspectors",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by external inspectors" },
      },
      {
        accessorKey: "supervisor",
        header: "Supervisors",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by supervisors" },
      },
      {
        accessorKey: "assistant_supervisor",
        header: "Asst. supervisors",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right",
          sortAriaLabel: "Sort by assistant supervisors",
        },
      },
      {
        accessorKey: "police_officer",
        header: "Police",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by police" },
      },
      {
        accessorKey: "depot_keeper",
        header: "Depot keepers",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by depot keepers" },
      },
      {
        accessorKey: "total_officials",
        header: "Total",
        cell: ({ row, getValue }) =>
          row.original.loadState === "loaded" ? (
            <span className="font-medium tabular-nums text-foreground">{getValue<number>().toLocaleString()}</span>
          ) : (
            loadingCell()
          ),
        meta: { headerClassName: "text-right", cellClassName: "text-right", sortAriaLabel: "Sort by total officials" },
      },
    ],
    [examId, scopeSelected, subjectFilter],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  async function onExport() {
    if (examId === null || !selectedExam || !scopeSelected || !loadedSummary) return;
    setExportBusy(true);
    try {
      await downloadFinanceCentreOfficialStatisticsExport({
        examId,
        subject_filter: subjectFilter,
        examLabel: formatExamLabel(selectedExam),
        summary: loadedSummary,
        filename: officialStatisticsExportFilename(formatExamLabel(selectedExam), subjectFilter),
      });
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  const centreCount = filteredRows.length;
  const canLoad = examId !== null && scopeSelected && !shellBusy && !statsBusy;

  return (
    <div className="space-y-6">
      <OfficialAccountsPageIntro
        description="How many officials were recorded at each examination centre for allowances — invigilators, supervisors, inspectors, police, and depot keepers. Super admins only."
        footerNote={
          <p className="text-xs leading-relaxed text-muted-foreground">
            Choose a subject scope, then load the summary. Use Core or Elective to show centres that hosted
            that part of the exam. Row totals are headcounts by role; difference is declared invigilator days
            minus expected (highlighted when they do not match).
          </p>
        }
        actions={
          <button
            type="button"
            className={cn(officialAccountsBtnPrimary, "gap-2")}
            disabled={exportBusy || !loadedSummary || centresStillLoading}
            onClick={() => void onExport()}
          >
            {exportBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Export Excel
          </button>
        }
        meta={selectedExam ? <OfficialAccountsExamMeta>{formatExamLabel(selectedExam)}</OfficialAccountsExamMeta> : null}
      />

      <div className={officialAccountsPanelClass}>
        <div className="space-y-4 border-b border-border bg-muted/20 px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="official-stats-exam">
                Examination
              </label>
              <select
                id="official-stats-exam"
                className={filterControlClass}
                value={examId ?? ""}
                disabled={examsLoading || exams.length === 0}
                onChange={(e) => {
                  const v = e.target.value;
                  setExamId(v ? Number.parseInt(v, 10) : null);
                }}
              >
                {exams.length === 0 ? <option value="">No examinations</option> : null}
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {formatExamLabel(ex)}
                  </option>
                ))}
              </select>
              <p className={filterHintClass} aria-hidden>
                &nbsp;
              </p>
            </div>

            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="official-stats-scope">
                Subject scope
              </label>
              <select
                id="official-stats-scope"
                className={filterControlClass}
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value as SubjectScopeSelection)}
              >
                <option value="">Select scope…</option>
                {SUBJECT_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className={filterHintClass}>Required before loading statistics.</p>
            </div>

            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="official-stats-search">
                Search centres
              </label>
              <input
                id="official-stats-search"
                type="search"
                className={filterControlClass}
                placeholder="Code or name…"
                value={rowSearch}
                onChange={(e) => setRowSearch(e.target.value)}
                disabled={!summaryActive}
              />
              <p className={filterHintClass}>
                {summaryActive ? "Filters centres in the loaded table." : "Available after loading."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button
              type="button"
              className={cn(officialAccountsBtnSecondary, "gap-2 min-h-10")}
              disabled={!canLoad}
              onClick={() => void loadSummary({ revalidate: summaryActive })}
              aria-busy={shellBusy || statsBusy}
            >
              {shellBusy || statsBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {shellBusy ? "Loading centres…" : statsBusy ? "Calculating…" : summaryActive ? "Refresh" : "Load summary"}
            </button>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {examListError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {examListError}
            </p>
          ) : null}

          {summaryError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {summaryError}
            </p>
          ) : null}

          {!scopeSelected && !summaryActive ? (
            <p className="text-sm text-muted-foreground">
              Select a <strong>subject scope</strong>, then choose <strong>Load summary</strong>. Nothing is
              fetched until you do.
            </p>
          ) : null}

          {shellBusy && !summaryActive ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading centre list…
            </p>
          ) : null}

          {statsBusy ? (
            <p className="text-sm text-muted-foreground" role="status">
              Calculating statistics for {centreRows.length.toLocaleString()} centre
              {centreRows.length === 1 ? "" : "s"}…
            </p>
          ) : null}

          {summaryActive && centreRows.length === 0 && !statsBusy ? (
            <p className="text-sm text-muted-foreground">No examination centres for this selection.</p>
          ) : null}

          {summaryActive && centreRows.length > 0 && filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No centres match the search filter.</p>
          ) : null}

          {summaryActive && filteredRows.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {statsBusy
                  ? `Calculating statistics for ${centreRows.length.toLocaleString()} centre${centreRows.length === 1 ? "" : "s"}…`
                  : `${centreCount.toLocaleString()} centre${centreCount === 1 ? "" : "s"}`}
              </p>
              <div className="relative rounded-md border border-border">
                {statsBusy ? (
                  <div
                    className="absolute inset-0 z-40 flex flex-col items-center justify-start gap-2 rounded-md bg-background/55 pt-16 backdrop-blur-[1px]"
                    aria-busy="true"
                    aria-label="Calculating centre statistics"
                  >
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">This may take a moment for large exams.</p>
                  </div>
                ) : null}
                <DataTable table={table} showFooter={false} striped emptyMessage="No centres match the current filters." />
              </div>
            </>
          ) : null}
        </div>

        {totals && summaryActive ? (
          <div className={officialAccountsPanelFooterClass}>
            <p className="text-muted-foreground">
              Totals from{" "}
              <span className="font-medium text-foreground">
                {centreRows.filter((r) => r.loadState === "loaded").length.toLocaleString()}
              </span>{" "}
              centre
              {centreRows.filter((r) => r.loadState === "loaded").length === 1 ? "" : "s"}
              {statsBusy ? " (calculating…)" : ""}
            </p>
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline font-medium text-foreground">Total invigilators: </dt>
                <dd className="inline tabular-nums">{totals.invigilator_count.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Invigilator days: </dt>
                <dd className="inline tabular-nums">{totals.invigilator_days.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Expected days: </dt>
                <dd className="inline tabular-nums">{totals.expected_invigilator_days.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Difference: </dt>
                <dd className="inline">{varianceCell(totals.invigilator_variance)}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Officials: </dt>
                <dd className="inline tabular-nums">{totals.total_officials.toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function OfficialStatisticsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN"]} loginHref="/login/admin">
      <OfficialStatisticsContent />
    </RoleGuard>
  );
}
