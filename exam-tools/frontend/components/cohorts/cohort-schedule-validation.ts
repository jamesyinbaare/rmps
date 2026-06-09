import type { CohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";

export type ScheduleFieldKey = keyof CohortScheduleDraft;

export type ScheduleValidationResult = {
  fieldErrors: Partial<Record<ScheduleFieldKey, string>>;
  warnings: string[];
  hasBlockingErrors: boolean;
};

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [h, m] = trimmed.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function validateCohortSchedule(draft: CohortScheduleDraft): ScheduleValidationResult {
  const fieldErrors: Partial<Record<ScheduleFieldKey, string>> = {};
  const warnings: string[] = [];

  const coordStart = parseTime(draft.coordinationStartTime);
  const coordEnd = parseTime(draft.coordinationEndTime);
  if (coordStart != null && coordEnd != null && coordEnd < coordStart) {
    fieldErrors.coordinationEndTime = "End time must be after start time.";
  }

  const markingStart = parseDate(draft.markingStartDate);
  const markingEnd = parseDate(draft.markingEndDate);
  if (markingStart && markingEnd && markingEnd < markingStart) {
    fieldErrors.markingEndDate = "Marking end must be on or after marking start.";
  }

  const coordination = parseDate(draft.coordinationDate);
  const submission = parseDate(draft.markedScriptSubmissionDeadline);

  if (coordination && markingStart && coordination > markingStart) {
    warnings.push("Coordination is usually before marking begins.");
  }

  if (markingEnd && submission && submission < markingEnd) {
    warnings.push("Submission deadline is before marking ends — confirm this is intentional.");
  }

  return {
    fieldErrors,
    warnings,
    hasBlockingErrors: Object.keys(fieldErrors).length > 0,
  };
}
