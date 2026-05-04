"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { DashboardStickyHeader } from "@/components/dashboard-sticky-header";
import { clearAuth, getMe, type UserMe } from "@/lib/auth";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const nav = [
  { href: "/dashboard/admin", label: "Overview" },
  { href: "/dashboard/admin/examinations", label: "Examinations" },
  { href: "/dashboard/admin/schools", label: "Schools" },
  { href: "/dashboard/admin/programmes", label: "Programmes" },
  { href: "/dashboard/admin/subjects", label: "Subjects" },
  { href: "/dashboard/admin/examination-centres", label: "Examination centres" },
  { href: "/dashboard/admin/users", label: "Users" },
  { href: "/dashboard/admin/depots", label: "Depots" },
  { href: "/dashboard/admin/timetable", label: "Examination timetable" },
  { href: "/dashboard/admin/monitoring", label: "Exam overview" },
  { href: "/dashboard/admin/script-control", label: "Worked scripts control" },
  { href: "/dashboard/admin/allocation-examiners", label: "Examiners" },
  { href: "/dashboard/admin/scripts-allocation", label: "Scripts allocation" },
  { href: "/dashboard/admin/documents", label: "Documents" },
];

const SCRIPT_CONTROL_HREF = "/dashboard/admin/script-control";
const SCRIPTS_ALLOCATION_HREF = "/dashboard/admin/scripts-allocation";
const EXAMINERS_HREF = "/dashboard/admin/allocation-examiners";
const MONITORING_HREF = "/dashboard/admin/monitoring";
const TEST_ADMIN_OFFICER_NAV_HREFS = [
  MONITORING_HREF,
  SCRIPT_CONTROL_HREF,
  EXAMINERS_HREF,
  SCRIPTS_ALLOCATION_HREF,
];

type Props = {
  children: React.ReactNode;
};

export function AdminDashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const sidebarNavId = useId();
  const [me, setMe] = useState<UserMe | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const visibleNav = useMemo(() => {
    if (!me) return null;
    if (me.role === "TEST_ADMIN_OFFICER") {
      return nav.filter((item) => TEST_ADMIN_OFFICER_NAV_HREFS.includes(item.href));
    }
    return nav;
  }, [me]);

  const isMonitoringOfficer = me?.role === "TEST_ADMIN_OFFICER";

  function logout() {
    clearAuth();
    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        id={sidebarNavId}
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-out motion-reduce:transition-none lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Exam tools
            </p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">
              {isMonitoringOfficer ? "Monitoring" : "Administration"}
            </p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {visibleNav === null ? (
              <p className="px-3 text-sm text-muted-foreground">Loading…</p>
            ) : (
              visibleNav.map((item) => {
                const active =
                  item.href === "/dashboard/admin"
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-card-foreground hover:bg-muted"
                    } ${inputFocusRing}`}
                  >
                    {item.label}
                  </Link>
                );
              })
            )}
          </nav>
        </div>
      </aside>

      <div className="lg:pl-64">
        <DashboardStickyHeader
          title={isMonitoringOfficer ? "Exam monitoring" : "Administrator dashboard"}
          subtitle={
            me
              ? `${me.full_name}${me.email ? ` · ${me.email}` : ""}`
              : null
          }
          onLogout={logout}
          sidebar={{
            id: sidebarNavId,
            open: sidebarOpen,
            onOpenChange: setSidebarOpen,
          }}
        />

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
