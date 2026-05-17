"use client";

import { getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Loader2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataTable } from "@/components/data-table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  loadFinanceCentreInvigilatorSummaryProgressive,
  type Examination,
  type FinanceCentreInvigilatorSummaryItem,
  type TimetableSubjectFilter,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

const btnIcon =
  "inline-flex size-10 items-center justify-center rounded-lg border border-input-border bg-background text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

/** Filter toolbar: label, control, and hint share the same vertical rhythm in every column */
const filterFieldClass = "flex min-w-0 flex-col gap-1.5";
const filterControlClass = `${formInputClass} mt-0`;
const filterHintClass = "min-h-10 text-xs leading-snug text-muted-foreground";

/** One row per examination centre; values keyed by examination_date (ISO) */
export type CentrePivotRow = {
  center_id: string;
  center_code: string;
  center_name: string;
  byDate: Record<string, { inv: number; cand: number } | undefined>;
  /** Sum of invigilators for this centre across all dates in the response */
  rowTotalInv: number;
  loadState: "loading" | "loaded";
};

function formatExamDateHeader(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function centreItemToPivotRow(item: FinanceCentreInvigilatorSummaryItem): CentrePivotRow {
  const byDate: CentrePivotRow["byDate"] = {};
  let rowTotalInv = 0;
  for (const d of item.days) {
    byDate[d.examination_date] = {
      inv: d.invigilators_required,
      cand: d.unique_candidates,
    };
    rowTotalInv += d.invigilators_required;
  }
  return {
    center_id: item.center_id,
    center_code: item.center_code,
    center_name: item.center_name,
    byDate,
    rowTotalInv,
    loadState: "loaded",
  };
}

function shellCentreToPivotRow(c: {
  center_id: string;
  center_code: string;
  center_name: string;
}): CentrePivotRow {
  return {
    center_id: c.center_id,
    center_code: c.center_code,
    center_name: c.center_name,
    byDate: {},
    rowTotalInv: 0,
    loadState: "loading",
  };
}

function centreRowMatchesSearch(row: CentrePivotRow, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  if (row.center_code.toLowerCase().includes(q)) return true;
  if (row.center_name.toLowerCase().includes(q)) return true;
  if (String(row.rowTotalInv).includes(q)) return true;
  for (const [dt, cell] of Object.entries(row.byDate)) {
    if (!cell) continue;
    if (dt.toLowerCase().includes(q)) return true;
    if (String(cell.inv).includes(q)) return true;
    if (String(cell.cand).includes(q)) return true;
  }
  return false;
}

/** How many date columns to show per horizontal page */
const DATE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_DATES_PER_PAGE = 10;

const SUBJECT_FILTER_OPTIONS: { value: TimetableSubjectFilter; label: string }[] = [
  { value: "ALL", label: "All subjects" },
  { value: "CORE_ONLY", label: "Core only" },
  { value: "ELECTIVE_ONLY", label: "Electives only" },
];

function csvEscape(value: string | number): string {
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildFinanceGridCsv(rows: CentrePivotRow[], datesOrdered: string[]): string {
  const header = ["center_code", "center_name", ...datesOrdered, "centre_total_invigilators"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.center_code,
      r.center_name,
      ...datesOrdered.map((dt) => r.byDate[dt]?.inv ?? ""),
      r.rowTotalInv,
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SummaryTableSkeleton() {
  return (
    <div className="rounded-md border border-border" role="status" aria-label="Loading summary table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 min-w-[9rem] border-r border-border bg-muted px-3 py-3 text-left">
                <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/20" />
              </th>
              {Array.from({ length: 8 }).map((_, i) => (
                <th key={i} className="min-w-[5rem] bg-muted/50 px-2 py-3">
                  <div className="mx-auto h-4 w-10 animate-pulse rounded bg-muted-foreground/20" />
                </th>
              ))}
              <th className="sticky right-0 z-10 min-w-[5rem] border-l border-border bg-muted px-3 py-3 text-right">
                <div className="ml-auto h-4 w-14 animate-pulse rounded bg-muted-foreground/20" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, ri) => (
              <tr key={ri} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-3">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted-foreground/15" />
                </td>
                {Array.from({ length: 8 }).map((_, ci) => (
                  <td key={ci} className="px-2 py-3 text-center">
                    <div className="mx-auto h-4 w-6 animate-pulse rounded bg-muted-foreground/10" />
                  </td>
                ))}
                <td className="sticky right-0 z-10 border-l border-border bg-card px-3 py-3 text-right">
                  <div className="ml-auto h-4 w-8 animate-pulse rounded bg-muted-foreground/15" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sr-only">Loading invigilator summary…</p>
    </div>
  );
}

function FinanceCentreSummaryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examId, setExamId] = useState<number | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [summaryActive, setSummaryActive] = useState(false);
  const [examinationDates, setExaminationDates] = useState<string[]>([]);
  const [centrePivotRows, setCentrePivotRows] = useState<CentrePivotRow[]>([]);
  const [loadingProgress, setLoadingProgress] = useState<{ done: number; total: number } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadRunRef = useRef(0);
  const progressTotalRef = useRef(0);

  const [rowSearch, setRowSearch] = useState("");
  const [centreRowFilter, setCentreRowFilter] = useState("");
  const [dateColumnFilter, setDateColumnFilter] = useState("");
  const [hideZeroActivityCentres, setHideZeroActivityCentres] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "centre", desc: false }]);
  const [datePageIndex, setDatePageIndex] = useState(0);
  const [datesPerPage, setDatesPerPage] = useState(DEFAULT_DATES_PER_PAGE);
  const [subjectFilter, setSubjectFilter] = useState<TimetableSubjectFilter>("ALL");

  const [urlHydrated, setUrlHydrated] = useState(false);

  const urlInitRef = useRef(false);

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
        if (!cancelled)
          setExamListError(e instanceof Error ? e.message : "Failed to load examinations");
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

    const cf = sp.get("cf");
    if (cf != null) setCentreRowFilter(cf);

    const df = sp.get("df");
    if (df != null) setDateColumnFilter(df);

    if (sp.get("hz") === "1") setHideZeroActivityCentres(true);

    const dpp = sp.get("dpp");
    if (dpp) {
      const n = Number.parseInt(dpp, 10);
      if (DATE_PAGE_SIZE_OPTIONS.includes(n as (typeof DATE_PAGE_SIZE_OPTIONS)[number])) setDatesPerPage(n);
    }

    const dp = sp.get("dp");
    if (dp) {
      const n = Number.parseInt(dp, 10);
      if (!Number.isNaN(n) && n >= 0) setDatePageIndex(n);
    }

    const st = sp.get("st");
    if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") setSubjectFilter(st);

    setUrlHydrated(true);
  }, [exams, searchParams]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (rowSearch.trim()) p.set("q", rowSearch.trim());
    if (centreRowFilter.trim()) p.set("cf", centreRowFilter.trim());
    if (dateColumnFilter.trim()) p.set("df", dateColumnFilter.trim());
    if (hideZeroActivityCentres) p.set("hz", "1");
    if (datesPerPage !== DEFAULT_DATES_PER_PAGE) p.set("dpp", String(datesPerPage));
    if (datePageIndex > 0) p.set("dp", String(datePageIndex));
    if (subjectFilter !== "ALL") p.set("st", subjectFilter);

    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    urlHydrated,
    examId,
    rowSearch,
    centreRowFilter,
    dateColumnFilter,
    hideZeroActivityCentres,
    datesPerPage,
    datePageIndex,
    subjectFilter,
    pathname,
    router,
    searchParams,
  ]);

  const loadExams = useCallback(async () => {
    setExamListError(null);
    setExamsLoading(true);
    try {
      const list = await apiJson<Examination[]>("/examinations");
      setExams(list);
      setExamId((cur) => {
        if (list.length === 0) return null;
        if (cur != null && list.some((e) => e.id === cur)) return cur;
        return list[0]!.id;
      });
    } catch (e) {
      setExamListError(e instanceof Error ? e.message : "Failed to load examinations");
    } finally {
      setExamsLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    if (examId === null) return;
    const runId = ++loadRunRef.current;
    setBusy(true);
    setSummaryError(null);
    setSummaryActive(false);
    setExaminationDates([]);
    setCentrePivotRows([]);
    setLoadingProgress(null);

    try {
      await loadFinanceCentreInvigilatorSummaryProgressive(
        { examId, subject_filter: subjectFilter },
        (item) => {
          if (loadRunRef.current !== runId) return;
          setCentrePivotRows((prev) =>
            prev.map((r) => (r.center_id === item.center_id ? centreItemToPivotRow(item) : r)),
          );
          setLoadingProgress((prev) => ({
            done: (prev?.done ?? 0) + 1,
            total: progressTotalRef.current,
          }));
        },
        (shell) => {
          if (loadRunRef.current !== runId) return;
          progressTotalRef.current = shell.centres.length;
          setExaminationDates(shell.examination_dates);
          setCentrePivotRows(shell.centres.map(shellCentreToPivotRow));
          setSummaryActive(true);
          setBusy(false);
          setLoadingProgress({ done: 0, total: shell.centres.length });
        },
      );
    } catch (e) {
      if (loadRunRef.current !== runId) return;
      setSummaryError(e instanceof Error ? e.message : "Failed to load summary");
      setSummaryActive(false);
      setBusy(false);
    }
  }, [examId, subjectFilter]);

  useEffect(() => {
    loadRunRef.current += 1;
    setSummaryActive(false);
    setCentrePivotRows([]);
    setExaminationDates([]);
    setLoadingProgress(null);
    setSummaryError(null);
  }, [examId, subjectFilter]);

  const allDatesSorted = examinationDates;

  /** Date columns after optional text filter (substring on ISO date) */
  const gridDates = useMemo(() => {
    const q = dateColumnFilter.trim().toLowerCase();
    if (!q) return allDatesSorted;
    return allDatesSorted.filter((d) => d.toLowerCase().includes(q));
  }, [allDatesSorted, dateColumnFilter]);

  const noDatesMatch =
    Boolean(dateColumnFilter.trim()) && gridDates.length === 0 && allDatesSorted.length > 0;

  const dateColumnPageCount = Math.max(1, Math.ceil(gridDates.length / datesPerPage));
  const datePageIndexSafe = Math.min(datePageIndex, dateColumnPageCount - 1);

  const gridDatesPage = useMemo(() => {
    const start = datePageIndexSafe * datesPerPage;
    return gridDates.slice(start, start + datesPerPage);
  }, [gridDates, datePageIndexSafe, datesPerPage]);

  /** Centre rows after centre filter */
  const gridCentreRows = useMemo(() => {
    const q = centreRowFilter.trim().toLowerCase();
    let rows = centrePivotRows;
    if (q) {
      rows = rows.filter(
        (r) => r.center_code.toLowerCase().includes(q) || r.center_name.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [centrePivotRows, centreRowFilter]);

  const tableRows = useMemo(() => {
    let rows = gridCentreRows;
    if (hideZeroActivityCentres)
      rows = rows.filter((r) => r.loadState === "loading" || r.rowTotalInv > 0);
    if (rowSearch.trim()) rows = rows.filter((r) => centreRowMatchesSearch(r, rowSearch.trim()));
    return rows;
  }, [gridCentreRows, hideZeroActivityCentres, rowSearch]);

  useEffect(() => {
    setDatePageIndex(0);
  }, [dateColumnFilter, hideZeroActivityCentres, examId, datesPerPage, centreRowFilter]);

  useEffect(() => {
    setDatePageIndex((i) => Math.min(i, Math.max(0, dateColumnPageCount - 1)));
  }, [dateColumnPageCount]);

  const keyboardNavPageCountRef = useRef(1);
  keyboardNavPageCountRef.current = dateColumnPageCount;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      const max = keyboardNavPageCountRef.current - 1;
      setDatePageIndex((i) =>
        e.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(max, i + 1),
      );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtersActive =
    Boolean(rowSearch.trim()) ||
    Boolean(centreRowFilter.trim()) ||
    Boolean(dateColumnFilter.trim()) ||
    hideZeroActivityCentres ||
    datesPerPage !== DEFAULT_DATES_PER_PAGE ||
    datePageIndex !== 0;

  const resetFilters = useCallback(() => {
    setRowSearch("");
    setCentreRowFilter("");
    setDateColumnFilter("");
    setHideZeroActivityCentres(false);
    setDatesPerPage(DEFAULT_DATES_PER_PAGE);
    setDatePageIndex(0);
  }, []);

  const activeExamLabel = useMemo(() => {
    if (examId == null) return null;
    return exams.find((e) => e.id === examId) ?? null;
  }, [examId, exams]);

  const legendId = "fin-summary-legend";
  const filterCentresHintId = "fin-filter-centres-hint";
  const filterDatesHintId = "fin-filter-dates-hint";

  const columns = useMemo((): ColumnDef<CentrePivotRow>[] => {
    const centreCol: ColumnDef<CentrePivotRow> = {
      id: "centre",
      accessorFn: (row) => row.center_code,
      header: "Examination centre",
      meta: {
        sortAriaLabel: "Sort by examination centre code",
        headerClassName:
          "sticky left-0 z-30 min-w-[10rem] border-r-2 border-border bg-muted text-foreground dark:bg-muted",
        cellClassName:
          "sticky left-0 z-20 border-r-2 border-border text-foreground",
        stickyOpaque: true,
      },
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs font-medium text-foreground">{row.original.center_code}</div>
          <div className="mt-0.5 line-clamp-2 max-w-26 text-[11px] text-muted-foreground">{row.original.center_name}</div>
        </div>
      ),
    };

    const dateCols: ColumnDef<CentrePivotRow>[] = gridDatesPage.map((examDate) => ({
      id: `date_${examDate}`,
      accessorFn: (row) => row.byDate[examDate]?.inv ?? null,
      header: () => (
        <div className="text-center">
          <div className="font-medium leading-tight text-foreground">{formatExamDateHeader(examDate)}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Inv.</div>
        </div>
      ),
      meta: {
        sortAriaLabel: `Sort by invigilators on ${examDate}`,
        headerClassName: "min-w-[5rem] bg-muted/50 text-center text-foreground",
        cellClassName: "min-w-[5rem] text-center tabular-nums align-middle",
      },
      cell: ({ row }) => {
        if (row.original.loadState === "loading") {
          return (
            <span
              className="mx-auto inline-block h-4 w-8 animate-pulse rounded bg-muted-foreground/20"
              aria-label="Loading invigilators"
            />
          );
        }
        const cell = row.original.byDate[examDate];
        if (!cell)
          return (
            <span className="text-muted-foreground" title="No session at this centre on this date">
              —
            </span>
          );
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "min-w-10 rounded-md px-1 py-0.5 tabular-nums text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring/40",
                )}
                title={`${cell.inv} invigilators · ${cell.cand} unique candidates — click for details`}
              >
                {cell.inv}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-56 text-sm" align="center">
              <p className="font-medium text-foreground">{row.original.center_name}</p>
              <p className="mt-1 text-muted-foreground">
                <span className="font-mono">{row.original.center_code}</span>
              </p>
              <dl className="mt-3 space-y-2 border-t border-border pt-3">
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-medium">{formatExamDateHeader(examDate)}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">Invigilators</dt>
                  <dd className="tabular-nums font-medium">{cell.inv}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">Unique candidates</dt>
                  <dd className="tabular-nums font-medium">{cell.cand}</dd>
                </div>
              </dl>
            </PopoverContent>
          </Popover>
        );
      },
      sortUndefined: "last",
    }));

    const totalCol: ColumnDef<CentrePivotRow> = {
      id: "rowTotalInv",
      accessorKey: "rowTotalInv",
      header: "Centre total",
      meta: {
        sortAriaLabel: "Sort by total invigilators for this centre (all dates in scope)",
        headerClassName:
          "sticky right-0 z-30 min-w-[5rem] border-l-2 border-border bg-muted text-right text-foreground dark:bg-muted",
        cellClassName:
          "sticky right-0 z-20 border-l-2 border-border text-right font-semibold tabular-nums text-foreground",
        stickyOpaque: true,
      },
      cell: ({ row, getValue }) =>
        row.original.loadState === "loading" ? (
          <span
            className="ml-auto inline-block h-4 w-8 animate-pulse rounded bg-muted-foreground/20"
            aria-label="Loading centre total"
          />
        ) : (
          <span title="Sum of invigilators for this centre across every examination date in the current subject scope">
            {getValue<number>()}
          </span>
        ),
    };

    return [centreCol, ...dateCols, totalCol];
  }, [gridDatesPage]);

  const table = useReactTable({
    data: tableRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const centresStillLoading =
    loadingProgress != null && loadingProgress.done < loadingProgress.total;

  const hasGrid = summaryActive && tableRows.length > 0 && gridDates.length > 0;
  const showEmptyTable =
    summaryActive && !busy && centrePivotRows.length > 0 && tableRows.length === 0;
  const showMainCard = examId != null;
  const showDatePagination = gridDates.length > 0 && dateColumnPageCount > 1;

  const exportCsv = useCallback(() => {
    if (gridDates.length === 0 || tableRows.length === 0) return;
    const csv = buildFinanceGridCsv(tableRows, gridDates);
    const slug = activeExamLabel
      ? `${activeExamLabel.year}-${activeExamLabel.exam_type}`.replace(/\s+/g, "_")
      : `exam-${examId}`;
    const subSlug =
      subjectFilter === "ALL" ? "all-subjects" : subjectFilter === "CORE_ONLY" ? "core" : "electives";
    downloadTextFile(
      `finance-centre-invigilators-${slug}-${subSlug}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }, [gridDates, tableRows, activeExamLabel, examId, subjectFilter]);

  const ariaSummary = `${tableRows.length} centre${tableRows.length === 1 ? "" : "s"} after filters, ${gridDates.length} examination date${gridDates.length === 1 ? "" : "s"} as columns`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Centre invigilator summary</h1>
        {activeExamLabel ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Selected exam:{" "}
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-medium text-foreground">
              {activeExamLabel.year}
              {activeExamLabel.exam_series ? ` ${activeExamLabel.exam_series}` : ""} — {activeExamLabel.exam_type}
            </span>
          </p>
        ) : examsLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading examinations…</p>
        ) : null}
        <details className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">How to read this table</summary>
          <p id={legendId} className="mt-2 text-muted-foreground">
            Each <strong>row</strong> is an examination centre; each <strong>column</strong> after the first is an
            examination date (header shows the date). Cell values are invigilators required (⌈unique candidates ÷ 30⌉) for
            that centre on that date, for the selected <strong>subject scope</strong>. The last column is the centre’s total
            across all dates in scope. Date columns paginate horizontally; centre and total columns stay fixed. Use{" "}
            <kbd className="rounded border border-border px-1">Alt</kbd> +{" "}
            <kbd className="rounded border border-border px-1">←</kbd> /{" "}
            <kbd className="rounded border border-border px-1">→</kbd> to change the date page when not typing in a field.
          </p>
        </details>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={filterFieldClass}>
            <label className={formLabelClass} htmlFor="fin-sum-exam">
              Examination
            </label>
            <select
              id="fin-sum-exam"
              className={filterControlClass}
              value={examId ?? ""}
              onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
              disabled={exams.length === 0}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.year}
                  {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                </option>
              ))}
            </select>
            <p className={filterHintClass} aria-hidden>
              &nbsp;
            </p>
          </div>
          <div className={filterFieldClass}>
            <label className={formLabelClass} htmlFor="fin-subject-scope">
              Subject scope
            </label>
            <select
              id="fin-subject-scope"
              className={filterControlClass}
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value as TimetableSubjectFilter)}
              disabled={exams.length === 0}
            >
              {SUBJECT_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={filterHintClass}>
              Limits which scheduled papers set the examination dates and invigilator totals (core, electives, or
              every subject).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="button"
            className={cn(btnSecondary, "gap-2", "min-h-11")}
            disabled={busy || examId === null}
            onClick={() => void loadSummary()}
            aria-busy={busy}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            {busy ? "Loading…" : summaryActive ? "Refresh" : "Load summary"}
          </button>
        </div>
      </div>

      {examListError ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p>{examListError}</p>
          <button type="button" className={btnSecondary} onClick={() => void loadExams()}>
            Retry
          </button>
        </div>
      ) : null}

      {exams.length === 0 && !examListError && !examsLoading ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          No examinations available. Nothing to show on this page yet.
        </p>
      ) : null}

      {summaryError ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p>{summaryError}</p>
          <button type="button" className={btnSecondary} onClick={() => void loadSummary()} disabled={busy || examId === null}>
            Retry
          </button>
        </div>
      ) : null}

      {showMainCard ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          {!summaryActive && !busy ? (
            <p className="text-sm text-muted-foreground">
              Pick <strong>Subject scope</strong> (all, core, or electives), then use <strong>Load summary</strong> above.
              Nothing is fetched until you load.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="fin-search-rows">
                Search centres
              </label>
              <input
                id="fin-search-rows"
                className={filterControlClass}
                placeholder="Centre code, name, date, counts…"
                value={rowSearch}
                onChange={(e) => setRowSearch(e.target.value)}
                disabled={busy && !summaryActive}
                aria-describedby={filterCentresHintId}
              />
              <p id={filterCentresHintId} className={filterHintClass}>
                Narrows which <strong>rows (centres)</strong> stay visible.
              </p>
            </div>
            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="fin-filter-centre-rows">
                Filter centre rows
              </label>
              <input
                id="fin-filter-centre-rows"
                className={filterControlClass}
                placeholder="Match centre code or name…"
                value={centreRowFilter}
                onChange={(e) => setCentreRowFilter(e.target.value)}
                disabled={busy && !summaryActive}
                aria-describedby="fin-filter-centre-rows-hint"
              />
              <p id="fin-filter-centre-rows-hint" className={filterHintClass}>
                Include only centres matching code or name.
              </p>
            </div>
            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="fin-filter-date-cols">
                Filter date columns
              </label>
              <input
                id="fin-filter-date-cols"
                className={filterControlClass}
                placeholder="Match examination date text (e.g. 2026-05)…"
                value={dateColumnFilter}
                onChange={(e) => setDateColumnFilter(e.target.value)}
                disabled={busy && !summaryActive}
                aria-describedby={filterDatesHintId}
              />
              <p id={filterDatesHintId} className={filterHintClass}>
                Limits which <strong>date columns</strong> appear and pagination.
              </p>
            </div>
            <div className={filterFieldClass}>
              <label className={formLabelClass} htmlFor="fin-dates-per-page">
                Dates per page
              </label>
              <select
                id="fin-dates-per-page"
                className={filterControlClass}
                value={datesPerPage}
                onChange={(e) =>
                  setDatesPerPage(Number.parseInt(e.target.value, 10) || DATE_PAGE_SIZE_OPTIONS[0])
                }
                disabled={busy && !summaryActive}
                aria-describedby={legendId}
              >
                {DATE_PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className={filterHintClass} aria-hidden>
                &nbsp;
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input-border"
                checked={hideZeroActivityCentres}
                onChange={(e) => setHideZeroActivityCentres(e.target.checked)}
                disabled={busy && !summaryActive}
              />
              Hide centres with no invigilators
            </label>
            {filtersActive ? (
              <button type="button" className={btnSecondary} onClick={resetFilters} disabled={busy && !summaryActive}>
                Reset filters
              </button>
            ) : null}
            <button
              type="button"
              className={cn(btnSecondary, "gap-2")}
              onClick={exportCsv}
              disabled={busy || !hasGrid || centresStillLoading}
              title="Export filtered centres and all date columns in scope (not only this page)"
            >
              <Download className="size-4 shrink-0" aria-hidden />
              Export CSV
            </button>
          </div>

          {busy && !summaryActive ? <SummaryTableSkeleton /> : null}

          {summaryActive && !busy && centrePivotRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invigilator data for this selection.</p>
          ) : null}

          {noDatesMatch ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              No examination dates match the date filter. Clear the filter or try different text.
            </p>
          ) : null}

          {showEmptyTable ? (
            <p className="text-sm text-muted-foreground">
              No centres match the current filters. Adjust filters above.
            </p>
          ) : null}

          {summaryActive && allDatesSorted.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {ariaSummary}
                {(centreRowFilter.trim() || dateColumnFilter.trim()) ? " (narrowing filters active)" : ""}
                {centresStillLoading && loadingProgress
                  ? ` · Loading invigilators: ${loadingProgress.done} / ${loadingProgress.total} centres`
                  : ""}
              </p>

              {!showDatePagination && gridDates.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  All {gridDates.length} date column{gridDates.length === 1 ? "" : "s"} visible on one page.
                </p>
              ) : null}

              {showDatePagination ? (
                <div
                  className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  title="Alt + ← / → to move between date column pages when not typing in a field"
                >
                  <p className="text-sm text-muted-foreground">
                    Date columns: <span className="font-medium text-foreground">{datePageIndexSafe + 1}</span> /{" "}
                    {dateColumnPageCount}{" "}
                    <span className="text-muted-foreground">
                      ({gridDatesPage.length} of {gridDates.length} dates shown)
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className={btnIcon}
                      aria-label="First date column page"
                      disabled={datePageIndexSafe <= 0}
                      onClick={() => setDatePageIndex(0)}
                    >
                      <ChevronsLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={btnIcon}
                      aria-label="Previous date column page"
                      disabled={datePageIndexSafe <= 0}
                      onClick={() => setDatePageIndex((i) => Math.max(0, i - 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={btnIcon}
                      aria-label="Next date column page"
                      disabled={datePageIndexSafe >= dateColumnPageCount - 1}
                      onClick={() => setDatePageIndex((i) => Math.min(dateColumnPageCount - 1, i + 1))}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={btnIcon}
                      aria-label="Last date column page"
                      disabled={datePageIndexSafe >= dateColumnPageCount - 1}
                      onClick={() => setDatePageIndex(dateColumnPageCount - 1)}
                    >
                      <ChevronsRight className="size-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              {hasGrid ? (
                <div className="relative rounded-md border border-border">
                  {centresStillLoading ? (
                    <div
                      className="absolute inset-0 z-40 flex items-start justify-center rounded-md bg-background/55 pt-16 backdrop-blur-[1px]"
                      aria-busy="true"
                      aria-label="Refreshing summary"
                    >
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                  <DataTable
                    table={table}
                    showFooter={false}
                    emptyMessage="No centres match the current filters."
                    striped
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceCentreSummaryPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <FinanceCentreSummaryContent />
    </RoleGuard>
  );
}
