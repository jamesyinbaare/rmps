"use client";

import { useMemo } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { SubjectOfficerDashboard } from "@/components/subject-officer/subject-officer-dashboard";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";
import { RoleGuard } from "@/components/role-guard";

export default function SubjectOfficerDashboardPage() {
  const {
    assignments,
    examId,
    subjectId,
    loading,
    mustPickWorkspace,
  } = useSubjectOfficerWorkspace();

  const subjects = useMemo(() => {
    if (examId == null || subjectId == null) return [];
    const exam = assignments.find((a) => a.examination_id === examId);
    return exam?.subjects.filter((s) => s.subject_id === subjectId) ?? [];
  }, [assignments, examId, subjectId]);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Marking overview" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null || subjectId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to view your marking overview.</p>
        ) : (
          <SubjectOfficerDashboard
            assignments={assignments}
            examId={examId}
            subjects={subjects}
            assignmentsLoading={loading}
          />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
