"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { ExaminationNoticeClient } from "@/components/examination-notice-client";
import { RoleGuard } from "@/components/role-guard";

export default function DepotKeeperExaminationNoticePage() {
  return (
    <RoleGuard expectedRole="DEPOT_KEEPER" loginHref="/login/depot-keeper">
      <DashboardShell title="Examination notice" staffRole="depot-keeper">
        <ExaminationNoticeClient dataScope="depot" />
      </DashboardShell>
    </RoleGuard>
  );
}
