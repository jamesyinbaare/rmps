"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  cohortsWithScheduleCount,
  eventsFromMarkingGroups,
  type MarkingCalendarEvent,
} from "@/lib/subject-officer-marking-events";
import {
  listExaminationExaminers,
  listExaminerInvitations,
  listSubjectMarkingGroups,
  type SubjectMarkingGroupRow,
  type SubjectOfficerMeAssignmentSubject,
} from "@/lib/api";
import { subjectDisplayLabel } from "@/lib/subject-display";

export type SubjectOfficerDashboardStats = {
  examinerCount: number;
  invitationsPending: number;
  invitationsAccepted: number;
  invitationsDeclined: number;
  cohortsWithSchedule: number;
};

type Options = {
  examId: number | null;
  subjects: SubjectOfficerMeAssignmentSubject[];
};

export function useSubjectOfficerDashboard({ examId, subjects }: Options) {
  const [groups, setGroups] = useState<SubjectMarkingGroupRow[]>([]);
  const [events, setEvents] = useState<MarkingCalendarEvent[]>([]);
  const [stats, setStats] = useState<SubjectOfficerDashboardStats>({
    examinerCount: 0,
    invitationsPending: 0,
    invitationsAccepted: 0,
    invitationsDeclined: 0,
    cohortsWithSchedule: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectsRef = useRef(subjects);
  subjectsRef.current = subjects;

  const subjectIdsKey = useMemo(
    () =>
      subjects
        .map((s) => s.subject_id)
        .sort((a, b) => a - b)
        .join(","),
    [subjects],
  );

  const load = useCallback(async () => {
    const currentSubjects = subjectsRef.current;
    const subjectIds = subjectIdsKey
      ? subjectIdsKey.split(",").map((id) => Number.parseInt(id, 10))
      : [];
    const subjectIdSet = new Set(subjectIds);
    const subjectLabelById = new Map(
      currentSubjects.map((s) => [s.subject_id, subjectDisplayLabel(s)] as const),
    );

    if (examId == null || subjectIds.length === 0) {
      setGroups([]);
      setEvents([]);
      setStats({
        examinerCount: 0,
        invitationsPending: 0,
        invitationsAccepted: 0,
        invitationsDeclined: 0,
        cohortsWithSchedule: 0,
      });
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [groupResults, examiners, invitations] = await Promise.all([
        Promise.all(subjectIds.map((id) => listSubjectMarkingGroups(examId, id))),
        listExaminationExaminers(examId),
        listExaminerInvitations(examId),
      ]);

      const flatGroups = groupResults.flat();
      const scopedExaminers = examiners.filter((e) =>
        e.subject_ids.some((id) => subjectIdSet.has(id)),
      );
      const scopedInvitations = invitations.filter((inv) => subjectIdSet.has(inv.subject_id));

      const calendarEvents = eventsFromMarkingGroups(flatGroups, subjectLabelById);

      setGroups(flatGroups);
      setEvents(calendarEvents);
      setStats({
        examinerCount: scopedExaminers.length,
        invitationsPending: scopedInvitations.filter((i) => i.status === "pending").length,
        invitationsAccepted: scopedInvitations.filter((i) => i.status === "accepted").length,
        invitationsDeclined: scopedInvitations.filter(
          (i) => i.status === "declined" || i.status === "expired",
        ).length,
        cohortsWithSchedule: cohortsWithScheduleCount(flatGroups),
      });
    } catch (e) {
      setGroups([]);
      setEvents([]);
      setStats({
        examinerCount: 0,
        invitationsPending: 0,
        invitationsAccepted: 0,
        invitationsDeclined: 0,
        cohortsWithSchedule: 0,
      });
      setError(e instanceof Error ? e.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [examId, subjectIdsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { groups, events, stats, loading, error, refetch: load };
}
