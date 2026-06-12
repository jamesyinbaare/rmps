import {
  isoToDateInput,
  isoToTimeInput,
} from "@/components/cohorts/cohort-schedule-utils";
import type { SubjectMarkingGroupRow } from "@/lib/api";

export type MarkingEventKind =
  | "coordination"
  | "marking_start"
  | "marking_end"
  | "submission_deadline";

export type MarkingCalendarEvent = {
  id: string;
  kind: MarkingEventKind;
  date: string;
  cohortName: string;
  subjectId: number;
  subjectLabel: string;
  groupId: string;
  startTime?: string | null;
  endTime?: string | null;
};

export const MARKING_EVENT_KIND_LABELS: Record<MarkingEventKind, string> = {
  coordination: "Coordination",
  marking_start: "Marking starts",
  marking_end: "Marking ends",
  submission_deadline: "Submission deadline",
};

function pushEvent(
  events: MarkingCalendarEvent[],
  params: Omit<MarkingCalendarEvent, "id">,
): void {
  if (!params.date) return;
  events.push({
    ...params,
    id: `${params.groupId}-${params.kind}-${params.date}`,
  });
}

export function eventsFromMarkingGroups(
  groups: SubjectMarkingGroupRow[],
  subjectLabelById: Map<number, string>,
): MarkingCalendarEvent[] {
  const events: MarkingCalendarEvent[] = [];

  for (const group of groups) {
    const subjectLabel = subjectLabelById.get(group.subject_id) ?? `Subject ${group.subject_id}`;
    const cohortName = group.is_default ? "All examiners" : group.name;

    const coordinationStartDate = isoToDateInput(group.coordination_start_date);
    const coordinationEndDate = isoToDateInput(group.coordination_end_date);
    if (coordinationStartDate || coordinationEndDate) {
      pushEvent(events, {
        kind: "coordination",
        date: coordinationStartDate || coordinationEndDate,
        cohortName,
        subjectId: group.subject_id,
        subjectLabel,
        groupId: group.id,
        startTime: isoToTimeInput(group.coordination_start_time),
        endTime: isoToTimeInput(group.coordination_end_time),
      });
    }

    const markingStart = isoToDateInput(group.marking_start_date);
    if (markingStart) {
      pushEvent(events, {
        kind: "marking_start",
        date: markingStart,
        cohortName,
        subjectId: group.subject_id,
        subjectLabel,
        groupId: group.id,
      });
    }

    const markingEnd = isoToDateInput(group.marking_end_date);
    if (markingEnd) {
      pushEvent(events, {
        kind: "marking_end",
        date: markingEnd,
        cohortName,
        subjectId: group.subject_id,
        subjectLabel,
        groupId: group.id,
      });
    }

    const deadline = isoToDateInput(group.marked_script_submission_deadline);
    if (deadline) {
      pushEvent(events, {
        kind: "submission_deadline",
        date: deadline,
        cohortName,
        subjectId: group.subject_id,
        subjectLabel,
        groupId: group.id,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export function datesWithEvents(events: MarkingCalendarEvent[]): Set<string> {
  return new Set(events.map((e) => e.date));
}

export function eventsOnDate(events: MarkingCalendarEvent[], date: string): MarkingCalendarEvent[] {
  return events.filter((e) => e.date === date);
}

export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function upcomingEvents(
  events: MarkingCalendarEvent[],
  fromDate: Date = new Date(),
  limit = 10,
): MarkingCalendarEvent[] {
  const from = toDateInput(fromDate);
  return events.filter((e) => e.date >= from).slice(0, limit);
}

export function eventsInNextDays(
  events: MarkingCalendarEvent[],
  days: number,
  fromDate: Date = new Date(),
): MarkingCalendarEvent[] {
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const from = toDateInput(start);
  const to = toDateInput(end);
  return events.filter((e) => e.date >= from && e.date <= to);
}

type MarkingRange = { start: string; end: string; groupId: string };

function markingRangesFromGroups(groups: SubjectMarkingGroupRow[]): MarkingRange[] {
  const ranges: MarkingRange[] = [];
  for (const group of groups) {
    const start = isoToDateInput(group.marking_start_date);
    const end = isoToDateInput(group.marking_end_date);
    if (start && end && start <= end) {
      ranges.push({ start, end, groupId: group.id });
    }
  }
  return ranges;
}

export function markingRangeDates(groups: SubjectMarkingGroupRow[]): Set<string> {
  const dates = new Set<string>();
  for (const { start, end } of markingRangesFromGroups(groups)) {
    const cursor = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    while (cursor <= endDate) {
      dates.add(toDateInput(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return dates;
}

export function calendarModifiers(
  events: MarkingCalendarEvent[],
  markingRangeDateSet: Set<string>,
): {
  hasCoordination: Date[];
  hasMarking: Date[];
  hasDeadline: Date[];
  inMarkingRange: Date[];
} {
  const toDate = (s: string) => new Date(`${s}T12:00:00`);

  return {
    hasCoordination: events.filter((e) => e.kind === "coordination").map((e) => toDate(e.date)),
    hasMarking: events
      .filter((e) => e.kind === "marking_start" || e.kind === "marking_end")
      .map((e) => toDate(e.date)),
    hasDeadline: events.filter((e) => e.kind === "submission_deadline").map((e) => toDate(e.date)),
    inMarkingRange: [...markingRangeDateSet].map((d) => toDate(d)),
  };
}

export function cohortsWithScheduleCount(groups: SubjectMarkingGroupRow[]): number {
  return groups.filter(
    (g) =>
      g.coordination_start_date ||
      g.coordination_end_date ||
      g.marking_start_date ||
      g.marking_end_date ||
      g.marked_script_submission_deadline,
  ).length;
}

export function relativeDateLabel(date: string, fromDate: Date = new Date()): string {
  const today = toDateInput(fromDate);
  const tomorrowDate = new Date(fromDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toDateInput(tomorrowDate);

  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";

  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: parsed.getFullYear() !== fromDate.getFullYear() ? "numeric" : undefined,
  });
}

export function monthsFromDateKeys(dateKeys: string[]): Date[] {
  const seen = new Set<string>();
  const months: Date[] = [];
  for (const dateKey of dateKeys) {
    const key = dateKey.slice(0, 7);
    if (seen.has(key)) continue;
    seen.add(key);
    const [year, month] = key.split("-").map(Number);
    months.push(new Date(year, month - 1, 1));
  }
  return months.sort((a, b) => a.getTime() - b.getTime());
}

export function monthsWithEvents(events: MarkingCalendarEvent[]): Date[] {
  return monthsFromDateKeys(events.map((event) => event.date));
}

export function calendarMonthBounds(dateKeys: string[]): {
  startMonth?: Date;
  endMonth?: Date;
} {
  if (dateKeys.length === 0) return {};
  const sorted = [...dateKeys].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const [startYear, startMonth] = first.split("-").map(Number);
  const [endYear, endMonth] = last.split("-").map(Number);
  return {
    startMonth: new Date(startYear, startMonth - 1, 1),
    endMonth: new Date(endYear, endMonth - 1, 1),
  };
}

/** Every calendar month from startMonth through endMonth (inclusive). */
export function eachCalendarMonthBetween(startMonth: Date, endMonth: Date): Date[] {
  const start = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const end = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);
  if (start > end) return [];

  const months: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function clampCalendarMonth(
  month: Date,
  startMonth?: Date,
  endMonth?: Date,
): Date {
  if (!startMonth || !endMonth) return month;
  const normalized = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const end = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);
  if (normalized < start) return start;
  if (normalized > end) return end;
  return normalized;
}

export function calendarNavContext(
  groups: SubjectMarkingGroupRow[],
  events: MarkingCalendarEvent[],
): {
  startMonth?: Date;
  endMonth?: Date;
  navigableMonths: Date[];
} {
  const dateKeys = new Set<string>();
  for (const event of events) dateKeys.add(event.date);
  for (const date of markingRangeDates(groups)) dateKeys.add(date);

  const bounds = calendarMonthBounds([...dateKeys]);
  if (!bounds.startMonth || !bounds.endMonth) {
    return { navigableMonths: [] };
  }

  return {
    startMonth: bounds.startMonth,
    endMonth: bounds.endMonth,
    navigableMonths: eachCalendarMonthBetween(bounds.startMonth, bounds.endMonth),
  };
}

export function isSameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function formatCalendarMonthLabel(month: Date): string {
  return month.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function groupEventsByDate(
  events: MarkingCalendarEvent[],
): { date: string; events: MarkingCalendarEvent[] }[] {
  const byDate = new Map<string, MarkingCalendarEvent[]>();
  for (const event of events) {
    const bucket = byDate.get(event.date) ?? [];
    bucket.push(event);
    byDate.set(event.date, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateEvents]) => ({ date, events: dateEvents }));
}
