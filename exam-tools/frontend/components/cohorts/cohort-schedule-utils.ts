import type { SubjectMarkingGroupRow } from "@/lib/api";

import { dateInputToIso } from "@/components/examiner-invitations/utils";

export type CohortScheduleDraft = {
  coordinationStartDate: string;
  coordinationStartTime: string;
  coordinationEndDate: string;
  coordinationEndTime: string;
  coordinationVenue: string;
  markingStartDate: string;
  markingEndDate: string;
  markedScriptSubmissionDeadline: string;
};

export function emptyCohortScheduleDraft(): CohortScheduleDraft {
  return {
    coordinationStartDate: "",
    coordinationStartTime: "",
    coordinationEndDate: "",
    coordinationEndTime: "",
    coordinationVenue: "",
    markingStartDate: "",
    markingEndDate: "",
    markedScriptSubmissionDeadline: "",
  };
}

export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = iso.match(/T(\d{2}:\d{2})/);
  if (match) return match[1]!;
  if (/^\d{2}:\d{2}/.test(iso)) return iso.slice(0, 5);
  return "";
}

export function timeInputToApi(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

export function cohortScheduleFromRow(row: SubjectMarkingGroupRow): CohortScheduleDraft {
  return {
    coordinationStartDate: isoToDateInput(row.coordination_start_date),
    coordinationStartTime: isoToTimeInput(row.coordination_start_time),
    coordinationEndDate: isoToDateInput(row.coordination_end_date),
    coordinationEndTime: isoToTimeInput(row.coordination_end_time),
    coordinationVenue: row.coordination_venue ?? "",
    markingStartDate: isoToDateInput(row.marking_start_date),
    markingEndDate: isoToDateInput(row.marking_end_date),
    markedScriptSubmissionDeadline: isoToDateInput(row.marked_script_submission_deadline),
  };
}

export function cohortScheduleToPayload(draft: CohortScheduleDraft) {
  return {
    coordination_start_date: dateInputToIso(draft.coordinationStartDate),
    coordination_start_time: timeInputToApi(draft.coordinationStartTime),
    coordination_end_date: dateInputToIso(draft.coordinationEndDate),
    coordination_end_time: timeInputToApi(draft.coordinationEndTime),
    coordination_venue: draft.coordinationVenue.trim() || null,
    marking_start_date: dateInputToIso(draft.markingStartDate),
    marking_end_date: dateInputToIso(draft.markingEndDate),
    marked_script_submission_deadline: dateInputToIso(draft.markedScriptSubmissionDeadline),
  };
}

export function formatTimeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const hhmm = isoToTimeInput(value);
  if (!hhmm) return value;
  try {
    const [hours, minutes] = hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return hhmm;
  }
}
