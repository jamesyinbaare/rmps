"use client";

import { useMemo } from "react";

import { ExaminersPageShell } from "@/components/examiners/examiners-page-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import { useSubjectOfficerExamUrl } from "@/hooks/use-subject-officer-exam-url";
import {
  assignmentsToExaminations,
  examLabelFromAssignment,
  subjectIdsForExam,
  subjectsForExam,
} from "@/lib/subject-officer-exams";

export default function SubjectOfficerExaminersPage() {
  const { assignments, loading } = useSubjectOfficerAssignments();
  const examIds = useMemo(() => assignments.map((a) => a.examination_id), [assignments]);
  const { examId } = useSubjectOfficerExamUrl({ examIds, requireSelection: true });

  const exams = useMemo(() => assignmentsToExaminations(assignments), [assignments]);
  const subjects = useMemo(() => subjectsForExam(assignments, examId), [assignments, examId]);
  const lockedSubjectIds = useMemo(
    () => subjectIdsForExam(assignments, examId),
    [assignments, examId],
  );

  const examLabelFn = useMemo(
    () => (ex: { id: number }) => examLabelFromAssignment(assignments, ex.id),
    [assignments],
  );

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Examiners" staffRole="subject-officer">
        <ExaminersPageShell
          exams={exams}
          subjects={subjects}
          isSuperAdmin={false}
          lockedSubjectIds={lockedSubjectIds}
          markingGroupsMode="subject-officer"
          showScriptsAllocationLink={false}
          loadingExams={loading}
          requireExamSelection
          examLabelFn={examLabelFn}
          showCreateExamsLink={false}
        />
      </DashboardShell>
    </RoleGuard>
  );
}
