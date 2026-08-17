"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList, SearchX } from "lucide-react";

import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { WorkforcePayableBreakdownCell } from "@/components/workforce/workforce-payable-breakdown";
import { displayBankCode, type WorkforcePayoutRow } from "@/lib/api";
import {
  officialAccountsBtnPrimary,
  officialAccountsTableLayoutClass,
  officialAccountsTablePageLayoutClass,
  officialAccountsTablePageScrollClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";
import type { WorkforceKind } from "@/lib/workforce-kind";
import {
  paperScriptCount,
  workforcePayoutMissingBank,
  type WorkforcePayoutSortDir,
  type WorkforcePayoutSortKey,
} from "@/lib/workforce-payout-rows";
import { cn } from "@/lib/utils";

const cellName = "px-3 py-2.5 align-top font-medium text-foreground";
const cellMuted = "px-3 py-2.5 align-top text-xs text-muted-foreground";

type Props = {
  items: WorkforcePayoutRow[];
  busy: boolean;
  emptyLabel: string;
  searchEmptyLabel?: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
  unitLabel: string;
  kind: WorkforceKind;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function CountCell({ value }: { value: number }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 text-right align-middle tabular-nums",
        value === 0 ? "text-muted-foreground/45" : "text-foreground",
      )}
    >
      {value.toLocaleString()}
    </td>
  );
}

