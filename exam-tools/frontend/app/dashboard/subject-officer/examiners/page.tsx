"use client";

import { useMemo } from "react";

import { ExaminersPageShell } from "@/components/examiners/examiners-page-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import {
  assignmentsToExaminations,
  examLabelFromAssignment,
} from "@/lib/subject-officer-exams";

export default function SubjectOfficerExaminersPage() {
  const { assignments, loading } = useSubjectOfficerAssignments();

  const exams = useMemo(() => assignmentsToExaminations(assignments), [assignments]);

  const examLabelFn = useMemo(
    () => (ex: { id: number }) => examLabelFromAssignment(assignments, ex.id),
    [assignments],
  );

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Examiners" staffRole="subject-officer">
        <ExaminersPageShell
          exams={exams}
          subjects={[]}
          isSuperAdmin={false}
          markingGroupsMode="subject-officer"
          showScriptsAllocationLink={false}
          loadingExams={loading}
          requireExamSelection
          examLabelFn={examLabelFn}
          showCreateExamsLink={false}
          subjectOfficerAssignments={assignments}
          assignmentsLoading={loading}
        />
      </DashboardShell>
    </RoleGuard>
  );
}
