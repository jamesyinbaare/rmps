"use client";

import { Building2 } from "lucide-react";

import { WorkforceAssignmentRowActions } from "@/components/workforce/workforce-assignment-row-actions";
import { WorkforceAvailabilityBadge } from "@/components/workforce/workforce-availability-badge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkforceAssignmentPersonRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  row: WorkforceAssignmentPersonRow;
  assignedTotal?: number;
  completedTotal?: number;
  uncompletedTotal?: number;
  subjectBreakdown?: string | null;
  scopeLabel?: string;
  canAssign?: boolean;
  assignLabel?: string;
  bulkTotals?: { paper1: number; paper2: number; daysAtPost: number | null } | null;
  canRegeneratePortal?: boolean;
  regenBusy?: boolean;
  onRegenerate?: () => void;
  onAssign: () => void;
  onViewAssignments: () => void;
};

function StatCell({
  label,
  value,
  title,
}: {
  label: string;
  value: number;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2 text-center" title={title}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

export function WorkforceAssignmentMobileCard({
  row,
  assignedTotal,
  completedTotal,
  uncompletedTotal,
  subjectBreakdown,
  scopeLabel = "All subjects",
  canAssign: showAssign = true,
  assignLabel = "Assign",
  bulkTotals = null,
  canRegeneratePortal = false,
  regenBusy = false,
  onRegenerate,
  onAssign,
  onViewAssignments,
}: Props) {
  const assigned = assignedTotal ?? row.assigned_total;
  const completed = completedTotal ?? row.completed_total;
  const uncompleted = uncompletedTotal ?? row.uncompleted_total;
  const hasActive = bulkTotals ? assigned > 0 : uncompleted > 0;
  const canAssignPerson = showAssign && row.availability_status === "confirmed";
  const totalsTitle = subjectBreakdown ?? `No scripts for ${scopeLabel}`;

  return (
    <article
      className={cn(
        "space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        hasActive && "border-l-2 border-l-primary bg-primary/3",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {row.phone_number?.trim() || "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{row.reference_code?.trim() || "—"}</span>
            {row.cohort_name?.trim() ? (
              <>
                <span className="mx-1 text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                {row.cohort_name.trim()}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <WorkforceAvailabilityBadge status={row.availability_status} />
          <WorkforceAssignmentRowActions
            personName={row.name}
            canAssign={showAssign}
            assignLabel={assignLabel}
            assignDisabled={!canAssignPerson}
            onAssign={onAssign}
            onView={onViewAssignments}
            canRegeneratePortal={canRegeneratePortal}
            regenBusy={regenBusy}
            onRegenerate={onRegenerate}
          />
        </div>
      </div>

      {bulkTotals ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell label="P1" value={bulkTotals.paper1} />
          <StatCell label="P2" value={bulkTotals.paper2} />
          <StatCell label="Total" value={assigned} />
          <StatCell label="Days at post" value={bulkTotals.daysAtPost ?? 0} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatCell label="Total" value={assigned} title={totalsTitle} />
          <StatCell label="Completed" value={completed} />
          <StatCell label="Uncompleted" value={uncompleted} />
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              {row.has_bank_account ? (
                <Badge variant="secondary" className="gap-1">
                  <Building2 className="size-3" aria-hidden />
                  Bank
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  No bank
                </Badge>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>Required before payout export.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </article>
  );
}
