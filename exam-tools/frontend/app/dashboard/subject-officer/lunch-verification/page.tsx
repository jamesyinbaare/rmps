"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { LunchVerificationShell } from "@/components/subject-officer/lunch-verification-shell";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";

export default function SubjectOfficerLunchVerificationPage() {
  const { examId, workspaceLabel, loading, mustPickWorkspace } = useSubjectOfficerWorkspace();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Coupon verification" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to verify lunch coupons.</p>
        ) : (
          <SubjectOfficerPanelShell>
            <LunchVerificationShell examId={examId} workspaceLabel={workspaceLabel} />
          </SubjectOfficerPanelShell>
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
