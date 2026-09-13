"use client";

import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { AdminExaminerAllowanceRow, ExaminerTypeApi } from "@/lib/api";
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

function metaParts(
  row: AdminExaminerAllowanceRow,
  showRegion: boolean,
  showPhoneInSubline: boolean,
): string[] {
  const parts: string[] = [];
  if (showRegion && row.region?.trim()) parts.push(row.region.trim());
  if (showPhoneInSubline && row.phone_number?.trim()) parts.push(row.phone_number.trim());
  parts.push(groupsLabel(row));
  if (row.reference_code?.trim()) parts.push(row.reference_code.trim());
  return parts;
}

const metaBtnClass =
  "inline-flex shrink-0 items-center gap-1 rounded-md px-0 py-0 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * Sticky examiner column: compact name + role, then one meta line with
 * region/groups/ref and optional Reports / Adjustments actions.
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
  const roleAbbrev = EXAMINER_TYPE_ABBREVIATIONS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const roleFull = EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const meta = metaParts(row, showRegion, showPhoneInSubline);
  const metaTitle = meta.join(" · ");
  const hasActions = Boolean(onEditCeReportCount || onEditPayoutAdjustments);

  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="truncate font-medium text-foreground">{row.full_name}</span>
        {showRole ? (
          <span
            className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            title={roleFull}
          >
            {roleAbbrev}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        {meta.length > 0 ? (
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={metaTitle}>
            {metaTitle}
          </p>
        ) : (
          <span className="min-w-0 flex-1" />
        )}

        {hasActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
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
            {onEditPayoutAdjustments ? (
              <button
                type="button"
                className={metaBtnClass}
                onClick={() => onEditPayoutAdjustments(row)}
              >
                {adjCount > 0 ? (
                  <>
                    <span>Adj</span>
                    <span className="font-medium tabular-nums text-foreground">{adjCount}</span>
                  </>
                ) : (
                  <span className="text-primary">Add adj</span>
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
