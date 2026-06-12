"use client";

import { CalendarClock } from "lucide-react";

import { cohortScheduleSummaryParts } from "@/components/cohorts/cohort-schedule-fields";
import { Badge } from "@/components/ui/badge";
import type { ExaminerMarkingCohortPublic } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  cohorts: ExaminerMarkingCohortPublic[];
  className?: string;
};

export function ExaminerMarkingScheduleSection({ cohorts, className }: Props) {
  if (cohorts.length === 0) return null;

  return (
    <section className={cn("mt-6 space-y-3", className)} aria-labelledby="marking-schedule-heading">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" aria-hidden />
        <h2 id="marking-schedule-heading" className="text-sm font-semibold text-foreground">
          Marking schedule
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Dates and deadlines for your marking cohort{cohorts.length === 1 ? "" : "s"}.
      </p>
      <div className="space-y-3">
        {cohorts.map((cohort) => {
          const parts = cohortScheduleSummaryParts({
            coordinationStartDate: cohort.coordination_start_date,
            coordinationStartTime: cohort.coordination_start_time,
            coordinationEndDate: cohort.coordination_end_date,
            coordinationEndTime: cohort.coordination_end_time,
            markingStartDate: cohort.marking_start_date,
            markingEndDate: cohort.marking_end_date,
            markedScriptSubmissionDeadline: cohort.marked_script_submission_deadline,
          });
          return (
            <div
              key={cohort.id}
              className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{cohort.name}</p>
                {cohort.is_default ? (
                  <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wide">
                    Default
                  </Badge>
                ) : null}
              </div>
              {parts.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {parts.map((part) => (
                    <li key={part}>{part}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground">Schedule not set yet.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
