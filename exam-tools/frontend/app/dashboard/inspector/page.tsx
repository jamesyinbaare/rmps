import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

export default function InspectorDashboardPage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Inspector dashboard">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <p className="text-base text-muted-foreground">
            Your inspector workspace. School and examination tasks will appear
            here as features are added.
          </p>
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
