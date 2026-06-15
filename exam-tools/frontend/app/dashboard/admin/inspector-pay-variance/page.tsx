"use client";

import Link from "next/link";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";

import { ColumnHeaderLabel } from "@/components/inspector-analysis/column-header-label";
import { InspectorColumnsPopover } from "@/components/inspector-analysis/columns-popover";
import { InspectorAnalysisExportMenu } from "@/components/inspector-analysis/export-menu";
import { FilterSegment } from "@/components/inspector-analysis/filter-segment";
import { InspectorAnalysisFilterToolbar } from "@/components/inspector-analysis/filter-toolbar";
import { InspectorAnalysisHelpGlossary } from "@/components/inspector-analysis/help-glossary";
import { InspectorAnalysisTabs } from "@/components/inspector-analysis/inspector-analysis-tabs";
import { LoadingProgressBanner } from "@/components/inspector-analysis/loading-progress-banner";
import {
  inspectorColumnGroup,
  inspectorStickyCentreGroupHeaderMeta,
  inspectorStickyCentreLeafHeaderMeta,
} from "@/components/inspector-analysis/sticky-centre-column-meta";
import {
  loadingCell,
  moneyCell,
  moneyVarianceCell,
  numCell,
  varianceCell,
  varianceCellClass,
  varianceLabel,
} from "@/components/inspector-analysis/table-cells";
import { DataTable } from "@/components/data-table";
import { OfficialAccountsExamMeta, OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  downloadFinanceCentreInspectorAnalysisExport,
  inspectorAnalysisExportFilename,
  type InspectorAnalysisExportStyle,
  type TimetableSubjectFilter,
} from "@/lib/api";
import { INSPECTOR_ANALYSIS_HREF } from "@/lib/finance-nav";
import {
  countDaysPayVariances,
  countPayrollVsPostedVariances,
  isInspectorReportStale,
  matchesDaysPayFilter,
  matchesPayrollVsPostedFilter,
  parseDaysPayFilter,
  parsePayrollVsPostedFilter,
  patchInspectorAnalysisSearchParams,
  type DaysPayFilter,
  type PayrollVsPostedFilter,
} from "@/lib/inspector-analysis-page-utils";
import {
  formatExamLabel,
  isSubjectScopeSelected,
  type InspectorAnalysisTableRow,
  useInspectorAnalysisReport,
} from "@/lib/inspector-analysis-report";
import {
  OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF,
  officialAccountsPanelClass,
  officialAccountsPanelFooterClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

function centreSummaryHref(examId: number, centerId: string, subjectFilter: TimetableSubjectFilter): string {
  const q = new URLSearchParams();
  q.set("exam", String(examId));
  q.set("centerId", centerId);
  if (subjectFilter !== "ALL") q.set("st", subjectFilter);
  return `${OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF}?${q.toString()}`;
}

function InspectorPayVarianceContentInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tableRef = useRef<HTMLDivElement>(null);

  const report = useInspectorAnalysisReport();
  const {
    exams,
    examsLoading,
    examId,
    setExamId,
    examListError,
    subjectFilter,
    setSubjectFilter,
    candidatesPerInspector,
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
    scopeSelected,
    loadedCount,
    canLoad,
    loadSummary,
  } = report;

  const [daysPayFilter, setDaysPayFilter] = useState<DaysPayFilter>(() =>
    parseDaysPayFilter(searchParams.get("df")),
  );
  const [payrollFilter, setPayrollFilter] = useState<PayrollVsPostedFilter>(() =>
    parsePayrollVsPostedFilter(searchParams.get("pf")),
  );
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "centre", desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const isStale = isInspectorReportStale(loadedSummary, examId, subjectFilter, candidatesPerInspector);
  const daysPayCounts = useMemo(() => countDaysPayVariances(centreRows), [centreRows]);
  const payrollVsPostedCounts = useMemo(() => countPayrollVsPostedVariances(centreRows), [centreRows]);

  function onDaysPayFilterChange(filter: DaysPayFilter) {
    setDaysPayFilter(filter);
    patchInspectorAnalysisSearchParams(router, pathname, searchParams, {
      df: filter === "all" ? null : filter,
    });
  }

  function onPayrollFilterChange(filter: PayrollVsPostedFilter) {
    setPayrollFilter(filter);
    patchInspectorAnalysisSearchParams(router, pathname, searchParams, {
      pf: filter === "all" ? null : filter,
    });
  }

  const filteredRows = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    return centreRows.filter((r) => {
      if (!matchesDaysPayFilter(r, daysPayFilter)) return false;
      if (!matchesPayrollVsPostedFilter(r, payrollFilter)) return false;
      if (!q) return true;
      return r.center_code.toLowerCase().includes(q) || r.center_name.toLowerCase().includes(q);
    });
  }, [centreRows, rowSearch, daysPayFilter, payrollFilter]);

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyDaysPayFilter(filter: DaysPayFilter) {
    onDaysPayFilterChange(filter);
    scrollToTable();
  }

  function applyPayrollFilter(filter: PayrollVsPostedFilter) {
    onPayrollFilterChange(filter);
    scrollToTable();
  }

  const columns = useMemo<ColumnDef<InspectorAnalysisTableRow>[]>(
    () => [
      inspectorColumnGroup(
        "centre",
        "Centre",
        [
          {
            id: "centre",
            accessorFn: (row) => `${row.center_code} ${row.center_name}`,
            header: "Centre",
            enableHiding: false,
            cell: ({ row }) => {
              const r = row.original;
              if (examId == null || !isSubjectScopeSelected(subjectFilter)) {
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
            meta: inspectorStickyCentreLeafHeaderMeta,
          },
        ],
        inspectorStickyCentreGroupHeaderMeta,
      ),
      inspectorColumnGroup("scale", "Scale", [
        {
          accessorKey: "exam_days",
          header: () => (
            <ColumnHeaderLabel label="Exam days" tooltip="Timetable exam days at this centre." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
        {
          accessorKey: "max_inspector_assigned_days",
          header: () => (
            <ColumnHeaderLabel
              label="Max assigned"
              tooltip="Maximum roster days among paid external inspectors."
            />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
        {
          accessorKey: "assigned_days_variance",
          header: () => (
            <ColumnHeaderLabel label="Days var." tooltip="Max assigned roster days minus exam days." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? varianceCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
      ]),
      inspectorColumnGroup("roster", "Roster", [
        {
          accessorKey: "external_inspector_count",
          header: () => <ColumnHeaderLabel label="Paid" tooltip="Unique paid external inspectors." />,
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "posted_inspector_count",
          header: () => <ColumnHeaderLabel label="Posted" tooltip="Unique posted system inspectors." />,
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
      ]),
      inspectorColumnGroup("pay", "Pay", [
        {
          accessorKey: "total_inspector_pay_ghs",
          header: () => (
            <ColumnHeaderLabel label="Roster pay (GHS)" tooltip="Actual payroll total for external inspectors." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "pay_at_exam_days_ghs",
          header: () => (
            <ColumnHeaderLabel label="Pay @ exam days" tooltip="Pay if each paid inspector worked exactly exam days." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "pay_at_assigned_days_ghs",
          header: () => (
            <ColumnHeaderLabel label="Pay @ assigned" tooltip="Pay at each official's assigned roster days." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "days_pay_variance_ghs",
          header: () => (
            <ColumnHeaderLabel label="Days pay var." tooltip="Roster pay at assigned days minus pay at exam days." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyVarianceCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
        {
          accessorKey: "pay_at_posted_count_ghs",
          header: () => (
            <ColumnHeaderLabel label="Pay @ posted" tooltip="Hypothetical pay for posted headcount at exam-day rates." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "payroll_vs_posted_variance_ghs",
          header: () => (
            <ColumnHeaderLabel label="Payroll vs posted" tooltip="Actual roster pay minus hypothetical posted pay." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyVarianceCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
      ]),
    ],
    [examId, scopeSelected, subjectFilter],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  async function onExport(key: string) {
    if (examId === null || !selectedExam || !isSubjectScopeSelected(subjectFilter) || !loadedSummary) return;
    const exportStyle: InspectorAnalysisExportStyle = key === "rich" ? "rich" : "standard";
    setExportBusy(key);
    setExportError(null);
    try {
      const filename = inspectorAnalysisExportFilename(
        formatExamLabel(selectedExam),
        subjectFilter,
        "pay_variance",
        exportStyle,
      );
      await downloadFinanceCentreInspectorAnalysisExport({
        examId,
        subject_filter: subjectFilter,
        examLabel: formatExamLabel(selectedExam),
        summary: loadedSummary,
        filename,
        export_variant: "pay_variance",
        export_style: exportStyle,
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  const centresStillLoading = statsBusy;
  const exportDisabled = !!exportBusy || !loadedSummary || centresStillLoading || loadedCount < centreRows.length;
  const exportDisabledReason =
    !loadedSummary || centreRows.length === 0
      ? "Load the report first"
      : loadedCount < centreRows.length
        ? `Wait for all centres to finish loading (${loadedCount}/${centreRows.length})`
        : undefined;
  const displayError = summaryError ?? exportError;

  return (
    <TooltipProvider>
      <div className="min-w-0 space-y-6">
        <OfficialAccountsPageIntro
          description="Compare external inspector roster days and payouts against timetable exam days and posted headcount."
          meta={selectedExam ? <OfficialAccountsExamMeta>{formatExamLabel(selectedExam)}</OfficialAccountsExamMeta> : null}
          actions={
            <InspectorAnalysisExportMenu
              centreCount={centreRows.length}
              disabled={exportDisabled}
              disabledReason={exportDisabledReason}
              exportBusy={exportBusy}
              onExport={(key) => void onExport(key)}
            />
          }
        />

        <InspectorAnalysisTabs />

        <InspectorAnalysisHelpGlossary variant="pay_variance" />

        <div className={officialAccountsPanelClass}>
          <InspectorAnalysisFilterToolbar
            idPrefix="inspector-pay-variance"
            exams={exams}
            examsLoading={examsLoading}
            examId={examId}
            onExamIdChange={setExamId}
            subjectFilter={subjectFilter}
            onSubjectFilterChange={setSubjectFilter}
            rowSearch={rowSearch}
            onRowSearchChange={setRowSearch}
            summaryActive={summaryActive}
            scopeSelected={scopeSelected}
            canLoad={canLoad}
            shellBusy={shellBusy}
            statsBusy={statsBusy}
            loadedCount={loadedCount}
            centreCount={centreRows.length}
            isStale={isStale}
            onLoad={() => void loadSummary({ revalidate: summaryActive })}
            filterChips={
              summaryActive ? (
                <div className="space-y-3">
                  <FilterSegment
                    label="Days pay filter"
                    value={daysPayFilter}
                    onChange={onDaysPayFilterChange}
                    options={[
                      { value: "all", label: "All", count: daysPayCounts.all },
                      { value: "over", label: "Over exam-days pay", count: daysPayCounts.over },
                      { value: "under", label: "Under exam-days pay", count: daysPayCounts.under },
                      { value: "match", label: "Exact match", count: daysPayCounts.match },
                    ]}
                  />
                  <FilterSegment
                    label="Payroll vs posted filter"
                    value={payrollFilter}
                    onChange={onPayrollFilterChange}
                    options={[
                      { value: "all", label: "All", count: payrollVsPostedCounts.all },
                      { value: "over", label: "Payroll over posted", count: payrollVsPostedCounts.over },
                      { value: "under", label: "Payroll under posted", count: payrollVsPostedCounts.under },
                      { value: "match", label: "Exact match", count: payrollVsPostedCounts.match },
                    ]}
                  />
                </div>
              ) : null
            }
            tableToolbar={
              summaryActive ? (
                <InspectorColumnsPopover
                  table={table}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                />
              ) : null
            }
          />

          <div className="min-w-0 space-y-4 px-4 py-4 sm:px-5">
            <LoadingProgressBanner
              loadedCount={loadedCount}
              totalCount={centreRows.length}
              visible={summaryActive && statsBusy && centreRows.length > 0}
            />

            {examListError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {examListError}
              </p>
            ) : null}

            {displayError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {displayError}
              </p>
            ) : null}

            {summaryActive && totals ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Days: max assigned vs exam</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {totals.max_inspector_assigned_days.toLocaleString()} / {totals.exam_days.toLocaleString()}{" "}
                    <span className={cn("text-sm", varianceCellClass(totals.assigned_days_variance))}>
                      ({varianceLabel(totals.assigned_days_variance)})
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => applyDaysPayFilter("over")}
                >
                  <p className="text-xs text-muted-foreground">Days pay over baseline</p>
                  <p className="text-lg font-semibold">{moneyVarianceCell(totals.days_pay_variance_ghs)}</p>
                  <p className="text-xs text-muted-foreground">{daysPayCounts.over} centres over</p>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() =>
                    applyPayrollFilter(
                      Number(totals.payroll_vs_posted_variance_ghs) > 0
                        ? "over"
                        : Number(totals.payroll_vs_posted_variance_ghs) < 0
                          ? "under"
                          : "match",
                    )
                  }
                >
                  <p className="text-xs text-muted-foreground">Payroll vs posted</p>
                  <p className="text-lg font-semibold">{moneyVarianceCell(totals.payroll_vs_posted_variance_ghs)}</p>
                  <p className="text-xs text-muted-foreground">
                    {payrollVsPostedCounts.over} over · {payrollVsPostedCounts.under} under
                  </p>
                </button>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Roster pay (GHS)</p>
                  <p className="text-lg font-semibold tabular-nums">{moneyCell(totals.total_inspector_pay_ghs)}</p>
                </div>
              </div>
            ) : null}

            {summaryActive && filteredRows.length > 0 ? (
              <div ref={tableRef} className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {statsBusy
                    ? `Showing ${filteredRows.length.toLocaleString()} centres (loading ${loadedCount}/${centreRows.length})…`
                    : `${filteredRows.length.toLocaleString()} centre${filteredRows.length === 1 ? "" : "s"}`}
                </p>
                <DataTable
                  table={table}
                  showFooter={false}
                  striped
                  stickyHeader
                  wide
                  emptyMessage="No centres match the current filters."
                />
              </div>
            ) : null}

            {summaryActive && centreRows.length === 0 && !statsBusy ? (
              <p className="text-sm text-muted-foreground">No examination centres for this selection.</p>
            ) : null}

            {summaryActive && centreRows.length > 0 && filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No centres match the current filters.</p>
            ) : null}
          </div>

          {summaryActive && totals ? (
            <div className={officialAccountsPanelFooterClass}>
              <p className="text-xs text-muted-foreground">
                Totals: days pay{" "}
                {Number(totals.days_pay_variance_ghs).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                GHS · payroll vs posted{" "}
                {Number(totals.payroll_vs_posted_variance_ghs).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                GHS ·{" "}
                <Link href={INSPECTOR_ANALYSIS_HREF} className="text-primary hover:underline">
                  Staffing report
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

function InspectorPayVarianceContent() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <InspectorPayVarianceContentInner />
    </Suspense>
  );
}

export default function InspectorPayVariancePage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <InspectorPayVarianceContent />
    </RoleGuard>
  );
}
