"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { ExaminationNoticeClient } from "@/components/examination-notice-client";
import { RoleGuard } from "@/components/role-guard";

export default function InspectorExaminationNoticePage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Examination notice" staffRole="inspector">
        <ExaminationNoticeClient dataScope="centre" centreRole="inspector" />
      </DashboardShell>
    </RoleGuard>
  );
}
