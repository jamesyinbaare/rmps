import { formatTimeLabel } from "@/components/cohorts/cohort-schedule-utils";
import { formatDateOnly } from "@/components/examiner-invitations/utils";
import type { ExaminerMarkingCohortPublic } from "@/lib/api";

export type SchedulePhase = "coordination" | "marking" | "submission";

export type ScheduleLine = {
  sortKey: string;
  phase: SchedulePhase;
  eventLabel: string;
  dateLabel: string;
  detail: string | null;
  cohortName: string;
};

export type ExaminerPortalSchedule = {
  coordination: ScheduleLine[];
  marking: ScheduleLine[];
  submission: ScheduleLine[];
};

const PHASE_ORDER: SchedulePhase[] = ["coordination", "marking", "submission"];

function isoDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const key = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function todayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function hasCoordinationSchedule(cohort: ExaminerMarkingCohortPublic): boolean {
  return Boolean(
    isoDateKey(cohort.coordination_start_date) || isoDateKey(cohort.coordination_end_date),
  );
}

export function hasMarkingSchedule(cohort: ExaminerMarkingCohortPublic): boolean {
  return Boolean(isoDateKey(cohort.marking_start_date) || isoDateKey(cohort.marking_end_date));
}

export function hasSubmissionSchedule(cohort: ExaminerMarkingCohortPublic): boolean {
  return Boolean(isoDateKey(cohort.marked_script_submission_deadline));
}

function hasPhaseSchedule(cohort: ExaminerMarkingCohortPublic, phase: SchedulePhase): boolean {
  if (phase === "coordination") return hasCoordinationSchedule(cohort);
  if (phase === "marking") return hasMarkingSchedule(cohort);
  return hasSubmissionSchedule(cohort);
}

export function selectCohortsForSchedulePhase(
  cohorts: ExaminerMarkingCohortPublic[],
  phase: SchedulePhase,
): ExaminerMarkingCohortPublic[] {
  const named = cohorts.filter((c) => !c.is_default);
  const defaultCohort = cohorts.find((c) => c.is_default);
  const namedWithPhase = named.filter((c) => hasPhaseSchedule(c, phase));
  if (namedWithPhase.length > 0) {
    return namedWithPhase;
  }
  if (defaultCohort && hasPhaseSchedule(defaultCohort, phase)) {
    return [defaultCohort];
  }
  return [];
}

function cohortDisplayName(cohort: ExaminerMarkingCohortPublic): string {
  return cohort.is_default ? "All examiners" : cohort.name;
}

function coordinationLines(cohort: ExaminerMarkingCohortPublic): ScheduleLine[] {
  const startKey = isoDateKey(cohort.coordination_start_date);
  const endKey = isoDateKey(cohort.coordination_end_date);
  if (!startKey && !endKey) return [];

  const startLabel = formatDateOnly(cohort.coordination_start_date);
  const endLabel = formatDateOnly(cohort.coordination_end_date ?? cohort.coordination_start_date);
  const startTime = cohort.coordination_start_time
    ? formatTimeLabel(cohort.coordination_start_time)
    : null;
  const endTime = cohort.coordination_end_time
    ? formatTimeLabel(cohort.coordination_end_time)
    : null;

  let dateLabel: string;
  if (startLabel !== "—" && endLabel !== "—" && startLabel !== endLabel) {
    dateLabel = `${startLabel} – ${endLabel}`;
  } else if (startLabel !== "—") {
    dateLabel = startLabel;
  } else if (endLabel !== "—") {
    dateLabel = endLabel;
  } else {
    return [];
  }

  const detailParts: string[] = [];
  if (startTime || endTime) {
    detailParts.push(`${startTime ?? "—"} – ${endTime ?? "—"}`);
  }
  const venue = cohort.coordination_venue?.trim();
  if (venue) {
    detailParts.push(venue);
  }

  const sortKey = startKey ?? endKey!;
  return [
    {
      sortKey,
      phase: "coordination",
      eventLabel: "Coordination",
      dateLabel,
      detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
      cohortName: cohortDisplayName(cohort),
    },
  ];
}

function markingLines(cohort: ExaminerMarkingCohortPublic): ScheduleLine[] {
  const lines: ScheduleLine[] = [];
  const startKey = isoDateKey(cohort.marking_start_date);
  const endKey = isoDateKey(cohort.marking_end_date);
  const cohortName = cohortDisplayName(cohort);

  if (startKey) {
    lines.push({
      sortKey: startKey,
      phase: "marking",
      eventLabel: "Marking starts",
      dateLabel: formatDateOnly(cohort.marking_start_date),
      detail: null,
      cohortName,
    });
  }
  if (endKey && endKey !== startKey) {
    lines.push({
      sortKey: endKey,
      phase: "marking",
      eventLabel: "Marking ends",
      dateLabel: formatDateOnly(cohort.marking_end_date),
      detail: null,
      cohortName,
    });
  }
  if (!startKey && endKey) {
    lines.push({
      sortKey: endKey,
      phase: "marking",
      eventLabel: "Marking ends",
      dateLabel: formatDateOnly(cohort.marking_end_date),
      detail: null,
      cohortName,
    });
  }
  return lines;
}

function submissionLines(cohort: ExaminerMarkingCohortPublic): ScheduleLine[] {
  const sortKey = isoDateKey(cohort.marked_script_submission_deadline);
  if (!sortKey) return [];
  return [
    {
      sortKey,
      phase: "submission",
      eventLabel: "Submission deadline",
      dateLabel: formatDateOnly(cohort.marked_script_submission_deadline),
      detail: null,
      cohortName: cohortDisplayName(cohort),
    },
  ];
}

function sortLines(lines: ScheduleLine[]): ScheduleLine[] {
  return [...lines].sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.cohortName.localeCompare(b.cohortName),
  );
}

function buildPhaseLines(
  cohorts: ExaminerMarkingCohortPublic[],
  phase: SchedulePhase,
  lineBuilder: (cohort: ExaminerMarkingCohortPublic) => ScheduleLine[],
): ScheduleLine[] {
  const selected = selectCohortsForSchedulePhase(cohorts, phase);
  return sortLines(selected.flatMap(lineBuilder));
}

export function buildExaminerPortalSchedule(
  cohorts: ExaminerMarkingCohortPublic[],
): ExaminerPortalSchedule {
  return {
    coordination: buildPhaseLines(cohorts, "coordination", coordinationLines),
    marking: buildPhaseLines(cohorts, "marking", markingLines),
    submission: buildPhaseLines(cohorts, "submission", submissionLines),
  };
}

export function flattenExaminerPortalSchedule(schedule: ExaminerPortalSchedule): ScheduleLine[] {
  const lines: ScheduleLine[] = [];
  for (const phase of PHASE_ORDER) {
    lines.push(...schedule[phase]);
  }
  return sortLines(lines);
}

export function nextUpcomingScheduleLine(
  schedule: ExaminerPortalSchedule,
  fromDateKey: string = todayDateKey(),
): ScheduleLine | null {
  return flattenExaminerPortalSchedule(schedule).find((line) => line.sortKey >= fromDateKey) ?? null;
}

export function examinerPortalScheduleHasContent(schedule: ExaminerPortalSchedule): boolean {
  return (
    schedule.coordination.length > 0 ||
    schedule.marking.length > 0 ||
    schedule.submission.length > 0
  );
}
