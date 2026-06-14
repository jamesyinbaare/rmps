"use client";

import { useMemo } from "react";

import { formatDateOnly } from "@/components/examiner-invitations/utils";
import type { CohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";
import { formatTimeLabel } from "@/components/cohorts/cohort-schedule-utils";
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-start-date">
              Start date
            </label>
            <input
              id="cohort-coordination-start-date"
              type="date"
              className={cn(formInputClass, "mt-1")}
              value={draft.coordinationStartDate}
              onChange={(e) => patch({ coordinationStartDate: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-start-time">
              Start time
            </label>
            <input
              id="cohort-coordination-start-time"
              type="time"
              className={cn(formInputClass, "mt-1")}
              value={draft.coordinationStartTime}
              onChange={(e) => patch({ coordinationStartTime: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-end-date">
              End date
            </label>
            <input
              id="cohort-coordination-end-date"
              type="date"
              className={cn(
                formInputClass,
                "mt-1",
                showValidation && fieldErrors.coordinationEndDate ? fieldErrorClass(true) : "",
              )}
              value={draft.coordinationEndDate}
              onChange={(e) => patch({ coordinationEndDate: e.target.value })}
              disabled={disabled}
            />
            {showValidation && fieldErrors.coordinationEndDate ? (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.coordinationEndDate}</p>
            ) : null}
          </div>
          <div>
            <label className={formLabelClass} htmlFor="cohort-coordination-end-time">
              End time
            </label>
            <input
              id="cohort-coordination-end-time"
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
          <div className="sm:col-span-2">
            <label className={formLabelClass} htmlFor="cohort-coordination-venue">
              Venue
            </label>
            <input
              id="cohort-coordination-venue"
              type="text"
              className={cn(formInputClass, "mt-1")}
              value={draft.coordinationVenue}
              onChange={(e) => patch({ coordinationVenue: e.target.value })}
              disabled={disabled}
              placeholder="e.g. Conference Room, Ghana TVET Service HQ, East Legon"
            />
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
  coordinationStartDate,
  coordinationStartTime,
  coordinationEndDate,
  coordinationEndTime,
  markingStartDate,
  markingEndDate,
  markedScriptSubmissionDeadline,
}: {
  coordinationStartDate?: string | null;
  coordinationStartTime?: string | null;
  coordinationEndDate?: string | null;
  coordinationEndTime?: string | null;
  markingStartDate?: string | null;
  markingEndDate?: string | null;
  markedScriptSubmissionDeadline?: string | null;
}): string[] {
  const parts: string[] = [];
  if (coordinationStartDate || coordinationEndDate) {
    const startLabel = formatDateOnly(coordinationStartDate);
    const endLabel = formatDateOnly(coordinationEndDate ?? coordinationStartDate);
    const startTime = coordinationStartTime ? formatTimeLabel(coordinationStartTime) : null;
    const endTime = coordinationEndTime ? formatTimeLabel(coordinationEndTime) : null;
    if (startLabel !== "—" && endLabel !== "—" && startLabel !== endLabel) {
      let line = `Coordination ${startLabel} – ${endLabel}`;
      if (startTime && endTime) line += ` (${startTime}–${endTime})`;
      parts.push(line);
    } else if (startLabel !== "—") {
      let line = `Coordination ${startLabel}`;
      if (startTime || endTime) {
        line += ` (${startTime ?? "—"}–${endTime ?? "—"})`;
      }
      parts.push(line);
    }
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
  coordinationStartDate?: string | null;
  coordinationStartTime?: string | null;
  coordinationEndDate?: string | null;
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
