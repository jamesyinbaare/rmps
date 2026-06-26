"use client";

import { useState } from "react";

import { ExaminerAllowanceBreakdownCell } from "@/components/examiner-allowance-breakdown";
import {
  isBankAccountIncomplete,
} from "@/components/examiner-accounts/examiner-accounts-table-cells";
import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { displayBankCode, type AdminExaminerAllowanceRow, type ExaminerTypeApi } from "@/lib/api";
import { scriptSourceColumnValue, scriptSourceSummary } from "@/lib/examiner-script-source";
import type { ExaminerPayoutView } from "@/lib/examiner-payout-view";
import { scriptsCountForRow } from "@/lib/examiner-accounts-sort";
import { cn } from "@/lib/utils";

type Props = {
  row: AdminExaminerAllowanceRow;
  scriptCount: number;
  subjectId: number | null;
  paperNumber: number | null;
  payoutView: ExaminerPayoutView;
  showRole?: boolean;
  showRegion?: boolean;
};

export function ExaminerAccountsMobileCard({
  row,
  scriptCount,
  subjectId,
  paperNumber,
  payoutView,
  showRole = false,
  showRegion = true,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const roleAbbrev = EXAMINER_TYPE_ABBREVIATIONS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const roleFull = EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const scriptSource = scriptSourceSummary(row.subject_breakdowns, { subjectId, paperNumber });
  const incomplete = isBankAccountIncomplete(row);

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-3 shadow-sm",
        incomplete && "border-l-2 border-l-amber-500/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {[showRegion && row.region ? row.region : null, row.phone_number?.trim() || null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          {showRole ? (
            <p className="mt-0.5 text-xs text-muted-foreground" title={roleFull}>
              {roleAbbrev}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {scriptCount.toLocaleString()} scripts
        </span>
      </div>

      <div className="mt-2">
        {incomplete ? (
          <span className="inline-flex rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            Incomplete bank account
          </span>
        ) : (
          <div className="min-w-0">
            <p className="font-mono text-sm tabular-nums text-foreground">{row.account_number}</p>
            {row.bank_name?.trim() ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.bank_name}</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <ExaminerAllowanceBreakdownCell row={row} examinerName={row.full_name} payoutView={payoutView} />
        <button
          type="button"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide" : "Details"}
        </button>
      </div>

      {expanded ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-xs">
          <dt className="text-muted-foreground">Branch</dt>
          <dd>{row.branch_name || "—"}</dd>
          <dt className="text-muted-foreground">Bank code</dt>
          <dd className="font-mono">{displayBankCode(row.bank_code)}</dd>
          <dt className="text-muted-foreground">Account</dt>
          <dd className="font-mono tabular-nums">{row.account_number || "—"}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{scriptCount > 0 && scriptSource ? scriptSourceColumnValue(scriptSource) : "—"}</dd>
        </dl>
      ) : null}
    </article>
  );
}

export function mobileScriptCount(
  row: AdminExaminerAllowanceRow,
  subjectId: number | null,
  paperNumber: number | null,
): number {
  return scriptsCountForRow(row, subjectId, paperNumber);
}
