import { Suspense } from "react";

import { AdminDashboardShell } from "@/components/admin-dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { ADMIN_PORTAL_ROLES } from "@/lib/auth";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RoleGuard allowedRoles={ADMIN_PORTAL_ROLES} loginHref="/login/admin">
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <AdminDashboardShell>{children}</AdminDashboardShell>
      </Suspense>
    </RoleGuard>
  );
}
