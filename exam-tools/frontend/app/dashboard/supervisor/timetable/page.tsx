import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { StaffTimetablePanel } from "@/components/staff-timetable-panel";

export default function SupervisorTimetablePage() {
  return (
    <RoleGuard expectedRole="SUPERVISOR" loginHref="/login/supervisor">
      <DashboardShell title="Examination timetable" staffRole="supervisor">
        <StaffTimetablePanel />
      </DashboardShell>
    </RoleGuard>
  );
}
