import { StaffDocumentsPanel } from "@/components/staff-documents-panel";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

export default function InspectorDocumentsPage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Documents" staffRole="inspector">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          <StaffDocumentsPanel />
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
