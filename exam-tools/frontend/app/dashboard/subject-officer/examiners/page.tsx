"use client";

import { useMemo } from "react";

import { ExaminersPageShell } from "@/components/examiners/examiners-page-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";
import { RoleGuard } from "@/components/role-guard";
import {
  assignmentsToExaminations,
  examLabelFromAssignment,
} from "@/lib/subject-officer-exams";

export default function SubjectOfficerExaminersPage() {
  const {
    assignments,
    examId,
    subjectId,
    workspaceLabel,
    workspaceSubjects,
    loading,
    mustPickWorkspace,
  } = useSubjectOfficerWorkspace();

  const exams = useMemo(() => assignmentsToExaminations(assignments), [assignments]);

  const examLabelFn = useMemo(
    () => (ex: { id: number }) => examLabelFromAssignment(assignments, ex.id),
    [assignments],
  );

  const subjectOfficerWorkspace = useMemo(() => {
    if (examId == null || subjectId == null) return undefined;
    return {
      examId,
      subjectId,
      label: workspaceLabel,
      subjects: workspaceSubjects,
    };
  }, [examId, subjectId, workspaceLabel, workspaceSubjects]);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Examiners" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ExaminersPageShell
            exams={exams}
            subjects={[]}
            isSuperAdmin={false}
            lockedSubjectIds={subjectId != null ? [subjectId] : undefined}
            markingGroupsMode="subject-officer"
            showScriptsAllocationLink={false}
            loadingExams={loading}
            examLabelFn={examLabelFn}
            showCreateExamsLink={false}
            subjectOfficerAssignments={assignments}
            assignmentsLoading={loading}
            subjectOfficerWorkspace={subjectOfficerWorkspace}
          />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
