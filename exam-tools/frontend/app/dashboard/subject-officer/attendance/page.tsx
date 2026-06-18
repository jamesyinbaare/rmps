"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { ExaminerAttendanceShell } from "@/components/subject-officer/examiner-attendance-shell";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";

export default function SubjectOfficerAttendancePage() {
  const { examId, subjectId, workspaceLabel, loading, mustPickWorkspace } = useSubjectOfficerWorkspace();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Attendance" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to mark attendance.</p>
        ) : (
          <ExaminerAttendanceShell examId={examId} subjectId={subjectId ?? undefined} workspaceLabel={workspaceLabel} />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
