"use client";

import { LunchCouponsPrintPanel } from "@/components/subject-officer/lunch-coupons-print-panel";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";

export default function SubjectOfficerLunchCouponPrintPage() {
  const { assignments, examId, subjectId, workspaceLabel, loading, mustPickWorkspace } =
    useSubjectOfficerWorkspace();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Lunch coupons" staffRole="subject-officer">
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null || subjectId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to print lunch coupons.</p>
        ) : (
          <SubjectOfficerPanelShell>
            <div className="mx-auto w-full max-w-6xl">
              <LunchCouponsPrintPanel
                assignments={assignments}
                officerMode
                workspaceExamId={examId}
                workspaceSubjectId={subjectId}
                workspaceLabel={workspaceLabel}
              />
            </div>
          </SubjectOfficerPanelShell>
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
