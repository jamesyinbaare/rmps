"use client";

import { LunchCouponsPrintPanel } from "@/components/subject-officer/lunch-coupons-print-panel";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { useAdminExamAssignments } from "@/hooks/use-admin-exam-assignments";

export default function AdminLunchCouponPrintPage() {
  const { assignments, loading } = useAdminExamAssignments();

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <OfficialAccountsPageIntro
          description="Download printable lunch coupon PDFs per subject for backup distribution."
          footerNote={null}
        />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <LunchCouponsPrintPanel assignments={assignments} assignmentsLoading={loading} />
        )}
      </div>
    </RoleGuard>
  );
}
