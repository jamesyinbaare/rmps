import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { StaffTimetablePanel } from "@/components/staff-timetable-panel";

export default function DepotKeeperTimetablePage() {
  return (
    <RoleGuard expectedRole="DEPOT_KEEPER" loginHref="/login/depot-keeper">
      <DashboardShell title="Examination timetable" staffRole="depot-keeper">
        <StaffTimetablePanel timetableScope="depot" />
      </DashboardShell>
    </RoleGuard>
  );
}
