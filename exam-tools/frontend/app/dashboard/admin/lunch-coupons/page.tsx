"use client";

import { LunchVerificationShell } from "@/components/subject-officer/lunch-verification-shell";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { useAdminExamAssignments } from "@/hooks/use-admin-exam-assignments";

export default function AdminLunchCouponsPage() {
  const { assignments, loading } = useAdminExamAssignments();

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      <div className="space-y-4">
        <OfficialAccountsPageIntro description="Scan or enter reference codes to verify examiners for lunch today." />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <LunchVerificationShell assignments={assignments} adminMode />
        )}
      </div>
    </RoleGuard>
  );
}
