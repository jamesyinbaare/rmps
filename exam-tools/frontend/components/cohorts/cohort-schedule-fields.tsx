"use client";

import { useMemo } from "react";

import { formatDateOnly } from "@/components/examiner-invitations/utils";
import type { CohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";
import { validateCohortSchedule } from "@/components/cohorts/cohort-schedule-validation";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type CohortScheduleFieldsProps = {
  draft: CohortScheduleDraft;
  onChange: (next: CohortScheduleDraft) => void;
  disabled?: boolean;
  /** When true, show validation messages (e.g. after blur or save attempt). */
  showValidation?: boolean;
};

const sectionTitleClass = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function fieldErrorClass(hasError: boolean): string {
  return hasError ? "border-destructive focus-visible:ring-destructive/30" : "";
}

export function CohortScheduleFields({
  draft,
  onChange,
  disabled = false,
  showValidation = true,
}: CohortScheduleFieldsProps) {
  const validation = useMemo(() => validateCohortSchedule(draft), [draft]);

  function patch(partial: Partial<CohortScheduleDraft>) {
    onChange({ ...draft, ...partial });
  }

  const { fieldErrors } = validation;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className={sectionTitleClass}>Coordination</p>
        <p className="text-xs text-muted-foreground">
          Coordination is usually before marking begins.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-date">
              Date
            </label>
            <input
              id="cohort-coordination-date"
              type="date"
              className={cn(formInputClass, "mt-1")}
              value={draft.coordinationDate}
              onChange={(e) => patch({ coordinationDate: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-start">
              Start time
            </label>
            <input
              id="cohort-coordination-start"
              type="time"
              className={cn(formInputClass, "mt-1")}
              value={draft.coordinationStartTime}
              onChange={(e) => patch({ coordinationStartTime: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-end">
              End time
            </label>
            <input
              id="cohort-coordination-end"
              type="time"
              className={cn(
                formInputClass,
                "mt-1",
                showValidation && fieldErrors.coordinationEndTime ? fieldErrorClass(true) : "",
              )}
              value={draft.coordinationEndTime}
              onChange={(e) => patch({ coordinationEndTime: e.target.value })}
              disabled={disabled}
            />
            {showValidation && fieldErrors.coordinationEndTime ? (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.coordinationEndTime}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className={sectionTitleClass}>Marking period</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={formLabelClass} htmlFor="cohort-marking-start">
              Start date
            </label>
            <input
              id="cohort-marking-start"
              type="date"
              className={cn(formInputClass, "mt-1")}
              value={draft.markingStartDate}
              onChange={(e) => patch({ markingStartDate: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="cohort-marking-end">
              End date
            </label>
            <input
              id="cohort-marking-end"
              type="date"
              className={cn(
                formInputClass,
                "mt-1",
                showValidation && fieldErrors.markingEndDate ? fieldErrorClass(true) : "",
              )}
              value={draft.markingEndDate}
              onChange={(e) => patch({ markingEndDate: e.target.value })}
              disabled={disabled}
            />
            {showValidation && fieldErrors.markingEndDate ? (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.markingEndDate}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className={sectionTitleClass}>Submission</p>
        <div>
          <label className={formLabelClass} htmlFor="cohort-submission-deadline">
            Marked script submission deadline
          </label>
          <input
            id="cohort-submission-deadline"
            type="date"
            className={cn(formInputClass, "mt-1 sm:max-w-xs")}
            value={draft.markedScriptSubmissionDeadline}
            onChange={(e) => patch({ markedScriptSubmissionDeadline: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export function cohortScheduleSummaryParts({
  coordinationDate,
  coordinationStartTime,
  coordinationEndTime,
  markingStartDate,
  markingEndDate,
  markedScriptSubmissionDeadline,
}: {
  coordinationDate?: string | null;
  coordinationStartTime?: string | null;
  coordinationEndTime?: string | null;
  markingStartDate?: string | null;
  markingEndDate?: string | null;
  markedScriptSubmissionDeadline?: string | null;
}): string[] {
  const parts: string[] = [];
  if (coordinationDate) {
    let line = `Coordination ${formatDateOnly(coordinationDate)}`;
    if (coordinationStartTime || coordinationEndTime) {
      const start = coordinationStartTime?.slice(0, 5) ?? "—";
      const end = coordinationEndTime?.slice(0, 5) ?? "—";
      line += ` (${start}–${end})`;
    }
    parts.push(line);
  }
  if (markingStartDate || markingEndDate) {
    parts.push(
      `Marking ${formatDateOnly(markingStartDate)} – ${formatDateOnly(markingEndDate)}`,
    );
  }
  if (markedScriptSubmissionDeadline) {
    parts.push(`Submit by ${formatDateOnly(markedScriptSubmissionDeadline)}`);
  }
  return parts;
}

export function CohortScheduleSummary(props: {
  coordinationDate?: string | null;
  coordinationStartTime?: string | null;
  coordinationEndTime?: string | null;
  markingStartDate?: string | null;
  markingEndDate?: string | null;
  markedScriptSubmissionDeadline?: string | null;
}) {
  const parts = cohortScheduleSummaryParts(props);
  if (parts.length === 0) return null;
  return <span>{` · ${parts.join(" · ")}`}</span>;
}

export { validateCohortSchedule };
