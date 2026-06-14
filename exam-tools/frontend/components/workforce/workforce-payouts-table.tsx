"use client";

import { useMemo, useState } from "react";

import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { WorkforcePayableBreakdownCell } from "@/components/workforce/workforce-payable-breakdown";
import { displayBankCode, type WorkforcePayoutRow } from "@/lib/api";
import {
  officialAccountsTableLayoutClass,
  officialAccountsTablePageLayoutClass,
  officialAccountsTablePageScrollClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";
import type { WorkforcePayoutSortDir, WorkforcePayoutSortKey } from "@/lib/workforce-payout-rows";
import { cn } from "@/lib/utils";

const COL_SPAN = 9;

const cellName = "px-3 py-2.5 align-top font-medium text-foreground";
const cellMuted = "px-3 py-2.5 align-top text-xs text-muted-foreground";

type Props = {
  items: WorkforcePayoutRow[];
  busy: boolean;
  emptyLabel: string;
  unitLabel: string;
  ratesHref: string;
  page: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  searchQuery?: string;
  sortKey: WorkforcePayoutSortKey;
  sortDir: WorkforcePayoutSortDir;
  onSortChange: (key: WorkforcePayoutSortKey) => void;
  clientFilteredCount?: number;
  pageScroll?: boolean;
};

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td colSpan={COL_SPAN} className="px-3 py-3">
            <div className="h-4 rounded bg-muted/50" />
          </td>
        </tr>
      ))}
    </>
  );
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
  sortKey: WorkforcePayoutSortKey;
  activeKey: WorkforcePayoutSortKey;
  sortDir: WorkforcePayoutSortDir;
  onSort: (key: WorkforcePayoutSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-semibold hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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

function renderDataRow(row: WorkforcePayoutRow, unitLabel: string, ratesHref: string) {
  return (
    <tr key={row.id} className="hover:bg-muted/30">
      <td className={cellName}>{row.full_name}</td>
      <td className={cn(cellMuted, "font-mono tabular-nums")}>{row.reference_code ?? "—"}</td>
      <td className="max-w-40 truncate border-l border-border/60 px-3 py-2 align-top" title={row.bank_name ?? undefined}>
        {row.bank_name ?? "—"}
      </td>
      <td className="max-w-40 truncate px-3 py-2 align-top text-xs text-muted-foreground" title={row.branch_name ?? undefined}>
        {row.branch_name ?? "—"}
      </td>
      <td className="px-3 py-2 align-top font-mono text-xs">{displayBankCode(row.bank_code)}</td>
      <td className="px-3 py-2 align-top font-mono text-xs tabular-nums">{row.account_number ?? "—"}</td>
      <td className="border-l border-border/60 px-3 py-2 align-top tabular-nums">{row.completed_scripts.toLocaleString()}</td>
      <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">{row.phone_number ?? "—"}</td>
      <td className="border-l border-border/60 px-3 py-2 align-top">
        <WorkforcePayableBreakdownCell
          row={row}
          personName={row.full_name}
          unitLabel={unitLabel}
          ratesHref={ratesHref}
        />
      </td>
    </tr>
  );
}

function MobilePayoutCard({ row, unitLabel, ratesHref }: { row: WorkforcePayoutRow; unitLabel: string; ratesHref: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.full_name}</p>
          {row.reference_code ? (
            <p className="font-mono text-xs text-muted-foreground">{row.reference_code}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {row.completed_scripts.toLocaleString()} {unitLabel}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {row.bank_name ?? "No bank"}
        {row.account_number ? ` · ${row.account_number}` : ""}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <WorkforcePayableBreakdownCell row={row} personName={row.full_name} unitLabel={unitLabel} ratesHref={ratesHref} />
        <button
          type="button"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide details" : "Details"}
        </button>
      </div>
      {expanded ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-xs">
          <dt className="text-muted-foreground">Branch</dt>
          <dd>{row.branch_name || "—"}</dd>
          <dt className="text-muted-foreground">Bank code</dt>
          <dd className="font-mono">{displayBankCode(row.bank_code)}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="tabular-nums">{row.phone_number || "—"}</dd>
        </dl>
      ) : null}
    </article>
  );
}

export function WorkforcePayoutsTable({
  items,
  busy,
  emptyLabel,
  unitLabel,
  ratesHref,
  page,
  total,
  pageSize,
  pageSizeOptions = [50, 100, 200, 500],
  onPageChange,
  onPageSizeChange,
  searchQuery = "",
  sortKey,
  sortDir,
  onSortChange,
  clientFilteredCount,
  pageScroll = false,
}: Props) {
  const displayCount = clientFilteredCount ?? items.length;

  const emptyMessage = useMemo(() => {
    if (searchQuery.trim() && displayCount === 0 && items.length > 0) {
      return "No matches on this page. Try another search or go to the next page.";
    }
    return emptyLabel;
  }, [searchQuery, displayCount, items.length, emptyLabel]);

  const tableLayoutClass = pageScroll ? officialAccountsTablePageLayoutClass : officialAccountsTableLayoutClass;
  const tableScrollClass = pageScroll ? officialAccountsTablePageScrollClass : officialAccountsTableScrollClass;
  const desktopTableWrapClass = pageScroll ? "hidden md:block" : "hidden min-h-0 overflow-auto md:block";
  const completedHeader = unitLabel === "entries" ? "Entries" : "Scripts";

  return (
    <div className={tableLayoutClass}>
      <div className={tableScrollClass}>
        <div className={desktopTableWrapClass}>
          <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "12rem" }} />
              <col style={{ width: "7rem" }} />
              <col style={{ width: "8rem" }} />
              <col style={{ width: "8rem" }} />
              <col style={{ width: "4.5rem" }} />
              <col style={{ width: "7rem" }} />
              <col style={{ width: "5.5rem" }} />
              <col style={{ width: "7rem" }} />
              <col style={{ width: "8.5rem" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border/60 bg-muted/30 text-left">
                <th colSpan={2} className="bg-muted/30 px-3 py-2 align-bottom">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Person</span>
                </th>
                <th
                  colSpan={4}
                  className="border-l border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Bank account
                </th>
                <th
                  colSpan={2}
                  className="border-l border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Contact & work
                </th>
                <th className="border-l border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payable
                </th>
              </tr>
              <tr className="border-b border-border bg-muted/50 text-left shadow-[0_1px_0_0_var(--border)]">
                <th className="bg-muted/50 px-3 py-2.5 align-bottom">
                  <SortableHeader
                    label="Name"
                    sortKey="full_name"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSortChange}
                  />
                </th>
                <th className="bg-muted/50 px-3 py-2.5 align-bottom font-semibold">Reference</th>
                <th className="border-l border-border/60 bg-muted/50 px-3 py-2.5 font-semibold">Bank</th>
                <th className="bg-muted/50 px-3 py-2.5 font-semibold">Branch</th>
                <th className="bg-muted/50 px-3 py-2.5 font-semibold">Code</th>
                <th className="bg-muted/50 px-3 py-2.5 font-semibold">Account no.</th>
                <th className="border-l border-border/60 bg-muted/50 px-3 py-2.5 align-bottom">
                  <SortableHeader
                    label={completedHeader}
                    sortKey="completed_scripts"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSortChange}
                  />
                </th>
                <th className="bg-muted/50 px-3 py-2.5 font-semibold">Phone</th>
                <th className="border-l border-border/60 bg-muted/50 px-3 py-2.5">
                  <SortableHeader
                    label="Total payable"
                    sortKey="payable_ghs"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSortChange}
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {busy && items.length === 0 ? <TableSkeleton /> : null}
              {!busy && displayCount === 0 ? (
                <tr>
                  <td colSpan={COL_SPAN} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
                  </td>
                </tr>
              ) : null}
              {!busy && displayCount > 0 ? items.map((row) => renderDataRow(row, unitLabel, ratesHref)) : null}
            </tbody>
          </table>
        </div>

        <div className={cn("p-4 md:hidden", pageScroll ? "overflow-x-auto" : "min-h-0 overflow-auto")}>
          <div className="space-y-3">
            {busy && items.length === 0 ? (
              <div className="space-y-2" role="status" aria-label="Loading">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
                ))}
              </div>
            ) : null}
            {!busy && displayCount === 0 ? (
              <p className="py-8 text-center text-sm font-medium text-foreground">{emptyMessage}</p>
            ) : null}
            {!busy && displayCount > 0
              ? items.map((row) => (
                  <MobilePayoutCard key={row.id} row={row} unitLabel={unitLabel} ratesHref={ratesHref} />
                ))
              : null}
          </div>
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
      />
    </div>
  );
}
