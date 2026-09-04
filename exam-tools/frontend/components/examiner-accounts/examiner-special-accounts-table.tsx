"use client";

import { useMemo, useState } from "react";

import { ExaminerAllowanceBreakdownCell } from "@/components/examiner-allowance-breakdown";
import {
  ExaminerBankAccountCell,
  examinerRowIncompleteClass,
  isBankAccountIncomplete,
} from "@/components/examiner-accounts/examiner-accounts-table-cells";
import { ExaminerPayoutSideCell } from "@/components/examiner-accounts/examiner-payout-side-cell";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import type { AdminExaminerAllowanceRow } from "@/lib/api";
import {
  payoutAmountForView,
  payoutColumnLabel,
  type ExaminerPayoutView,
} from "@/lib/examiner-payout-view";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  officialAccountsTableLayoutClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const cellPad = "px-3 py-2 align-top";
const stickyBg = "bg-card";
const stickyBgIncomplete = "bg-amber-50/90 dark:bg-amber-950/40";

type SortKey = "full_name" | "description" | "paper1" | "paper2" | "payout";
type SortDir = "asc" | "desc";

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function sortSpecialRows(
  items: AdminExaminerAllowanceRow[],
  sortKey: SortKey,
  sortDir: SortDir,
  payoutView: ExaminerPayoutView,
): AdminExaminerAllowanceRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "full_name") cmp = compareText(a.full_name, b.full_name);
    else if (sortKey === "description") {
      cmp = compareText(a.payout_description ?? "", b.payout_description ?? "");
    } else if (sortKey === "paper1") {
      cmp = (a.paper_1_script_count ?? 0) - (b.paper_1_script_count ?? 0);
    } else if (sortKey === "paper2") {
      cmp = (a.paper_2_script_count ?? 0) - (b.paper_2_script_count ?? 0);
    } else {
      const an = Number.parseFloat(payoutAmountForView(a, payoutView)) || 0;
      const bn = Number.parseFloat(payoutAmountForView(b, payoutView)) || 0;
      cmp = an - bn;
    }
    return cmp * dir || compareText(a.full_name, b.full_name);
  });
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="tabular-nums text-[10px]" aria-hidden>
        {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </span>
    </button>
  );
}

type Props = {
  items: AdminExaminerAllowanceRow[];
  busy: boolean;
  emptyLabel: string;
  hasActiveFilters: boolean;
  page: number;
  total: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  payoutView?: ExaminerPayoutView;
  onEditAllocation: (row: AdminExaminerAllowanceRow) => void;
  onEditCeReportCount?: (row: AdminExaminerAllowanceRow) => void;
  onEditPayoutAdjustments?: (row: AdminExaminerAllowanceRow) => void;
};

export function ExaminerSpecialAccountsTable({
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
  payoutView = "all",
  onEditAllocation,
  onEditCeReportCount,
  onEditPayoutAdjustments,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedItems = useMemo(
    () => sortSpecialRows(items, sortKey, sortDir, payoutView),
    [items, sortKey, sortDir, payoutView],
  );

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  }

  const emptyMessage = hasActiveFilters ? "No special examiners match these filters." : emptyLabel;
  const colSpan = 7;

  return (
    <div className={officialAccountsTableLayoutClass}>
      <div className={officialAccountsTableScrollClass}>
        <div className="hidden md:block">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-xs backdrop-blur-sm">
              <tr className="border-b border-border text-left">
                <th className="sticky left-0 z-20 min-w-[14rem] bg-muted/95 px-3 py-1.5 font-medium text-muted-foreground">
                  <SortableHeader
                    label="Examiner"
                    sortKey="full_name"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-1.5 font-medium text-muted-foreground">
                  <SortableHeader
                    label="Description"
                    sortKey="description"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                  <SortableHeader
                    label="P1"
                    sortKey="paper1"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="ml-auto"
                  />
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                  <SortableHeader
                    label="P2"
                    sortKey="paper2"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="ml-auto"
                  />
                </th>
                <th className="px-3 py-1.5 font-medium text-muted-foreground">Account</th>
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
                <th className="px-3 py-1.5 font-medium text-muted-foreground"> </th>
              </tr>
            </thead>
            <tbody>
              {busy && sortedItems.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-border/60">
                    <td colSpan={colSpan} className="px-3 py-3">
                      <div className="h-4 rounded bg-muted/50" />
                    </td>
                  </tr>
                ))
              ) : null}
              {!busy && sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-10 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : null}
              {!busy &&
                sortedItems.map((row) => {
                  const incomplete = isBankAccountIncomplete(row);
                  const rowStickyBg = incomplete ? stickyBgIncomplete : stickyBg;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border/60 last:border-0 even:bg-muted/15 hover:bg-muted/30",
                        examinerRowIncompleteClass(row),
                      )}
                    >
                      <td className={cn(cellPad, "sticky left-0 z-[1] min-w-[14rem] max-w-[20rem]", rowStickyBg)}>
                        <ExaminerPayoutSideCell
                          row={row}
                          showRole
                          showRegion
                          onEditCeReportCount={onEditCeReportCount}
                          onEditPayoutAdjustments={onEditPayoutAdjustments}
                        />
                      </td>
                      <td className={cn(cellPad, "max-w-[14rem] truncate")} title={row.payout_description ?? undefined}>
                        {row.payout_description?.trim() || "—"}
                      </td>
                      <td className={cn(cellPad, "text-right tabular-nums")}>{row.paper_1_script_count ?? 0}</td>
                      <td className={cn(cellPad, "text-right tabular-nums")}>{row.paper_2_script_count ?? 0}</td>
                      <td className={cn(cellPad, "min-w-[10rem]")}>
                        <ExaminerBankAccountCell row={row} />
                      </td>
                      <td className={cn(cellPad, "text-right")}>
                        <ExaminerAllowanceBreakdownCell
                          row={row}
                          examinerName={row.full_name}
                          payoutView={payoutView}
                        />
                      </td>
                      <td className={cn(cellPad, "whitespace-nowrap")}>
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => onEditAllocation(row)}
                        >
                          Edit allocation
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
          {!busy &&
            sortedItems.map((row) => (
              <article
                key={row.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-3 shadow-sm",
                  examinerRowIncompleteClass(row),
                )}
              >
                <ExaminerPayoutSideCell
                  row={row}
                  showRole
                  showRegion
                  onEditCeReportCount={onEditCeReportCount}
                  onEditPayoutAdjustments={onEditPayoutAdjustments}
                />
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Description</dt>
                    <dd className="font-medium">{row.payout_description?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Scripts</dt>
                    <dd className="tabular-nums">
                      P1 {row.paper_1_script_count ?? 0} · P2 {row.paper_2_script_count ?? 0}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Account</dt>
                    <dd className="mt-1">
                      <ExaminerBankAccountCell row={row} />
                    </dd>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{payoutColumnLabel(payoutView)}</span>
                    <span className="font-medium tabular-nums">
                      {formatGhsAmount(payoutAmountForView(row, payoutView))}
                    </span>
                  </div>
                </dl>
                <div className="mt-3">
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => onEditAllocation(row)}
                  >
                    Edit allocation
                  </button>
                </div>
              </article>
            ))}
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
