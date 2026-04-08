"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { ExaminationNoticeClient } from "@/components/examination-notice-client";
import { RoleGuard } from "@/components/role-guard";

export default function SupervisorExaminationNoticePage() {
  return (
    <RoleGuard expectedRole="SUPERVISOR" loginHref="/login/supervisor">
      <DashboardShell title="Examination notice" staffRole="supervisor">
        <ExaminationNoticeClient dataScope="centre" />
      </DashboardShell>
    </RoleGuard>
  );
}
