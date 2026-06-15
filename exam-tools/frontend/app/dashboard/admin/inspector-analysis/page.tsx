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
import { AlertTriangle } from "lucide-react";
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
  type TimetableSubjectFilter,
  type InspectorAnalysisExportStyle,
} from "@/lib/api";
import { INSPECTOR_PAY_VARIANCE_HREF } from "@/lib/finance-nav";
import {
  countStaffingVariances,
  isInspectorReportStale,
  matchesStaffingFilter,
  parseStaffingFilter,
  patchInspectorAnalysisSearchParams,
  postedOnlyCount,
  type StaffingFilter,
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
import { REGION_OPTIONS } from "@/lib/school-enums";

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {};

function centreSummaryHref(examId: number, centerId: string, subjectFilter: TimetableSubjectFilter): string {
  const q = new URLSearchParams();
  q.set("exam", String(examId));
  q.set("centerId", centerId);
  if (subjectFilter !== "ALL") q.set("st", subjectFilter);
  return `${OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF}?${q.toString()}`;
}

function InspectorAnalysisContentInner() {
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
    setCandidatesPerInspector,
    regionFilter,
    setRegionFilter,
    regionOptions,
    centresScopeBusy,
    rowSearch,
    setRowSearch,
    regionScopedRows,
    loadedSummary,
    exportSummary,
    summaryActive,
    statsBusy,
    summaryError,
    shellBusy,
    selectedExam,
    totals,
    activeRatio,
    scopeSelected,
    scopedCentreCount,
    loadedCount,
    canLoad,
    loadSummary,
  } = report;

  const regionLabel = regionFilter
    ? (REGION_OPTIONS.find((r) => r.value === regionFilter)?.label ?? regionFilter)
    : null;

  const [staffingFilter, setStaffingFilter] = useState<StaffingFilter>(() =>
    parseStaffingFilter(searchParams.get("sf")),
  );
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "centre", desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);

  const isStale = isInspectorReportStale(loadedSummary, examId, subjectFilter, candidatesPerInspector);
  const varianceCounts = useMemo(() => countStaffingVariances(regionScopedRows), [regionScopedRows]);

  function onStaffingFilterChange(filter: StaffingFilter) {
    setStaffingFilter(filter);
    patchInspectorAnalysisSearchParams(router, pathname, searchParams, {
      sf: filter === "all" ? null : filter,
    });
  }

  const filteredRows = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    return regionScopedRows.filter((r) => {
      if (!matchesStaffingFilter(r, staffingFilter)) return false;
      if (!q) return true;
      return r.center_code.toLowerCase().includes(q) || r.center_name.toLowerCase().includes(q);
    });
  }, [regionScopedRows, rowSearch, staffingFilter]);

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyStaffingFilter(filter: StaffingFilter) {
    onStaffingFilterChange(filter);
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
              const postedOnly = postedOnlyCount(r);
              if (examId == null || !isSubjectScopeSelected(subjectFilter)) {
                return (
                  <span>
                    <span className="font-medium text-foreground">{r.center_code}</span>
                    <span className="text-muted-foreground"> — {r.center_name}</span>
                  </span>
                );
              }
              return (
                <div className="space-y-0.5">
                  <Link
                    href={centreSummaryHref(examId, r.center_id, subjectFilter)}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.center_code}
                    <span className="font-normal text-muted-foreground"> — {r.center_name}</span>
                  </Link>
                  {r.loadState === "loaded" && postedOnly > 0 ? (
                    <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="size-3 shrink-0" aria-hidden />
                      {postedOnly} posted not on payroll
                    </p>
                  ) : null}
                </div>
              );
            },
            meta: inspectorStickyCentreLeafHeaderMeta,
          },
        ],
        inspectorStickyCentreGroupHeaderMeta,
      ),
      inspectorColumnGroup("scale", "Scale", [
        {
          accessorKey: "total_candidates",
          header: () => (
            <ColumnHeaderLabel
              label="Candidates"
              tooltip="Peak-day candidate count in the selected subject scope."
            />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
        {
          accessorKey: "exam_days",
          header: () => (
            <ColumnHeaderLabel label="Exam days" tooltip="Distinct timetable exam dates at this centre." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
        {
          accessorKey: "inspectors_required",
          header: () => (
            <ColumnHeaderLabel
              label="Required"
              tooltip={`Inspectors required = ceil(candidates ÷ ${activeRatio}).`}
            />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
      ]),
      inspectorColumnGroup("roster", "Roster", [
        {
          accessorKey: "external_inspector_count",
          header: () => (
            <ColumnHeaderLabel label="Paid" tooltip="Unique paid external inspectors (deduped by phone)." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "posted_inspector_count",
          header: () => (
            <ColumnHeaderLabel label="Posted" tooltip="Unique system-posted inspectors at this centre." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "unique_inspector_count",
          header: () => (
            <ColumnHeaderLabel label="Unique" tooltip="Union of paid and posted unique phones." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
        {
          accessorKey: "inspectors_in_both",
          header: () => (
            <ColumnHeaderLabel label="In both" tooltip="Phones present on both payroll and postings." />
          ),
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? numCell(getValue<number>()) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
      ]),
      inspectorColumnGroup("staffing", "Staffing", [
        {
          accessorKey: "paid_inspector_variance",
          header: () => (
            <ColumnHeaderLabel
              label="Variance"
              tooltip="Paid unique phones minus required. Positive = over-staffed."
            />
          ),
          cell: ({ row, getValue }) => {
            if (row.original.loadState !== "loaded") return loadingCell();
            const v = getValue<number>();
            return (
              <div className="flex items-center justify-end gap-1.5">
                {postedOnlyCount(row.original) > 0 ? (
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                ) : null}
                {varianceCell(v)}
              </div>
            );
          },
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
        {
          accessorKey: "candidates_per_paid_inspector",
          header: () => (
            <ColumnHeaderLabel
              label="Cand./inspector"
              tooltip="Actual candidates per paid inspector when count > 0."
            />
          ),
          cell: ({ row }) => {
            if (row.original.loadState !== "loaded") return loadingCell();
            const v = row.original.candidates_per_paid_inspector;
            return v == null ? "—" : <span className="tabular-nums">{v.toLocaleString()}</span>;
          },
          meta: { headerClassName: "text-right bg-muted/20", cellClassName: "text-right" },
        },
      ]),
      inspectorColumnGroup("pay", "Pay", [
        {
          accessorKey: "total_inspector_pay_ghs",
          header: () => <ColumnHeaderLabel label="Total pay (GHS)" tooltip="Sum of external inspector roster pay." />,
          cell: ({ row, getValue }) =>
            row.original.loadState === "loaded" ? moneyCell(String(getValue())) : loadingCell(),
          meta: { headerClassName: "text-right", cellClassName: "text-right" },
        },
      ]),
    ],
    [examId, scopeSelected, subjectFilter, activeRatio],
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
    if (examId === null || !selectedExam || !isSubjectScopeSelected(subjectFilter) || !exportSummary) return;
    const exportStyle: InspectorAnalysisExportStyle = key === "rich" ? "rich" : "standard";
    setExportBusy(key);
    setExportError(null);
    try {
      const filename = inspectorAnalysisExportFilename(
        formatExamLabel(selectedExam),
        subjectFilter,
        "staffing",
        exportStyle,
      );
      await downloadFinanceCentreInspectorAnalysisExport({
        examId,
        subject_filter: subjectFilter,
        examLabel: formatExamLabel(selectedExam),
        summary: exportSummary,
        filename,
        export_variant: "staffing",
        export_style: exportStyle,
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  const centresStillLoading = statsBusy;
  const exportDisabled =
    !!exportBusy || !exportSummary || centresStillLoading || loadedCount < scopedCentreCount;
  const exportDisabledReason =
    !exportSummary || scopedCentreCount === 0
      ? "Load the report first"
      : loadedCount < scopedCentreCount
        ? `Wait for all centres to finish loading (${loadedCount}/${scopedCentreCount})`
        : undefined;
  const displayError = summaryError ?? exportError;

  return (
    <TooltipProvider>
      <div className="min-w-0 space-y-6">
        <OfficialAccountsPageIntro
          description="Review external inspector staffing per centre. Compare paid roster headcount against your candidates-per-inspector rule and see posted system inspectors alongside payroll."
          meta={selectedExam ? <OfficialAccountsExamMeta>{formatExamLabel(selectedExam)}</OfficialAccountsExamMeta> : null}
          actions={
            <InspectorAnalysisExportMenu
              centreCount={scopedCentreCount}
              disabled={exportDisabled}
              disabledReason={exportDisabledReason}
              exportBusy={exportBusy}
              onExport={(key) => void onExport(key)}
            />
          }
        />

        <InspectorAnalysisTabs />

        <InspectorAnalysisHelpGlossary variant="staffing" activeRatio={activeRatio} />

        <div className={officialAccountsPanelClass}>
          <InspectorAnalysisFilterToolbar
            idPrefix="inspector-analysis"
            exams={exams}
            examsLoading={examsLoading}
            examId={examId}
            onExamIdChange={setExamId}
            subjectFilter={subjectFilter}
            onSubjectFilterChange={setSubjectFilter}
            showRatio
            candidatesPerInspector={candidatesPerInspector}
            onCandidatesPerInspectorChange={setCandidatesPerInspector}
            regionFilter={regionFilter}
            onRegionFilterChange={setRegionFilter}
            regionOptions={regionOptions}
            regionsDisabled={centresScopeBusy}
            rowSearch={rowSearch}
            onRowSearchChange={setRowSearch}
            summaryActive={summaryActive}
            scopeSelected={scopeSelected}
            canLoad={canLoad}
            shellBusy={shellBusy}
            statsBusy={statsBusy}
            loadedCount={loadedCount}
            centreCount={scopedCentreCount}
            isStale={isStale}
            onLoad={() => void loadSummary({ revalidate: summaryActive })}
            filterChips={
              summaryActive ? (
                <FilterSegment
                  label="Staffing filter"
                  value={staffingFilter}
                  onChange={onStaffingFilterChange}
                  options={[
                    { value: "all", label: "All", count: varianceCounts.all },
                    { value: "over", label: "Over-staffed", count: varianceCounts.over },
                    { value: "under", label: "Under-staffed", count: varianceCounts.under },
                    { value: "match", label: "Exact match", count: varianceCounts.match },
                    { value: "payroll_gaps", label: "Payroll gaps", count: varianceCounts.payrollGaps },
                  ]}
                />
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
              totalCount={scopedCentreCount}
              visible={summaryActive && statsBusy && scopedCentreCount > 0}
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
              <div className="space-y-3">
                {regionLabel ? (
                  <p className="text-sm text-muted-foreground">
                    Showing analysis for <span className="font-medium text-foreground">{regionLabel}</span> only.
                  </p>
                ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Rule</p>
                  <p className="text-lg font-semibold tabular-nums">1 / {activeRatio.toLocaleString()} candidates</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Paid / required</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {totals.external_inspector_count.toLocaleString()} / {totals.inspectors_required.toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => applyStaffingFilter("over")}
                >
                  <p className="text-xs text-muted-foreground">Over-staffed centres</p>
                  <p className={cn("text-lg font-semibold tabular-nums", varianceCellClass(1))}>
                    {varianceCounts.over.toLocaleString()}
                  </p>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => applyStaffingFilter("under")}
                >
                  <p className="text-xs text-muted-foreground">Under-staffed centres</p>
                  <p className={cn("text-lg font-semibold tabular-nums", varianceCellClass(-1))}>
                    {varianceCounts.under.toLocaleString()}
                  </p>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => applyStaffingFilter("payroll_gaps")}
                >
                  <p className="text-xs text-muted-foreground">Payroll gaps</p>
                  <p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                    {varianceCounts.payrollGaps.toLocaleString()}
                  </p>
                </button>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Total pay (GHS)</p>
                  <p className="text-lg font-semibold tabular-nums">{moneyCell(totals.total_inspector_pay_ghs)}</p>
                </div>
              </div>
              </div>
            ) : null}

            {summaryActive && scopedCentreCount === 0 && !statsBusy ? (
              <p className="text-sm text-muted-foreground">No examination centres in this region for the selected scope.</p>
            ) : null}

            {summaryActive && filteredRows.length > 0 ? (
              <div ref={tableRef} className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {statsBusy
                    ? `Showing ${filteredRows.length.toLocaleString()} centres (loading ${loadedCount}/${scopedCentreCount})…`
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

            {summaryActive && regionScopedRows.length === 0 && !statsBusy && scopedCentreCount === 0 ? (
              <p className="text-sm text-muted-foreground">No examination centres for this selection.</p>
            ) : null}

            {summaryActive && scopedCentreCount > 0 && filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No centres match the current filters.</p>
            ) : null}
          </div>

          {summaryActive && totals ? (
            <div className={officialAccountsPanelFooterClass}>
              <p className="text-xs text-muted-foreground">
                Totals: {totals.total_candidates.toLocaleString()} candidates · {totals.external_inspector_count.toLocaleString()} paid ·{" "}
                {totals.posted_inspector_count.toLocaleString()} posted · staffing {varianceLabel(totals.paid_inspector_variance)} ·{" "}
                <Link href={INSPECTOR_PAY_VARIANCE_HREF} className="text-primary hover:underline">
                  Pay variance report
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

function InspectorAnalysisContent() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <InspectorAnalysisContentInner />
    </Suspense>
  );
}

export default function InspectorAnalysisPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <InspectorAnalysisContent />
    </RoleGuard>
  );
}
