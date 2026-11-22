"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SchoolExamExpectations } from "@/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ExamRegistrationPulseProps {
  data: SchoolExamExpectations | null;
  loading?: boolean;
  onEdit?: () => void;
  className?: string;
}

function statusCopy(data: SchoolExamExpectations): string {
  if (!data.has_declaration || data.expected_total == null) {
    return "Set targets to track progress";
  }
  if (data.total_over) {
    const overBy = data.actual_total - data.expected_total;
    return `${overBy.toLocaleString()} over target`;
  }
  if (data.total_under) {
    const underBy = data.expected_total - data.actual_total;
    return `${underBy.toLocaleString()} under target`;
  }
  return "On track";
}

export function ExamRegistrationPulse({
  data,
  loading,
  onEdit,
  className,
}: ExamRegistrationPulseProps) {
  if (loading) {
    return <Skeleton className={cn("h-24 w-full rounded-lg", className)} />;
  }

  if (!data) return null;

  const declared = data.has_declaration && data.expected_total != null;
  const overallPct =
    declared && data.expected_total > 0
      ? Math.min(100, (data.actual_total / data.expected_total) * 100)
      : null;
  const status = statusCopy(data);
  const canEdit = data.can_edit && onEdit;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-5 py-4 md:px-6 md:py-5",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Registration progress
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {declared ? (
              <>
                <span className="font-mono text-3xl font-medium tracking-tight tabular-nums md:text-4xl">
                  {data.actual_total.toLocaleString()}
                  <span className="text-muted-foreground">
                    {" "}
                    / {data.expected_total!.toLocaleString()}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">expected</span>
              </>
            ) : (
              <>
                <span className="font-mono text-3xl font-medium tracking-tight tabular-nums md:text-4xl">
                  {data.actual_total.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">registered</span>
              </>
            )}
          </div>
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm",
              data.total_over && declared
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground"
            )}
          >
            {declared && data.total_over ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ) : declared && !data.total_under ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : null}
            {status}
          </p>
        </div>

        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            {declared ? "Edit targets" : "Set expected numbers"}
          </Button>
        )}
      </div>

      {overallPct != null && (
        <div className="mt-4 space-y-1.5">
          <Progress
            value={overallPct}
            className={cn("h-2", data.total_over && "[&>div]:bg-amber-500")}
          />
          <p className="text-xs text-muted-foreground">
            {Math.round(overallPct)}% of expected
          </p>
        </div>
      )}
    </div>
  );
}
