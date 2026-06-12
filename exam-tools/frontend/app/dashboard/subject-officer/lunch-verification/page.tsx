"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { LunchVerificationShell } from "@/components/subject-officer/lunch-verification-shell";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";

export default function SubjectOfficerLunchVerificationPage() {
  const { assignments, loading: assignmentsLoading } = useSubjectOfficerAssignments();

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Lunch Coupons" staffRole="subject-officer">
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subject assignments found for your account.</p>
        ) : (
          <LunchVerificationShell assignments={assignments} assignmentsLoading={assignmentsLoading} />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
