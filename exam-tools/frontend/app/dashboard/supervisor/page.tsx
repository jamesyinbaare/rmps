import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

export default function SupervisorDashboardPage() {
  return (
    <RoleGuard expectedRole="SUPERVISOR" loginHref="/login/supervisor">
      <DashboardShell title="Supervisor dashboard">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <p className="text-base text-muted-foreground">
            Your school supervisor workspace. Management tools will appear here
            as features are added.
          </p>
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
