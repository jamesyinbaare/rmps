import { AdminDashboardShell } from "@/components/admin-dashboard-shell";
import { RoleGuard } from "@/components/role-guard";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RoleGuard expectedRole="SUPER_ADMIN" loginHref="/login/admin">
      <AdminDashboardShell>{children}</AdminDashboardShell>
    </RoleGuard>
  );
}