function TableSkeleton({ rows = 6, colSpan }: { rows?: number; colSpan: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td colSpan={colSpan} className="px-3 py-3">
            <div className="h-8 rounded-lg bg-muted/50" />
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
  align = "left",
}: {
  label: string;
  sortKey: WorkforcePayoutSortKey;
  activeKey: WorkforcePayoutSortKey;
  sortDir: WorkforcePayoutSortDir;
  onSort: (key: WorkforcePayoutSortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-semibold hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        align === "right" && "ml-auto",
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

function EmptyState({
  colSpan,
  message,
  actionHref,
  actionLabel,
  searching,
}: {
  colSpan: number;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  searching: boolean;
}) {
  const Icon = searching ? SearchX : ClipboardList;
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16">
        <div className="mx-auto flex max-w-sm flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">{message}</p>
          {actionHref && actionLabel ? (
            <Link href={actionHref} className={cn(officialAccountsBtnPrimary, "mt-4 min-h-9 px-3.5 text-sm")}>
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function renderCheckerRow(row: WorkforcePayoutRow, ratesHref: string) {
  const missingBank = workforcePayoutMissingBank(row);
  return (
    <tr
      key={row.id}
      className={cn(
        "transition-colors hover:bg-muted/25",
        missingBank && "bg-amber-500/4 dark:bg-amber-400/5",
      )}
    >
      <td className="px-3 py-2.5 align-middle">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/12 text-[11px] font-semibold tracking-wide text-success"
            aria-hidden
          >
            {initials(row.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{row.full_name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {row.reference_code ? <span className="font-mono tabular-nums">{row.reference_code}</span> : null}
              {missingBank ? (
                <span className="inline-flex rounded-full bg-amber-500/12 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:text-amber-300">
                  No bank
                </span>
              ) : null}
            </span>
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="block truncate text-sm text-foreground">{row.bank_name ?? "—"}</span>
        <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground">
          {row.account_number ?? "No account"}
        </span>
      </td>
      <CountCell value={paperScriptCount(row, 1)} />
      <CountCell value={paperScriptCount(row, 2)} />
      <CountCell value={row.num_days} />
      <td className="px-3 py-2.5 text-right align-middle">
        <WorkforcePayableBreakdownCell
          row={row}
          personName={row.full_name}
          unitLabel="scripts"
          ratesHref={ratesHref}
          emphasis
          className="w-full"
        />
      </td>
    </tr>
  );
}

function renderClerkRow(row: WorkforcePayoutRow, unitLabel: string, ratesHref: string) {
  const missingBank = workforcePayoutMissingBank(row);
  return (
    <tr
      key={row.id}
      className={cn(
        "hover:bg-muted/30",
        missingBank && "border-l-2 border-l-amber-500 bg-amber-500/[0.06] dark:bg-amber-400/[0.08]",
      )}
    >
      <td className={cellName}>
        <span className="inline-flex flex-wrap items-center gap-2">
          {row.full_name}
          {missingBank ? (
            <span className="inline-flex rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              No bank
            </span>
          ) : null}
        </span>
      </td>
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

function MobilePayoutCard({
  row,
  unitLabel,
  ratesHref,
  checker,
}: {
  row: WorkforcePayoutRow;
  unitLabel: string;
  ratesHref: string;
  checker: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const missingBank = workforcePayoutMissingBank(row);
  return (
    <article
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-3.5",
        missingBank && "border-amber-500/30 bg-amber-500/4",
      )}
    >
      <div className="flex items-start gap-2.5">
        {checker ? (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/12 text-[11px] font-semibold text-success"
            aria-hidden
          >
            {initials(row.full_name)}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{row.full_name}</p>
          {row.reference_code ? (
            <p className="font-mono text-xs text-muted-foreground">{row.reference_code}</p>
          ) : null}
          {missingBank ? (
            <span className="mt-1 inline-flex rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              No bank details
            </span>
          ) : null}
        </div>
        {checker ? (
          <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            P1 {paperScriptCount(row, 1).toLocaleString()}
            <span className="mx-1 text-border">·</span>
            P2 {paperScriptCount(row, 2).toLocaleString()}
            <span className="mx-1 text-border">·</span>
            {row.num_days.toLocaleString()}d
          </span>
        ) : (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {row.completed_scripts.toLocaleString()} {unitLabel}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {row.bank_name ?? "No bank"}
        {row.account_number ? ` · ${row.account_number}` : ""}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <WorkforcePayableBreakdownCell
          row={row}
          personName={row.full_name}
          unitLabel={unitLabel}
          ratesHref={ratesHref}
          emphasis={checker}
        />
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
          {checker ? (
            <>
              <dt className="text-muted-foreground">Paper 1</dt>
              <dd className="tabular-nums">{paperScriptCount(row, 1).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Paper 2</dt>
              <dd className="tabular-nums">{paperScriptCount(row, 2).toLocaleString()}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Days</dt>
          <dd className="tabular-nums">{row.num_days.toLocaleString()}</dd>
        </dl>
      ) : null}
    </article>
  );
}

export function WorkforcePayoutsTable({
  items,
  busy,
  emptyLabel,
  searchEmptyLabel = "No matches for this search.",
  emptyActionHref,
  emptyActionLabel,
  unitLabel,
  kind,
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
  const checker = kind === "script-checker";
  const colSpan = checker ? 6 : 9;
  const displayCount = clientFilteredCount ?? items.length;
  const searching = Boolean(searchQuery.trim());

  const emptyMessage = useMemo(() => {
    if (searching && displayCount === 0) return searchEmptyLabel;
    return emptyLabel;
  }, [searching, displayCount, searchEmptyLabel, emptyLabel]);

  const showEmptyAction = !searching && displayCount === 0 && Boolean(emptyActionHref && emptyActionLabel);

  const tableLayoutClass = pageScroll ? officialAccountsTablePageLayoutClass : officialAccountsTableLayoutClass;
  const tableScrollClass = pageScroll ? officialAccountsTablePageScrollClass : officialAccountsTableScrollClass;
  const desktopTableWrapClass = pageScroll ? "hidden md:block" : "hidden min-h-0 overflow-auto md:block";
  const completedHeader = unitLabel === "entries" ? "Entries" : "Scripts";

  return (
    <div className={tableLayoutClass}>
      <div className={tableScrollClass}>
        <div className={desktopTableWrapClass}>
          <table
            className={cn("w-full table-fixed border-collapse text-sm", checker ? "min-w-3xl" : "min-w-[52rem]")}
          >
            {checker ? (
              <colgroup>
                <col style={{ width: "16rem" }} />
                <col style={{ width: "12rem" }} />
                <col style={{ width: "5.5rem" }} />
                <col style={{ width: "5.5rem" }} />
                <col style={{ width: "4.75rem" }} />
                <col style={{ width: "9rem" }} />
              </colgroup>
            ) : (
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
            )}
            <thead className="sticky top-0 z-10">
              {checker ? (
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="bg-muted/40 px-3 py-2.5 font-semibold">
                    <SortableHeader
                      label="Checker"
                      sortKey="full_name"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSortChange}
                    />
                  </th>
                  <th className="bg-muted/40 px-3 py-2.5 font-semibold">Bank</th>
                  <th className="bg-muted/40 px-3 py-2.5 text-right">
                    <SortableHeader
                      label="P1"
                      sortKey="paper1_script_count"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSortChange}
                      align="right"
                    />
                  </th>
                  <th className="bg-muted/40 px-3 py-2.5 text-right">
                    <SortableHeader
                      label="P2"
                      sortKey="paper2_script_count"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSortChange}
                      align="right"
                    />
                  </th>
                  <th className="bg-muted/40 px-3 py-2.5 text-right">
                    <SortableHeader
                      label="Days"
                      sortKey="num_days"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSortChange}
                      align="right"
                    />
                  </th>
                  <th className="bg-muted/40 px-3 py-2.5 text-right">
                    <SortableHeader
                      label="Payable"
                      sortKey="payable_ghs"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSortChange}
                      align="right"
                    />
                  </th>
                </tr>
              ) : (
                <>
                  <tr className="border-b border-border/60 bg-muted/30 text-left">
                    <th colSpan={2} className="bg-muted/30 px-3 py-2 align-bottom">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Person
                      </span>
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
                </>
              )}
            </thead>
            <tbody className={checker ? "divide-y divide-border/50" : "divide-y divide-border/70"}>
              {busy && items.length === 0 ? <TableSkeleton colSpan={colSpan} /> : null}
              {!busy && displayCount === 0 ? (
                <EmptyState
                  colSpan={colSpan}
                  message={emptyMessage}
                  actionHref={showEmptyAction ? emptyActionHref : undefined}
                  actionLabel={showEmptyAction ? emptyActionLabel : undefined}
                  searching={searching}
                />
              ) : null}
              {!busy && displayCount > 0
                ? items.map((row) =>
                    checker ? renderCheckerRow(row, ratesHref) : renderClerkRow(row, unitLabel, ratesHref),
                  )
                : null}
            </tbody>
          </table>
        </div>

        <div className={cn("p-4 md:hidden", pageScroll ? "overflow-x-auto" : "min-h-0 overflow-auto")}>
          <div className="space-y-3">
            {busy && items.length === 0 ? (
              <div className="space-y-2" role="status" aria-label="Loading">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />
                ))}
              </div>
            ) : null}
            {!busy && displayCount === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                  {searching ? <SearchX className="size-5" aria-hidden /> : <ClipboardList className="size-5" aria-hidden />}
                </span>
                <p className="mt-3 text-sm font-medium text-foreground">{emptyMessage}</p>
                {showEmptyAction ? (
                  <Link href={emptyActionHref!} className={cn(officialAccountsBtnPrimary, "mt-4 min-h-9 px-3.5 text-sm")}>
                    {emptyActionLabel}
                  </Link>
                ) : null}
              </div>
            ) : null}
            {!busy && displayCount > 0
              ? items.map((row) => (
                  <MobilePayoutCard
                    key={row.id}
                    row={row}
                    unitLabel={unitLabel}
                    ratesHref={ratesHref}
                    checker={checker}
                  />
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
