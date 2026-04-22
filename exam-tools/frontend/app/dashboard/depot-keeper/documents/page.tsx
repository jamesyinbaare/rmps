import { StaffDocumentsPanel } from "@/components/staff-documents-panel";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

export default function DepotKeeperDocumentsPage() {
  return (
    <RoleGuard expectedRole="DEPOT_KEEPER" loginHref="/login/depot-keeper">
      <DashboardShell title="Documents" staffRole="depot-keeper">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          <StaffDocumentsPanel />
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
