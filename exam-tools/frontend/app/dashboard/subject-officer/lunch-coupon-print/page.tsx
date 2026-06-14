"use client";

import { LunchCouponsPrintPanel } from "@/components/subject-officer/lunch-coupons-print-panel";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";

export default function SubjectOfficerLunchCouponPrintPage() {
  const { assignments, loading: assignmentsLoading } = useSubjectOfficerAssignments();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Lunch coupons" staffRole="subject-officer">
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subject assignments found for your account.</p>
        ) : (
          <SubjectOfficerPanelShell>
            <div className="mx-auto w-full max-w-6xl">
              <LunchCouponsPrintPanel
                assignments={assignments}
                assignmentsLoading={assignmentsLoading}
                officerMode
              />
            </div>
          </SubjectOfficerPanelShell>
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
