"use client";

import { useMemo, useState } from "react";
import type { VisibilityState } from "@tanstack/react-table";

import { ExaminerAllowanceBreakdownCell } from "@/components/examiner-allowance-breakdown";
import { ExaminerAccountsMobileCard } from "@/components/examiner-accounts/examiner-accounts-mobile-card";
import {
  ExaminerBankAccountCell,
  ExaminerIdentityCell,
  ExaminerScriptsCell,
  examinerRowIncompleteClass,
} from "@/components/examiner-accounts/examiner-accounts-table-cells";
import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { displayBankCode, type AdminExaminerAllowanceRow, type ExaminerTypeApi } from "@/lib/api";
import {
  examinerAccountsTableColSpan,
  isExaminerAccountsColumnVisible,
  type ExaminerAccountsTableLayout,
  usesSplitBankColumns,
} from "@/lib/examiner-accounts-table-columns";
import {
  scriptsCountForRow,
  sortExaminerAccountRows,
  toggleExaminerAccountsSort,
  type ExaminerAccountsSortDir,
  type ExaminerAccountsSortKey,
} from "@/lib/examiner-accounts-sort";
import { scriptSourceColumnValue, scriptSourceSummary } from "@/lib/examiner-script-source";
import { payoutColumnLabel, type ExaminerPayoutView } from "@/lib/examiner-payout-view";
import { cn } from "@/lib/utils";
import {
  officialAccountsTableLayoutClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";

type Props = {
  items: AdminExaminerAllowanceRow[];
  busy: boolean;
  emptyLabel: string;
  hasActiveFilters?: boolean;
  page: number;
  total: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  subjectId?: number | null;
  paperNumber?: number | null;
  payoutView?: ExaminerPayoutView;
  columnVisibility: VisibilityState;
  layout?: ExaminerAccountsTableLayout;
};

const cellPad = "px-3 py-2 align-top";
const stickyBg = "bg-card";

function SortableHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: ExaminerAccountsSortKey;
  activeKey: ExaminerAccountsSortKey;
  sortDir: ExaminerAccountsSortDir;
  onSort: (key: ExaminerAccountsSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active && "text-foreground",
        className,
      )}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {active ? <span className="text-[10px] text-muted-foreground">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

function TableSkeleton({ colSpan, rows = 6 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td colSpan={colSpan} className="px-3 py-3">
            <div className="h-4 rounded bg-muted/50" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function ExaminerAccountsTable({
  items,
  busy,
  emptyLabel,
  hasActiveFilters,
  page,
  total,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  subjectId = null,
  paperNumber = null,
  payoutView = "all",
  columnVisibility,
  layout = "composite",
}: Props) {
  const [sortKey, setSortKey] = useState<ExaminerAccountsSortKey>("full_name");
  const [sortDir, setSortDir] = useState<ExaminerAccountsSortDir>("asc");

  const showSubjectScripts = subjectId != null;
  const splitBank = usesSplitBankColumns(columnVisibility);
  const useComposite = layout === "composite";
  const colSpan = examinerAccountsTableColSpan(columnVisibility, showSubjectScripts, layout);

  const showRole = isExaminerAccountsColumnVisible(columnVisibility, "role");
  const showRegion = isExaminerAccountsColumnVisible(columnVisibility, "region");
  const showSubjects = !showSubjectScripts && isExaminerAccountsColumnVisible(columnVisibility, "subjects");
  const showBank = isExaminerAccountsColumnVisible(columnVisibility, "bank");
  const showBranch = isExaminerAccountsColumnVisible(columnVisibility, "branch");
  const showAccount = isExaminerAccountsColumnVisible(columnVisibility, "account");
  const showSource = isExaminerAccountsColumnVisible(columnVisibility, "source");

  const sortedItems = useMemo(
    () =>
      sortExaminerAccountRows(items, sortKey, sortDir, {
        subjectId,
        paperNumber,
        payoutView,
      }),
    [items, sortKey, sortDir, subjectId, paperNumber, payoutView],
  );

  const scriptsHeader =
    showSubjectScripts && paperNumber != null
      ? `Scripts (P${paperNumber})`
      : showSubjectScripts
        ? "Scripts (subject)"
        : "Scripts";

  function handleSort(nextKey: ExaminerAccountsSortKey) {
    const next = toggleExaminerAccountsSort(sortKey, sortDir, nextKey);
    setSortKey(next.sortKey);
    setSortDir(next.sortDir);
  }

  function renderCompositeRow(row: AdminExaminerAllowanceRow, index: number) {
    const scriptCount = scriptsCountForRow(row, subjectId, paperNumber);
    const scriptSource = scriptSourceSummary(row.subject_breakdowns, {
      subjectId: showSubjectScripts ? subjectId : null,
      paperNumber: showSubjectScripts ? paperNumber : null,
    });
    const rowIndex = (page - 1) * pageSize + index + 1;

    return (
      <tr
        key={row.id}
        className={cn(
          "border-b border-border/60 last:border-0 even:bg-muted/15 hover:bg-muted/30",
          examinerRowIncompleteClass(row),
        )}
      >
        <td className={cn(cellPad, "sticky left-0 z-[1] min-w-[12rem] max-w-[18rem]", stickyBg)}>
          <ExaminerIdentityCell row={row} showRole={showRole} showRegion />
        </td>
        {splitBank ? (
          <>
            {showBank ? (
              <td className={cn(cellPad, "max-w-36 truncate")} title={row.bank_name ?? undefined}>
                {row.bank_name ?? "—"}
              </td>
            ) : null}
            {showBranch ? (
              <td className={cn(cellPad, "max-w-36 truncate text-xs text-muted-foreground")}>
                {row.branch_name ?? displayBankCode(row.bank_code) ?? "—"}
              </td>
            ) : null}
            {showAccount ? (
              <td className={cn(cellPad, "font-mono text-xs tabular-nums")}>{row.account_number ?? "—"}</td>
            ) : null}
          </>
        ) : (
          <td className={cn(cellPad, "min-w-[10rem]")}>
            <ExaminerBankAccountCell row={row} />
          </td>
        )}
        {showSubjects ? (
          <td className={cn(cellPad, "max-w-[14rem] truncate text-muted-foreground")} title={row.subject_names}>
            {row.subject_codes || "—"}
          </td>
        ) : null}
        <td className={cn(cellPad, "text-right")}>
          <ExaminerScriptsCell scriptCount={scriptCount} />
        </td>
        {showSource ? (
          <td className={cn(cellPad, "text-muted-foreground")}>
            {scriptCount > 0 ? scriptSourceColumnValue(scriptSource) : "—"}
          </td>
        ) : null}
        <td className={cn(cellPad, "text-right")}>
          <ExaminerAllowanceBreakdownCell row={row} examinerName={row.full_name} payoutView={payoutView} />
        </td>
      </tr>
    );
  }

  function renderClassicRow(row: AdminExaminerAllowanceRow, index: number) {
    const scriptCount = scriptsCountForRow(row, subjectId, paperNumber);
    const scriptSource = scriptSourceSummary(row.subject_breakdowns, {
      subjectId: showSubjectScripts ? subjectId : null,
      paperNumber: showSubjectScripts ? paperNumber : null,
    });

    return (
      <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
        <td className={cn(cellPad, "sticky left-0 z-[1] w-10 text-center tabular-nums text-muted-foreground", stickyBg)}>
          {(page - 1) * pageSize + index + 1}
        </td>
        <td className={cn(cellPad, "sticky left-10 z-[1] min-w-[8rem] font-medium", stickyBg)}>{row.full_name}</td>
        {showRole ? (
          <td className={cellPad} title={EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type}>
            {EXAMINER_TYPE_ABBREVIATIONS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type}
          </td>
        ) : null}
        {showRegion ? <td className={cn(cellPad, "text-muted-foreground")}>{row.region || "—"}</td> : null}
        {showSubjects ? (
          <td className={cn(cellPad, "max-w-[14rem] truncate text-muted-foreground")} title={row.subject_names}>
            {row.subject_codes || "—"}
          </td>
        ) : null}
        {showBank ? (
          <td className={cn(cellPad, "max-w-36 truncate")} title={row.bank_name ?? undefined}>
            {row.bank_name ?? "—"}
          </td>
        ) : null}
        {showBranch ? (
          <td className={cn(cellPad, "max-w-36 truncate text-xs text-muted-foreground")}>
            {row.branch_name ?? displayBankCode(row.bank_code) ?? "—"}
          </td>
        ) : null}
        {showAccount ? (
          <td className={cn(cellPad, "font-mono text-xs tabular-nums")}>{row.account_number ?? "—"}</td>
        ) : null}
        <td className={cn(cellPad, "text-right tabular-nums")}>{scriptCount}</td>
        {showSource ? (
          <td className={cn(cellPad, "text-muted-foreground")}>
            {scriptCount > 0 ? scriptSourceColumnValue(scriptSource) : "—"}
          </td>
        ) : null}
        <td className={cn(cellPad, "text-right")}>
          <ExaminerAllowanceBreakdownCell row={row} examinerName={row.full_name} payoutView={payoutView} />
        </td>
      </tr>
    );
  }

  const emptyMessage = hasActiveFilters ? "No examiners match these filters." : emptyLabel;

  return (
    <div className={officialAccountsTableLayoutClass}>
      <div className={officialAccountsTableScrollClass}>
        <div className="hidden md:block">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-xs backdrop-blur-sm">
              <tr className="border-b border-border text-left">
                {useComposite ? (
                  <>
                    <th className="sticky left-0 z-20 min-w-[12rem] bg-muted/95 px-3 py-1.5 font-medium text-muted-foreground">
                      <SortableHeader
                        label="Examiner"
                        sortKey="full_name"
                        activeKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    {splitBank ? (
                      <>
                        {showBank ? (
                          <th className="px-3 py-1.5 font-medium text-muted-foreground">
                            <SortableHeader
                              label="Bank"
                              sortKey="bank_name"
                              activeKey={sortKey}
                              sortDir={sortDir}
                              onSort={handleSort}
                            />
                          </th>
                        ) : null}
                        {showBranch ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Branch</th> : null}
                        {showAccount ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Account</th> : null}
                      </>
                    ) : (
                      <th className="px-3 py-1.5 font-medium text-muted-foreground">
                        <SortableHeader
                          label="Account"
                          sortKey="bank_name"
                          activeKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                      </th>
                    )}
                    {showSubjects ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Subjects</th> : null}
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                      <SortableHeader
                        label={scriptsHeader}
                        sortKey="scripts"
                        activeKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="ml-auto"
                      />
                    </th>
                    {showSource ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Source</th> : null}
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                      <SortableHeader
                        label={payoutColumnLabel(payoutView)}
                        sortKey="payout"
                        activeKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="ml-auto"
                      />
                    </th>
                  </>
                ) : (
                  <>
                    <th className="sticky left-0 z-20 w-10 bg-muted/95 px-2 py-1.5 text-center font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="sticky left-10 z-20 min-w-[8rem] bg-muted/95 px-3 py-1.5 font-medium text-muted-foreground">
                      <SortableHeader
                        label="Name"
                        sortKey="full_name"
                        activeKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    {showRole ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Role</th> : null}
                    {showRegion ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Region</th> : null}
                    {showSubjects ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Subjects</th> : null}
                    {showBank ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Bank</th> : null}
                    {showBranch ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Branch</th> : null}
                    {showAccount ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Account</th> : null}
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">{scriptsHeader}</th>
                    {showSource ? <th className="px-3 py-1.5 font-medium text-muted-foreground">Source</th> : null}
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                      {payoutColumnLabel(payoutView)}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {busy && sortedItems.length === 0 ? <TableSkeleton colSpan={colSpan} /> : null}
              {!busy && sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-10 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : null}
              {!busy && sortedItems.length > 0
                ? sortedItems.map((row, index) =>
                    useComposite ? renderCompositeRow(row, index) : renderClassicRow(row, index),
                  )
                : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {busy && sortedItems.length === 0 ? (
            <div className="space-y-2" role="status" aria-label="Loading">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          ) : null}
          {!busy && sortedItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : null}
          {!busy && sortedItems.length > 0
            ? sortedItems.map((row) => (
                <ExaminerAccountsMobileCard
                  key={row.id}
                  row={row}
                  scriptCount={scriptsCountForRow(row, subjectId, paperNumber)}
                  subjectId={showSubjectScripts ? subjectId : null}
                  paperNumber={showSubjectScripts ? paperNumber : null}
                  payoutView={payoutView}
                  showRole={showRole}
                  showRegion
                />
              ))
            : null}
        </div>
      </div>

      <OfficialAccountsPagination
        page={page}
        pageSize={pageSize}
        total={total}
        busy={busy}
        pageSizeOptions={pageSizeOptions}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        recordLabel="examiner"
      />
    </div>
  );
}
