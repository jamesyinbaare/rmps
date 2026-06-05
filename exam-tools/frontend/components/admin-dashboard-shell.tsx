"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useState } from "react";

import { DashboardStickyHeader } from "@/components/dashboard-sticky-header";
import { ExecutiveBottomTabNav } from "@/components/executive-bottom-tab-nav";
import {
  EXECUTIVE_CENTRES_HREF,
  EXECUTIVE_MONITORING_HREF,
  TEST_ADMIN_INSPECTORS_HREF,
  executiveMonitoringHref,
  executiveUserDisplayName,
  monitoringExamScopedHref,
} from "@/lib/executive-selected-examination";
import { clearAuth, getMe, type UserMe } from "@/lib/auth";
import { FinanceNavSection } from "@/components/finance-nav-section";
import { FinanceSidebar } from "@/components/finance-sidebar";
import { SidebarThemeToggle } from "@/components/sidebar-theme-toggle";
import { isOfficialAccountsPath } from "@/lib/official-accounts-zone";
import {
  ATTENDANCE_SHEETS_HREF,
  BANK_DIRECTORY_HREF,
  BANK_DIRECTORY_NAV_ITEM,
  CENTRE_SUMMARY_HREF,
  FINANCE_CENTRE_SUMMARY_HREF,
  financePageStickyTitle,
  OFFICIAL_STATISTICS_HREF,
} from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const nav = [
  { href: "/dashboard/admin", label: "Overview" },
  { href: "/dashboard/admin/examinations", label: "Examinations" },
  { href: "/dashboard/admin/schools", label: "Schools" },
  { href: "/dashboard/admin/programmes", label: "Programmes" },
  { href: "/dashboard/admin/subjects", label: "Subjects" },
  { href: "/dashboard/admin/examination-centres", label: "Examination centres" },
  { href: "/dashboard/admin/inspector-postings", label: "Inspector postings" },
  { href: "/dashboard/admin/inspectors", label: "Inspectors" },
  { href: "/dashboard/admin/users", label: "Users" },
  { href: "/dashboard/admin/depots", label: "Depots" },
  { href: BANK_DIRECTORY_HREF, label: "Bank directory" },
  { href: "/dashboard/admin/timetable", label: "Examination timetable" },
  { href: "/dashboard/admin/monitoring", label: "Exam overview" },
  { href: "/dashboard/admin/monitoring/inspectors", label: "Inspectors" },
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
  TEST_ADMIN_INSPECTORS_HREF,
  SCRIPT_CONTROL_HREF,
  EXAMINERS_HREF,
  SCRIPTS_ALLOCATION_HREF,
];

const EXECUTIVE_VIEWER_NAV: NavLinkItem[] = [
  { type: "link", href: EXECUTIVE_MONITORING_HREF, label: "Home" },
  { type: "link", href: EXECUTIVE_CENTRES_HREF, label: "Centres" },
];

type NavLinkItem = { type: "link"; href: string; label: string };
type NavHeadingItem = { type: "heading"; label: string };
type NavEntry = NavLinkItem | NavHeadingItem;

function toLinkItem(item: { href: string; label: string }): NavLinkItem {
  return { type: "link", href: item.href, label: item.label };
}

type Props = {
  children: React.ReactNode;
};

