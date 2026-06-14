import { formatDateOnly } from "@/components/examiner-invitations/utils";
import type { CohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";
import { formatTimeLabel } from "@/components/cohorts/cohort-schedule-utils";
import type { CohortRosterMember } from "@/components/cohorts/types";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { REGION_OPTIONS } from "@/lib/school-enums";
import type { ExaminerTypeApi } from "@/lib/api";

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

function roleLabel(type: ExaminerTypeApi): string {
  return EXAMINER_TYPE_LABELS[type] ?? type;
}

function dateLabel(value: string): string {
  if (!value) return "";
  const formatted = formatDateOnly(value);
  return formatted === "—" ? "" : formatted;
}

function timeLabel(value: string): string {
  if (!value) return "";
  const formatted = formatTimeLabel(value);
  return formatted === "—" ? "" : formatted;
}

export function formatScheduleBrief(cohortName: string, schedule: CohortScheduleDraft): string {
  const lines: string[] = [cohortName, ""];

  const coordStart = dateLabel(schedule.coordinationStartDate);
  const coordEnd = dateLabel(schedule.coordinationEndDate);
  const coordStartTime = timeLabel(schedule.coordinationStartTime);
  const coordEndTime = timeLabel(schedule.coordinationEndTime);

  if (coordStart || coordEnd || schedule.coordinationVenue.trim()) {
    lines.push("Coordination");
    if (coordStart && coordEnd && coordStart !== coordEnd) {
      let range = `${coordStart} – ${coordEnd}`;
      if (coordStartTime || coordEndTime) {
        range += ` (${coordStartTime || "—"} – ${coordEndTime || "—"})`;
      }
      lines.push(range);
    } else if (coordStart) {
      let line = coordStart;
      if (coordStartTime || coordEndTime) {
        line += ` (${coordStartTime || "—"} – ${coordEndTime || "—"})`;
      }
      lines.push(line);
    }
    if (schedule.coordinationVenue.trim()) {
      lines.push(`Venue: ${schedule.coordinationVenue.trim()}`);
    }
    lines.push("");
  }

  const markingStart = dateLabel(schedule.markingStartDate);
  const markingEnd = dateLabel(schedule.markingEndDate);
  if (markingStart || markingEnd) {
    lines.push("Marking");
    if (markingStart && markingEnd && markingStart !== markingEnd) {
      lines.push(`${markingStart} – ${markingEnd}`);
    } else {
      lines.push(markingStart || markingEnd);
    }
    lines.push("");
  }

  const submitBy = dateLabel(schedule.markedScriptSubmissionDeadline);
  if (submitBy) {
    lines.push("Script submission");
    lines.push(`Submit by ${submitBy}`);
  }

  return lines.join("\n").trim();
}

export function formatPhoneList(members: CohortRosterMember[]): string {
  return members
    .map((m) => m.phone_number?.trim())
    .filter((p): p is string => Boolean(p))
    .join("\n");
}

export function formatRosterTsv(members: CohortRosterMember[]): string {
  const header = ["Name", "Role", "Region", "Phone", "Reference code"].join("\t");
  const rows = members.map((m) =>
    [
      m.name,
      roleLabel(m.examiner_type),
      regionLabel(m.region),
      m.phone_number?.trim() ?? "",
      m.reference_code?.trim() ?? "",
    ].join("\t"),
  );
  return [header, ...rows].join("\n");
}

export function membersWithPhoneCount(members: CohortRosterMember[]): number {
  return members.filter((m) => m.phone_number?.trim()).length;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
