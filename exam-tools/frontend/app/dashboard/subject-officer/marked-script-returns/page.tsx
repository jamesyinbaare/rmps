"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { MarkedScriptReturnsVerificationShell } from "@/components/subject-officer/marked-script-returns-verification-shell";
import { useMarkedScriptReturnsUrl } from "@/components/subject-officer/use-marked-script-returns-url";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";
import { RoleGuard } from "@/components/role-guard";

export default function SubjectOfficerMarkedScriptReturnsPage() {
  const { examId, subjectId, workspaceLabel, loading, mustPickWorkspace } = useSubjectOfficerWorkspace();
  const { session, setSession } = useMarkedScriptReturnsUrl();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Marked scripts" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null || subjectId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to verify marked scripts.</p>
        ) : (
          <MarkedScriptReturnsVerificationShell
            examId={examId}
            subjectId={subjectId}
            workspaceLabel={workspaceLabel ?? ""}
            session={session}
            onSessionChange={setSession}
          />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
