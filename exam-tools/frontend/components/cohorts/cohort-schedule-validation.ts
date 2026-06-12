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

function combineDateTime(date: Date, minutes: number | null): number {
  const base = date.getTime();
  if (minutes == null) return base;
  const d = new Date(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

export function validateCohortSchedule(draft: CohortScheduleDraft): ScheduleValidationResult {
  const fieldErrors: Partial<Record<ScheduleFieldKey, string>> = {};
  const warnings: string[] = [];

  const coordStartDate = parseDate(draft.coordinationStartDate);
  const coordEndDate = parseDate(draft.coordinationEndDate);
  if (coordStartDate && coordEndDate && coordEndDate < coordStartDate) {
    fieldErrors.coordinationEndDate = "End date must be on or after start date.";
  }

  const coordStartMin = parseTime(draft.coordinationStartTime);
  const coordEndMin = parseTime(draft.coordinationEndTime);
  if (
    coordStartDate &&
    coordEndDate &&
    coordStartDate.getTime() === coordEndDate.getTime() &&
    coordStartMin != null &&
    coordEndMin != null &&
    coordEndMin < coordStartMin
  ) {
    fieldErrors.coordinationEndTime = "End time must be after start time on the same day.";
  }

  const markingStart = parseDate(draft.markingStartDate);
  const markingEnd = parseDate(draft.markingEndDate);
  if (markingStart && markingEnd && markingEnd < markingStart) {
    fieldErrors.markingEndDate = "Marking end must be on or after marking start.";
  }

  const submission = parseDate(draft.markedScriptSubmissionDeadline);

  if (coordEndDate && markingStart && coordEndDate > markingStart) {
    warnings.push("Coordination is usually before marking begins.");
  }

  if (markingEnd && submission && submission < markingEnd) {
    warnings.push("Submission deadline is before marking ends — confirm this is intentional.");
  }

  if (coordStartDate && coordEndDate && coordStartDate.getTime() === coordEndDate.getTime()) {
    const startTs = combineDateTime(coordStartDate, coordStartMin);
    const endTs = combineDateTime(coordEndDate, coordEndMin ?? 23 * 60 + 59);
    if (endTs < startTs) {
      fieldErrors.coordinationEndTime = "Coordination end must be on or after coordination start.";
    }
  }

  return {
    fieldErrors,
    warnings,
    hasBlockingErrors: Object.keys(fieldErrors).length > 0,
  };
}
