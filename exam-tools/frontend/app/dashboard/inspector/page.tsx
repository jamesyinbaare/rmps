import { DashboardShell } from "@/components/dashboard-shell";
import { StaffDashboardOverview } from "@/components/staff-dashboard-overview";
import { RoleGuard } from "@/components/role-guard";

export default function InspectorDashboardPage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Inspector dashboard" staffRole="inspector">
        <StaffDashboardOverview />
      </DashboardShell>
    </RoleGuard>
  );
}
