import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExaminerPortalSchedule,
  hasCoordinationSchedule,
  nextUpcomingScheduleLine,
  selectCohortsForSchedulePhase,
} from "./examiner-portal-schedule.ts";
import type { ExaminerMarkingCohortPublic } from "@/lib/api";

function cohort(
  overrides: Partial<ExaminerMarkingCohortPublic> & Pick<ExaminerMarkingCohortPublic, "id" | "name">,
): ExaminerMarkingCohortPublic {
  return {
    is_default: false,
    coordination_start_date: null,
    coordination_start_time: null,
    coordination_end_date: null,
    coordination_end_time: null,
    coordination_venue: null,
    marking_start_date: null,
    marking_end_date: null,
    marked_script_submission_deadline: null,
    ...overrides,
  };
}

const defaultCohort = cohort({
  id: "default",
  name: "All examiners",
  is_default: true,
  coordination_start_date: "2026-06-01T00:00:00",
  marking_start_date: "2026-06-10T00:00:00",
  marking_end_date: "2026-06-20T00:00:00",
});

const northern = cohort({
  id: "north",
  name: "Northern",
  coordination_start_date: "2026-06-15T00:00:00",
  coordination_end_date: "2026-06-15T00:00:00",
  coordination_start_time: "09:00:00",
  coordination_end_time: "12:00:00",
});

const eastern = cohort({
  id: "east",
  name: "Eastern",
  marking_start_date: "2026-06-08T00:00:00",
  marking_end_date: "2026-06-18T00:00:00",
});

describe("selectCohortsForSchedulePhase", () => {
  it("uses named cohort coordination and ignores default", () => {
    const selected = selectCohortsForSchedulePhase([defaultCohort, northern], "coordination");
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.id, "north");
  });

  it("falls back to default coordination when no named cohort has it", () => {
    const selected = selectCohortsForSchedulePhase(
      [defaultCohort, cohort({ id: "empty", name: "Empty" })],
      "coordination",
    );
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.id, "default");
  });

  it("uses named marking independently of coordination fallback", () => {
    const selected = selectCohortsForSchedulePhase([defaultCohort, eastern], "marking");
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.id, "east");
  });
});

describe("buildExaminerPortalSchedule", () => {
  it("sorts marking lines by date across cohorts", () => {
    const later = cohort({
      id: "late",
      name: "Late",
      marking_start_date: "2026-06-20T00:00:00",
    });
    const schedule = buildExaminerPortalSchedule([later, eastern]);
    assert.equal(schedule.marking.length, 3);
    assert.equal(schedule.marking[0]!.cohortName, "Eastern");
    assert.equal(schedule.marking[0]!.sortKey, "2026-06-08");
    assert.equal(schedule.marking[2]!.cohortName, "Late");
    assert.equal(schedule.marking[2]!.sortKey, "2026-06-20");
  });

  it("shows default coordination only when named cohorts lack it", () => {
    const schedule = buildExaminerPortalSchedule([defaultCohort, eastern]);
    assert.equal(schedule.coordination.length, 1);
    assert.equal(schedule.coordination[0]!.cohortName, "All examiners");
    assert.equal(schedule.marking.length, 2);
    assert.equal(schedule.marking[0]!.cohortName, "Eastern");
    assert.equal(schedule.marking[1]!.cohortName, "Eastern");
  });

  it("returns empty schedule when no dates are set", () => {
    const schedule = buildExaminerPortalSchedule([
      cohort({ id: "a", name: "A" }),
      cohort({ id: "b", name: "B", is_default: true }),
    ]);
    assert.equal(schedule.coordination.length, 0);
    assert.equal(schedule.marking.length, 0);
    assert.equal(schedule.submission.length, 0);
  });
});

describe("hasCoordinationSchedule", () => {
  it("detects coordination end date only", () => {
    assert.equal(
      hasCoordinationSchedule(
        cohort({
          id: "x",
          name: "X",
          coordination_end_date: "2026-06-01T00:00:00",
        }),
      ),
      true,
    );
  });
});

describe("nextUpcomingScheduleLine", () => {
  it("returns the earliest line on or after the reference date", () => {
    const schedule = buildExaminerPortalSchedule([defaultCohort, eastern, northern]);
    const next = nextUpcomingScheduleLine(schedule, "2026-06-01");
    assert.equal(next?.phase, "marking");
    assert.equal(next?.cohortName, "Eastern");
    assert.equal(next?.sortKey, "2026-06-08");
  });
});
