"use client";

import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { SubjectScopeBadge, SubjectScopeLegend } from "@/components/subject-scope-badge";
import { OfficialAllowanceBreakdownCell } from "@/components/official-allowance-breakdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { displayBankCode, type AdminExamCentreOfficialRow } from "@/lib/api";
import {
  groupAdminOfficialRowsByCentre,
  type AdminOfficialSortDir,
  type AdminOfficialSortKey,
} from "@/lib/admin-exam-official-rows";
import {
  officialAccountsBtnSecondary,
  officialAccountsPanelFooterClass,
  officialAccountsTableLayoutClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const COL_SPAN_ALL = 11;
const COL_SPAN_NO_DESIGNATION = 10;

const cellCentre = "px-3 py-2.5 align-top text-xs text-muted-foreground";
const cellName = "px-3 py-2.5 align-top font-medium text-foreground";
const cellScope = "px-3 py-2.5 align-top whitespace-nowrap";

type Props = {
  items: AdminExamCentreOfficialRow[];
  busy: boolean;
  examId: number | null;
  showDesignationColumn: boolean;
  emptyLabel: string;
  hasActiveFilters?: boolean;
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  searchQuery?: string;
  sortKey: AdminOfficialSortKey;
  sortDir: AdminOfficialSortDir;
  onSortChange: (key: AdminOfficialSortKey) => void;
  groupByCentre?: boolean;
  clientFilteredCount?: number;
};

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

function SortableHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: AdminOfficialSortKey;
  activeKey: AdminOfficialSortKey;
  sortDir: AdminOfficialSortDir;
  onSort: (key: AdminOfficialSortKey) => void;
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

function ScopeHeaderHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Subject scope legend"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <SubjectScopeLegend />
      </PopoverContent>
    </Popover>
  );
}

function renderDataRow(
  row: AdminExamCentreOfficialRow,
  examId: number | null,
  showDesignationColumn: boolean,
  groupedUnderCentre?: boolean,
) {
  const isInvigilator = row.designation === "Invigilator";
  return (
    <tr
      key={row.id}
      className={cn("hover:bg-muted/30", isInvigilator && "bg-success/5")}
    >
      <td className={cellCentre} title={row.center_name}>
        {groupedUnderCentre ? (
          <span className="text-muted-foreground/50" aria-hidden>
            —
          </span>
        ) : (
          <>
            <span className="font-mono text-foreground">{row.center_code}</span>
            <br />
            <span className="line-clamp-2">{row.center_name}</span>
          </>
        )}
      </td>
      <td className={cn(cellName, groupedUnderCentre && "pl-6")}>{row.full_name}</td>
      {showDesignationColumn ? (
        <td className="px-3 py-2.5 align-top text-foreground">{row.designation}</td>
      ) : null}
      <td className={cellScope}>
        <SubjectScopeBadge scope={row.subject_scope} />
      </td>
      <td className="max-w-40 truncate px-3 py-2" title={row.bank_name}>
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
        <OfficialAllowanceBreakdownCell row={row} examinationId={examId} officialName={row.full_name} />
      </td>
    </tr>
  );
}

function MobileOfficialCard({
  row,
  examId,
  showDesignationColumn,
}: {
  row: AdminExamCentreOfficialRow;
  examId: number | null;
  showDesignationColumn: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.full_name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{row.center_code}</span> — {row.center_name}
          </p>
          {showDesignationColumn ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{row.designation}</p>
          ) : null}
        </div>
        <SubjectScopeBadge scope={row.subject_scope} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {row.bank_name}
        {row.account_number ? ` · ${row.account_number}` : ""}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <OfficialAllowanceBreakdownCell row={row} examinationId={examId} officialName={row.full_name} />
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
          <dt className="text-muted-foreground">Days</dt>
          <dd className="tabular-nums">{row.num_days}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="tabular-nums">{row.telephone_number || "—"}</dd>
        </dl>
      ) : null}
    </article>
  );
}

