"use client";

import {
  ExaminerIdentityCell,
} from "@/components/examiner-accounts/examiner-accounts-table-cells";
import type { AdminExaminerAllowanceRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  row: AdminExaminerAllowanceRow;
  showRole?: boolean;
  showRegion?: boolean;
  showPhoneInSubline?: boolean;
  onEditCeReportCount?: (row: AdminExaminerAllowanceRow) => void;
  onEditPayoutAdjustments?: (row: AdminExaminerAllowanceRow) => void;
  className?: string;
};

function groupsLabel(row: AdminExaminerAllowanceRow): string {
  const names = row.allowance_group_names ?? [];
  if (names.length === 0) return "General";
  return names.join(", ");
}

const metaBtnClass =
  "inline-flex items-center gap-1 rounded-md px-0 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * Sticky examiner column: identity first, then groups + edit actions on separate rows
 * so Reports / Adjustments never run together.
 */
export function ExaminerPayoutSideCell({
  row,
  showRole = true,
  showRegion = true,
  showPhoneInSubline = false,
  onEditCeReportCount,
  onEditPayoutAdjustments,
  className,
}: Props) {
  const adjCount = (row.payout_adjustments ?? []).length;
  const groups = groupsLabel(row);
  const hasActions = Boolean(onEditCeReportCount || onEditPayoutAdjustments);

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <ExaminerIdentityCell
        row={row}
        showRole={showRole}
        showRegion={showRegion}
        showPhoneInSubline={showPhoneInSubline}
      />

      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <p className="truncate text-xs text-muted-foreground" title={groups}>
          <span className="text-muted-foreground/70">Groups</span>
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          <span className="text-foreground/80">{groups}</span>
        </p>

        {hasActions ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {onEditCeReportCount ? (
              <button
                type="button"
                className={metaBtnClass}
                onClick={() => onEditCeReportCount(row)}
              >
                <span>Reports</span>
                <span className="font-medium tabular-nums text-foreground">
                  {row.chief_examiners_report_count}
                </span>
              </button>
            ) : null}
            {onEditCeReportCount && onEditPayoutAdjustments ? (
              <span className="text-muted-foreground/30" aria-hidden>
                ·
              </span>
            ) : null}
            {onEditPayoutAdjustments ? (
              <button
                type="button"
                className={metaBtnClass}
                onClick={() => onEditPayoutAdjustments(row)}
              >
                {adjCount > 0 ? (
                  <>
                    <span>Adjustments</span>
                    <span className="font-medium tabular-nums text-foreground">{adjCount}</span>
                  </>
                ) : (
                  <span className="text-primary">Add adjustment</span>
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
