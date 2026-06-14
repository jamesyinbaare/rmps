"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CohortCoverage } from "@/components/cohorts/types";
import { cn } from "@/lib/utils";

type Props = {
  coverage: CohortCoverage;
  entityLabel?: string;
  onShowUnassigned?: () => void;
  /** Override unassigned link label (e.g. "View unassigned" for read-only). */
  unassignedButtonLabel?: string;
  trailing?: ReactNode;
  className?: string;
};

export function CohortCoverageBar({
  coverage,
  entityLabel = "cohort",
  onShowUnassigned,
  unassignedButtonLabel,
  trailing,
  className,
}: Props) {
  const { assignedCount, totalCount, unassignedCount } = coverage;
  const allAssigned = totalCount > 0 && unassignedCount === 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border/80 px-4 py-2.5 sm:px-5",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {assignedCount}/{totalCount}
        </span>{" "}
        examiners in a {entityLabel}
      </p>
      {unassignedCount > 0 ? (
        onShowUnassigned ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-300"
            onClick={onShowUnassigned}
          >
            {unassignedButtonLabel ?? `${unassignedCount} unassigned`}
          </Button>
        ) : (
          <Badge variant="secondary" className="text-xs">
            {unassignedCount} unassigned
          </Badge>
        )
      ) : totalCount > 0 ? (
        <Badge className="bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-300">
          All assigned
        </Badge>
      ) : null}
      {allAssigned && totalCount === 0 ? null : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div>
    </div>
  );
}
