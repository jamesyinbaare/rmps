import { DashboardShell } from "@/components/dashboard-shell";
import { StaffDashboardOverview } from "@/components/staff-dashboard-overview";
import { RoleGuard } from "@/components/role-guard";

export default function SupervisorDashboardPage() {
  return (
    <RoleGuard expectedRole="SUPERVISOR" loginHref="/login/supervisor">
      <DashboardShell title="Supervisor dashboard" staffRole="supervisor">
        <StaffDashboardOverview examinationNoticeHref="/dashboard/supervisor/examination-notice" />
      </DashboardShell>
    </RoleGuard>
  );
}
