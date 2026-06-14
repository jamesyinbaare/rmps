"use client";

import type { VisibilityState } from "@tanstack/react-table";

import { ExaminerAllowanceBreakdownCell } from "@/components/examiner-allowance-breakdown";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { displayBankCode, type AdminExaminerAllowanceRow, type ExaminerTypeApi } from "@/lib/api";
import {
  examinerAccountsTableColSpan,
  isExaminerAccountsColumnVisible,
} from "@/lib/examiner-accounts-table-columns";
import { scriptSourceColumnValue, scriptSourceSummary } from "@/lib/examiner-script-source";
import { EXAMINER_PAYOUT_VIEW_OPTIONS, payoutColumnLabel, type ExaminerPayoutView } from "@/lib/examiner-payout-view";
import { cn } from "@/lib/utils";
import { officialAccountsCommandBarControlClass } from "@/lib/official-accounts-zone";
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
  /** When set, show scripts for this subject instead of total allocated scripts. */
  subjectId?: number | null;
  /** When set with subjectId, show scripts for this paper only. */
  paperNumber?: number | null;
  payoutView?: ExaminerPayoutView;
  onPayoutViewChange?: (view: ExaminerPayoutView) => void;
  columnVisibility: VisibilityState;
};

const payoutViewSelectClass = cn(
  officialAccountsCommandBarControlClass,
  "mt-1 h-8 w-full min-w-[10rem] max-w-[14rem] border-input-border bg-input text-xs shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30",
);

function scriptsForSubject(
  row: AdminExaminerAllowanceRow,
  subjectId: number,
  paperNumber?: number | null,
): number {
  return row.subject_breakdowns
    .filter((b) => b.subject_id === subjectId && (paperNumber == null || b.paper_number === paperNumber))
    .reduce((sum, b) => sum + b.allocated_booklets, 0);
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
  onPayoutViewChange,
  columnVisibility,
}: Props) {
  const showSubjectScripts = subjectId != null;
  const colSpan = examinerAccountsTableColSpan(columnVisibility, showSubjectScripts);
  const showRole = isExaminerAccountsColumnVisible(columnVisibility, "role");
  const showRegion = isExaminerAccountsColumnVisible(columnVisibility, "region");
  const showSubjects = !showSubjectScripts && isExaminerAccountsColumnVisible(columnVisibility, "subjects");
  const showBank = isExaminerAccountsColumnVisible(columnVisibility, "bank");
  const showBranch = isExaminerAccountsColumnVisible(columnVisibility, "branch");
  const showAccount = isExaminerAccountsColumnVisible(columnVisibility, "account");
  const showSource = isExaminerAccountsColumnVisible(columnVisibility, "source");
  const scriptsHeader =
    showSubjectScripts && paperNumber != null ? `Scripts (P${paperNumber})` : showSubjectScripts ? "Scripts (subject)" : "Scripts";

  return (
    <div className={officialAccountsTableLayoutClass}>
      <div className={officialAccountsTableScrollClass}>
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            <tr className="border-b border-border text-left">
              <th className="sticky left-0 z-20 w-10 min-w-10 bg-muted/95 px-2 py-2.5 text-center font-semibold">
                #
              </th>
              <th className="sticky left-10 z-20 min-w-[8rem] bg-muted/95 px-3 py-2.5 font-semibold">Name</th>
              {showRole ? <th className="px-3 py-2.5 font-semibold">Role</th> : null}
              {showRegion ? <th className="px-3 py-2.5 font-semibold">Region</th> : null}
              {showSubjects ? <th className="px-3 py-2.5 font-semibold">Subjects</th> : null}
              {showBank ? <th className="px-3 py-2.5 font-semibold">Bank</th> : null}
              {showBranch ? <th className="px-3 py-2.5 font-semibold">Branch</th> : null}
              {showAccount ? <th className="px-3 py-2.5 font-semibold">Account</th> : null}
              <th className="px-3 py-2.5 text-right font-semibold">{scriptsHeader}</th>
              {showSource ? <th className="px-3 py-2.5 font-semibold">Source</th> : null}
              <th className="min-w-[11rem] px-3 py-2.5 text-right align-bottom font-semibold">
                {onPayoutViewChange ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="examiner-table-payout-view">
                      Payout view
                    </label>
                    <select
                      id="examiner-table-payout-view"
                      className={payoutViewSelectClass}
                      value={payoutView}
                      onChange={(e) => onPayoutViewChange(e.target.value as ExaminerPayoutView)}
                    >
                      {EXAMINER_PAYOUT_VIEW_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  payoutColumnLabel(payoutView)
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 ? (
              <TableSkeleton colSpan={colSpan} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-10 text-center text-muted-foreground">
                  {hasActiveFilters ? "No examiners match these filters." : emptyLabel}
                </td>
              </tr>
            ) : (
              items.map((row, index) => {
                const scriptCount =
                  showSubjectScripts && subjectId != null
                    ? scriptsForSubject(row, subjectId, paperNumber)
                    : row.total_allocated_scripts;
                const scriptSource = scriptSourceSummary(row.subject_breakdowns, {
                  subjectId: showSubjectScripts ? subjectId : null,
                  paperNumber: showSubjectScripts ? paperNumber : null,
                });
                return (
                  <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="sticky left-0 z-[1] bg-card px-2 py-2.5 text-center align-top tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + index + 1}
                    </td>
                    <td className="sticky left-10 z-[1] bg-card px-3 py-2.5 align-top font-medium text-foreground">
                      {row.full_name}
                    </td>
                    {showRole ? (
                      <td className="px-3 py-2.5 align-top text-foreground">
                        {EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type}
                      </td>
                    ) : null}
                    {showRegion ? (
                      <td className="px-3 py-2.5 align-top text-muted-foreground">{row.region || "—"}</td>
                    ) : null}
                    {showSubjects ? (
                      <td
                        className="max-w-[14rem] truncate px-3 py-2.5 align-top text-muted-foreground"
                        title={row.subject_names}
                      >
                        {row.subject_codes || "—"}
                      </td>
                    ) : null}
                    {showBank ? (
                      <td className="max-w-36 truncate px-3 py-2.5 align-top" title={row.bank_name ?? undefined}>
                        {row.bank_name ?? "—"}
                      </td>
                    ) : null}
                    {showBranch ? (
                      <td className="max-w-36 truncate px-3 py-2.5 align-top text-xs text-muted-foreground">
                        {row.branch_name ?? displayBankCode(row.bank_code) ?? "—"}
                      </td>
                    ) : null}
                    {showAccount ? (
                      <td className="px-3 py-2.5 align-top font-mono text-xs tabular-nums">
                        {row.account_number ?? "—"}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">{scriptCount}</td>
                    {showSource ? (
                      <td className="px-3 py-2.5 align-top text-muted-foreground">
                        {scriptCount > 0 ? scriptSourceColumnValue(scriptSource) : "—"}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right align-top">
                      <ExaminerAllowanceBreakdownCell row={row} examinerName={row.full_name} payoutView={payoutView} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