export function AdminDashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const executiveExamIdFromUrl = searchParams.get("exam_id");
  const sidebarNavId = useId();
  const [me, setMe] = useState<UserMe | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const visibleNavEntries = useMemo((): NavEntry[] | null => {
    if (!me) return null;
    if (me.role === "TEST_ADMIN_OFFICER") {
      return nav.filter((item) => TEST_ADMIN_OFFICER_NAV_HREFS.includes(item.href)).map(toLinkItem);
    }
    if (me.role === "EXECUTIVE_VIEWER") {
      return EXECUTIVE_VIEWER_NAV;
    }
    if (me.role === "FINANCE_OFFICER") {
      return null;
    }
    if (me.role === "SUPER_ADMIN") {
      return nav
        .filter((n) => n.href !== BANK_DIRECTORY_HREF && n.href !== TEST_ADMIN_INSPECTORS_HREF)
        .map(toLinkItem);
    }
    return nav.map(toLinkItem);
  }, [me]);

  const isMonitoringOfficer = me?.role === "TEST_ADMIN_OFFICER";
  const isExecutiveViewer = me?.role === "EXECUTIVE_VIEWER";
  const isTopLevelOfficer = isMonitoringOfficer || isExecutiveViewer;
  const isFinanceOfficer = me?.role === "FINANCE_OFFICER";
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const onExecutiveCentresPage = pathname === EXECUTIVE_CENTRES_HREF;
  const onTestAdminInspectorsPage = pathname === TEST_ADMIN_INSPECTORS_HREF;
  const onCentreSummaryPage =
    pathname === CENTRE_SUMMARY_HREF || pathname.startsWith(`${CENTRE_SUMMARY_HREF}/`);
  const onFinanceCentreSummaryPage =
    pathname === FINANCE_CENTRE_SUMMARY_HREF || pathname.startsWith(`${FINANCE_CENTRE_SUMMARY_HREF}/`);
  const onOfficialStatisticsPage =
    pathname === OFFICIAL_STATISTICS_HREF || pathname.startsWith(`${OFFICIAL_STATISTICS_HREF}/`);
  const financeTitle = financePageStickyTitle(pathname);
  const showFinanceNavAccent =
    (isFinanceOfficer || isSuperAdmin) && isOfficialAccountsPath(pathname);

  function logout() {
    clearAuth();
    router.replace("/");
  }

  const executiveStickyTitle = isExecutiveViewer
    ? onExecutiveCentresPage
      ? "Centres"
      : "Home"
    : null;

  const testAdminStickyTitle = isMonitoringOfficer
    ? onTestAdminInspectorsPage
      ? "Inspectors"
      : "Exam monitoring"
    : null;

  function navLinkActive(href: string): boolean {
    if (href === "/dashboard/admin") return pathname === href;
    if (href === MONITORING_HREF || href === EXECUTIVE_MONITORING_HREF) {
      return pathname === href;
    }
    if (isExecutiveViewer && href === EXECUTIVE_CENTRES_HREF) {
      return pathname === EXECUTIVE_CENTRES_HREF;
    }
    if (isMonitoringOfficer && href === TEST_ADMIN_INSPECTORS_HREF) {
      return pathname === TEST_ADMIN_INSPECTORS_HREF;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const isScriptControlEdit = pathname.startsWith("/dashboard/admin/script-control/edit");

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
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-out motion-reduce:transition-none lg:translate-x-0",
          isExecutiveViewer && "hidden lg:block",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div
            className={cn(
              "border-b border-border p-4",
              isFinanceOfficer && "bg-gradient-to-br from-success/10 via-card to-card",
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Exam tools
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                isFinanceOfficer ? "text-success" : "text-card-foreground",
              )}
            >
              {isExecutiveViewer
                ? me
                  ? executiveUserDisplayName(me)
                  : "Executive overview"
                : isTopLevelOfficer
                  ? "Monitoring"
                  : isFinanceOfficer
                    ? "Finance"
                    : "Administration"}
            </p>
          </div>
          {isFinanceOfficer ? (
            me ? (
              <FinanceSidebar pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
            ) : (
              <p className="px-3 text-sm text-muted-foreground">Loading…</p>
            )
          ) : (
            <nav
              className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 pb-6"
              aria-label="Dashboard sections"
            >
              {visibleNavEntries === null ? (
                <p className="px-3 text-sm text-muted-foreground">Loading…</p>
              ) : (
                visibleNavEntries.map((entry) => {
                  if (entry.type === "heading") {
                    return (
                      <div
                        key={`heading-${entry.label}`}
                        className="mt-4 border-t border-border px-3 pt-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {entry.label}
                        </p>
                      </div>
                    );
                  }
                  const active = navLinkActive(entry.href);
                  const linkHref =
                    entry.type === "link" &&
                    (isExecutiveViewer || isMonitoringOfficer) &&
                    monitoringExamScopedHref(entry.href)
                      ? executiveMonitoringHref(entry.href, executiveExamIdFromUrl)
                      : entry.href;
                  return (
                    <Link
                      key={entry.href}
                      href={linkHref}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-card-foreground hover:bg-muted",
                        inputFocusRing,
                      )}
                    >
                      {entry.label}
                    </Link>
                  );
                })
              )}
              {isSuperAdmin ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Finance
                  </p>
                  <FinanceNavSection
                    pathname={pathname}
                    onNavigate={() => setSidebarOpen(false)}
                    prependItems={[BANK_DIRECTORY_NAV_ITEM]}
                  />
                </div>
              ) : null}
            </nav>
          )}
          <div className="hidden shrink-0 border-t border-border p-3 lg:block">
            <SidebarThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden lg:pl-64">
        <div className="shrink-0">
        <DashboardStickyHeader
          title={
            financeTitle ??
            (isFinanceOfficer
              ? "Finance"
              : isTopLevelOfficer
                ? isExecutiveViewer
                  ? executiveStickyTitle!
                  : testAdminStickyTitle!
                : "Staff dashboard")
          }
          subtitle={
            me
              ? isExecutiveViewer
                ? executiveUserDisplayName(me)
                : `${me.full_name}${me.email ? ` · ${me.email}` : ""}`
              : null
          }
          accent={showFinanceNavAccent ? "official-accounts" : undefined}
          onLogout={logout}
          executiveMobileOnly={isExecutiveViewer}
          sidebar={
            isExecutiveViewer
              ? undefined
              : {
                  id: sidebarNavId,
                  open: sidebarOpen,
                  onOpenChange: setSidebarOpen,
                }
          }
        />
        </div>

        <main
          className={cn(
            "mx-auto w-full min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6",
            pathname === ATTENDANCE_SHEETS_HREF || pathname.startsWith(`${ATTENDANCE_SHEETS_HREF}/`)
              || onOfficialStatisticsPage
              || onCentreSummaryPage
              || onFinanceCentreSummaryPage
              || isScriptControlEdit
              || pathname.startsWith("/dashboard/admin/script-control")
              ? "max-w-[1600px]"
              : "max-w-6xl",
            isExecutiveViewer && "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6",
            isScriptControlEdit && "pb-10 [--staff-sticky-header-offset:0px]",
          )}
        >
          {children}
        </main>

        {isExecutiveViewer ? (
          <Suspense fallback={null}>
            <ExecutiveBottomTabNav />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