export function OfficialAccountsTable({
  items,
  busy,
  examId,
  showDesignationColumn,
  emptyLabel,
  hasActiveFilters = false,
  page,
  total,
  pageSize,
  onPageChange,
  searchQuery = "",
  sortKey,
  sortDir,
  onSortChange,
  groupByCentre = false,
  clientFilteredCount,
}: Props) {
  const colSpan = showDesignationColumn ? COL_SPAN_ALL : COL_SPAN_NO_DESIGNATION;
  const centreColSpan = showDesignationColumn ? 4 : 3;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const displayCount = clientFilteredCount ?? items.length;

  const grouped = useMemo(
    () => (groupByCentre ? groupAdminOfficialRowsByCentre(items) : null),
    [groupByCentre, items],
  );

  const [collapsedCentres, setCollapsedCentres] = useState<Set<string>>(new Set());

  const toggleCentre = (centerId: string) => {
    setCollapsedCentres((prev) => {
      const next = new Set(prev);
      if (next.has(centerId)) next.delete(centerId);
      else next.add(centerId);
      return next;
    });
  };

  const handleSort = (key: AdminOfficialSortKey) => {
    onSortChange(key);
  };

  const emptyMessage = useMemo(() => {
    if (searchQuery.trim() && displayCount === 0 && items.length > 0) {
      return "No matches on this page. Try another search or go to the next page.";
    }
    if (hasActiveFilters) {
      return `${emptyLabel} Try clearing region, centre, or scope filters.`;
    }
    return emptyLabel;
  }, [searchQuery, displayCount, items.length, hasActiveFilters, emptyLabel]);

  return (
    <div className={officialAccountsTableLayoutClass}>
      <div className={officialAccountsTableScrollClass}>
        <div className="hidden min-h-0 overflow-auto md:block">
          <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "11rem" }} />
              <col style={{ width: "12rem" }} />
              {showDesignationColumn ? <col style={{ width: "9rem" }} /> : null}
              <col style={{ width: "6.5rem" }} />
              <col style={{ width: "8rem" }} />
              <col style={{ width: "8rem" }} />
              <col style={{ width: "4.5rem" }} />
              <col style={{ width: "7rem" }} />
              <col style={{ width: "4rem" }} />
              <col style={{ width: "7rem" }} />
              <col style={{ width: "8.5rem" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border/60 bg-muted/30 text-left">
              <th colSpan={centreColSpan} className="bg-muted/30 px-3 py-2 align-bottom">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Centre & official
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
                Contact & duty
              </th>
              <th className="border-l border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Allowance
              </th>
              </tr>
              <tr className="border-b border-border bg-muted/50 text-left shadow-[0_1px_0_0_var(--border)]">
                <th className="bg-muted/50 px-3 py-2.5 align-bottom">
                <SortableHeader
                  label="Centre"
                  sortKey="center_code"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </th>
                <th className="bg-muted/50 px-3 py-2.5 align-bottom">
                <SortableHeader
                  label="Name"
                  sortKey="full_name"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              {showDesignationColumn ? (
                <th className="bg-muted/50 px-3 py-2.5 align-bottom font-semibold">Designation</th>
              ) : null}
              <th className="bg-muted/50 px-3 py-2.5 align-bottom font-semibold">
                <span className="inline-flex items-center whitespace-nowrap">
                  Scope
                  <ScopeHeaderHelp />
                </span>
              </th>
              <th className="border-l border-border/60 bg-muted/50 px-3 py-2.5 font-semibold">Bank</th>
              <th className="bg-muted/50 px-3 py-2.5 font-semibold">Branch</th>
              <th className="bg-muted/50 px-3 py-2.5 font-semibold">Code</th>
              <th className="bg-muted/50 px-3 py-2.5 font-semibold">Account no.</th>
              <th className="border-l border-border/60 bg-muted/50 px-3 py-2.5 font-semibold">Days</th>
              <th className="bg-muted/50 px-3 py-2.5 font-semibold">Phone</th>
              <th className="border-l border-border/60 bg-muted/50 px-3 py-2.5">
                <SortableHeader
                  label="Total allowance"
                  sortKey="total_payable"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
            {busy && items.length === 0 ? <TableSkeleton colSpan={colSpan} /> : null}
            {!busy && displayCount === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
                </td>
              </tr>
            ) : null}
            {!busy && displayCount > 0 && groupByCentre && grouped
              ? grouped.flatMap((group) => {
                  const collapsed = collapsedCentres.has(group.centerId);
                  const header = (
                    <tr key={`hdr-${group.centerId}`} className="bg-muted/25">
                      <td colSpan={colSpan} className="px-3 py-2">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          onClick={() => toggleCentre(group.centerId)}
                          aria-expanded={!collapsed}
                        >
                          {collapsed ? (
                            <ChevronRight className="size-4 shrink-0" aria-hidden />
                          ) : (
                            <ChevronDown className="size-4 shrink-0" aria-hidden />
                          )}
                          <span className="font-mono">{group.centerCode}</span>
                          <span className="font-normal text-muted-foreground">— {group.centerName}</span>
                          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                            {group.rows.length} official{group.rows.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                  if (collapsed) return [header];
                  return [
                    header,
                    ...group.rows.map((row) =>
                      renderDataRow(row, examId, showDesignationColumn, true),
                    ),
                  ];
                })
              : null}
            {!busy && displayCount > 0 && !groupByCentre
              ? items.map((row) => renderDataRow(row, examId, showDesignationColumn))
              : null}
            </tbody>
          </table>
        </div>

        <div className="min-h-0 overflow-auto p-4 md:hidden">
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
              <MobileOfficialCard
                key={row.id}
                row={row}
                examId={examId}
                showDesignationColumn={showDesignationColumn}
              />
            ))
          : null}
          </div>
        </div>
      </div>

      {total > 0 ? (
        <div className={cn(officialAccountsPanelFooterClass, "shrink-0")}>
          <p className="text-muted-foreground">
            {total > pageSize ? (
              <>
                Page {page} of {totalPages.toLocaleString()} · Showing{" "}
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
                {total.toLocaleString()}
              </>
            ) : (
              <>
                {total.toLocaleString()} record{total === 1 ? "" : "s"}
              </>
            )}
          </p>
          {total > pageSize ? (
            <div className="flex gap-2">
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                disabled={page <= 1 || busy}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                disabled={page >= totalPages || busy}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
