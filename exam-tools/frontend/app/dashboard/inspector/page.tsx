import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

const linkClass =
  "font-medium text-primary underline-offset-2 hover:underline focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 rounded-md";

export default function InspectorDashboardPage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Inspector dashboard" staffRole="inspector">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <p className="text-base text-card-foreground">
              Download your school&apos;s examination timetable from{" "}
              <Link href="/dashboard/inspector/timetable" className={linkClass}>
                Examination timetable
              </Link>
              .
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              More school and examination tasks will appear here as features are added.
            </p>
          </div>
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
