import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { StaffTimetablePanel } from "@/components/staff-timetable-panel";

export default function InspectorTimetablePage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Examination timetable" staffRole="inspector">
        <StaffTimetablePanel />
      </DashboardShell>
    </RoleGuard>
  );
}
