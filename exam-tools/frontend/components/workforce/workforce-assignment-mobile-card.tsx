"use client";

import { Building2 } from "lucide-react";

import { WorkforceAvailabilityBadge } from "@/components/workforce/workforce-availability-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkforceAssignmentPersonRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  row: WorkforceAssignmentPersonRow;
  onAssign: () => void;
  onViewAssignments: () => void;
};

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

export function WorkforceAssignmentMobileCard({ row, onAssign, onViewAssignments }: Props) {
  const hasActive = row.uncompleted_total > 0;
  const canAssign = row.availability_status === "confirmed";
  const meta = [row.reference_code, row.phone_number].filter(Boolean);

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
          {meta.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.reference_code ? (
                <span className="font-mono text-foreground">{row.reference_code}</span>
              ) : null}
              {row.reference_code && row.phone_number ? " · " : null}
              {row.phone_number ?? null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">—</p>
          )}
        </div>
        <WorkforceAvailabilityBadge status={row.availability_status} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Total" value={row.assigned_total} />
        <StatCell label="Completed" value={row.completed_total} />
        <StatCell label="Uncompleted" value={row.uncompleted_total} />
      </div>

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

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="min-h-10 w-full" disabled={!canAssign} onClick={onAssign}>
          Assign
        </Button>
        <Button type="button" className="min-h-10 w-full" variant="secondary" onClick={onViewAssignments}>
          View assignments
        </Button>
      </div>
    </article>
  );
}
