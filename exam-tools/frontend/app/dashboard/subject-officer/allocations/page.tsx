"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { SubjectOfficerAllocationsShell } from "@/components/subject-officer/subject-officer-allocations-shell";
import { useSubjectOfficerAllocationsUrl } from "@/components/subject-officer/use-subject-officer-allocations-url";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";
import { RoleGuard } from "@/components/role-guard";

export default function SubjectOfficerAllocationsPage() {
  const { examId, subjectId, workspaceLabel, loading, mustPickWorkspace } = useSubjectOfficerWorkspace();
  const { examinerId, setExaminerId } = useSubjectOfficerAllocationsUrl();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Allocations" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null || subjectId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to view allocations.</p>
        ) : (
          <SubjectOfficerAllocationsShell
            examId={examId}
            subjectId={subjectId}
            workspaceLabel={workspaceLabel ?? ""}
            examinerId={examinerId}
            onExaminerChange={setExaminerId}
          />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
