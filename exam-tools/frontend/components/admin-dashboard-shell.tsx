"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Settings2 } from "lucide-react";
import { Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";

import { DashboardStickyHeader } from "@/components/dashboard-sticky-header";
import { ExecutiveBottomTabNav } from "@/components/executive-bottom-tab-nav";
import {
  FinanceSidebar,
  FinanceSidebarHeader,
} from "@/components/finance-sidebar";
import {
  FinanceSidebarProvider,
  useFinanceSidebarCollapsed,
} from "@/components/finance-sidebar-context";
import { PortalSidebar, PortalSidebarHeader } from "@/components/portal-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  EXECUTIVE_CENTRES_HREF,
  EXECUTIVE_MONITORING_HREF,
  isMonitoringPath,
  TEST_ADMIN_INSPECTORS_HREF,
  executiveMonitoringHref,
  executiveUserDisplayName,
  monitoringExamScopedHref,
} from "@/lib/executive-selected-examination";
import { clearAuth, getMe, type UserMe } from "@/lib/auth";
import { adminNavActive, getAdminNavForRole } from "@/lib/admin-nav";
import { isOfficialAccountsPath, OFFICIAL_ACCOUNTS_ADMIN_HREF } from "@/lib/official-accounts-zone";
import {
  ATTENDANCE_SHEETS_HREF,
  BANK_DIRECTORY_HREF,
  CENTRE_SUMMARY_HREF,
  EXAMINER_ACCOUNTS_BY_SUBJECT_HREF,
  EXAMINER_ATTENDANCE_HREF,
  EXAMINER_MARKING_ATTENDANCE_SHEETS_HREF,
  EXAMINER_PAYOUTS_HREF,
  FINANCE_CENTRE_SUMMARY_HREF,
  financePageStickyTitle,
  INSPECTOR_ANALYSIS_HREF,
  INSPECTOR_PAY_VARIANCE_HREF,
  OFFICIAL_STATISTICS_HREF,
} from "@/lib/finance-nav";
import { cn } from "@/lib/utils";
import { isAdminWorkforceRosterOrAssignmentPage } from "@/lib/workforce-nav";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const EXECUTIVE_VIEWER_NAV = [
  { href: EXECUTIVE_MONITORING_HREF, label: "Home" },
  { href: EXECUTIVE_CENTRES_HREF, label: "Centres" },
] as const;

type Props = {
  children: React.ReactNode;
};

export function AdminDashboardShell({ children }: Props) {
  return (
    <FinanceSidebarProvider>
      <AdminDashboardShellInner>{children}</AdminDashboardShellInner>
    </FinanceSidebarProvider>
  );
}

function AdminDashboardShellInner({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const executiveExamIdFromUrl = searchParams.get("exam_id");
  const sidebarNavId = useId();
  const [me, setMe] = useState<UserMe | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const financeSidebarCollapsed = useFinanceSidebarCollapsed();

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  const isMonitoringOfficer = me?.role === "TEST_ADMIN_OFFICER";
  const isExecutiveViewer = me?.role === "EXECUTIVE_VIEWER";
  const isTopLevelOfficer = isMonitoringOfficer || isExecutiveViewer;
  const isFinanceOfficer = me?.role === "FINANCE_OFFICER";
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const usesPortalSidebar = isFinanceOfficer || isSuperAdmin || isMonitoringOfficer;
  const adminNavConfig = useMemo(
    () => (me && (isSuperAdmin || isMonitoringOfficer) ? getAdminNavForRole(me.role) : null),
    [me, isSuperAdmin, isMonitoringOfficer],
  );

  const resolveExamScopedHref = useCallback(
    (href: string) =>
      monitoringExamScopedHref(href)
        ? executiveMonitoringHref(href, executiveExamIdFromUrl)
        : href,
    [executiveExamIdFromUrl],
  );

  const onExecutiveCentresPage = pathname === EXECUTIVE_CENTRES_HREF;
  const onTestAdminInspectorsPage = pathname === TEST_ADMIN_INSPECTORS_HREF;
  const onCentreSummaryPage =
    pathname === CENTRE_SUMMARY_HREF || pathname.startsWith(`${CENTRE_SUMMARY_HREF}/`);
  const onFinanceCentreSummaryPage =
    pathname === FINANCE_CENTRE_SUMMARY_HREF || pathname.startsWith(`${FINANCE_CENTRE_SUMMARY_HREF}/`);
  const onExamOfficialsPage =
    pathname === OFFICIAL_ACCOUNTS_ADMIN_HREF || pathname.startsWith(`${OFFICIAL_ACCOUNTS_ADMIN_HREF}/`);
  const onOfficialStatisticsPage =
    pathname === OFFICIAL_STATISTICS_HREF || pathname.startsWith(`${OFFICIAL_STATISTICS_HREF}/`);
  const onInspectorAnalysisPage =
    pathname === INSPECTOR_ANALYSIS_HREF || pathname.startsWith(`${INSPECTOR_ANALYSIS_HREF}/`);
  const onInspectorPayVariancePage =
    pathname === INSPECTOR_PAY_VARIANCE_HREF || pathname.startsWith(`${INSPECTOR_PAY_VARIANCE_HREF}/`);
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

  function executiveNavLinkActive(href: string): boolean {
    if (href === EXECUTIVE_MONITORING_HREF) return pathname === href;
    if (isExecutiveViewer && href === EXECUTIVE_CENTRES_HREF) {
      return pathname === EXECUTIVE_CENTRES_HREF;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const isScriptControlEdit = pathname.startsWith("/dashboard/admin/script-control/edit");
  const onExaminersPage = pathname.startsWith("/dashboard/admin/examiners");
  const onScriptsAllocationPage = pathname.startsWith("/dashboard/admin/scripts-allocation");
  const onMarkingFinancePage =
    pathname === EXAMINER_ATTENDANCE_HREF
    || pathname.startsWith(`${EXAMINER_ATTENDANCE_HREF}/`)
    || pathname === EXAMINER_MARKING_ATTENDANCE_SHEETS_HREF
    || pathname.startsWith(`${EXAMINER_MARKING_ATTENDANCE_SHEETS_HREF}/`)
    || pathname === EXAMINER_PAYOUTS_HREF
    || pathname.startsWith(`${EXAMINER_PAYOUTS_HREF}/`)
    || pathname === EXAMINER_ACCOUNTS_BY_SUBJECT_HREF
    || pathname.startsWith(`${EXAMINER_ACCOUNTS_BY_SUBJECT_HREF}/`);
  const onMonitoringPage = isMonitoringPath(pathname);
  const onBankDirectoryPage =
    pathname === BANK_DIRECTORY_HREF || pathname.startsWith(`${BANK_DIRECTORY_HREF}/`);
  const onWorkforcePage = isAdminWorkforceRosterOrAssignmentPage(pathname);
  const onPageScrollShell =
    onExaminersPage
    || onScriptsAllocationPage
    || onMonitoringPage
    || onExamOfficialsPage
    || onCentreSummaryPage
    || onOfficialStatisticsPage
    || onFinanceCentreSummaryPage
    || onInspectorAnalysisPage
    || onInspectorPayVariancePage
    || onBankDirectoryPage
    || onWorkforcePage;

  const sidebarCollapsed = usesPortalSidebar && financeSidebarCollapsed;

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
          "fixed inset-y-0 left-0 z-50 border-r border-border bg-card transition-[width,transform] duration-200 ease-out motion-reduce:transition-none lg:translate-x-0",
          sidebarCollapsed ? "w-64 lg:w-[3.25rem]" : "w-64",
          isExecutiveViewer && "hidden lg:block",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          {usesPortalSidebar ? (
            isFinanceOfficer ? (
              <FinanceSidebarHeader isFinanceOfficer />
            ) : isSuperAdmin ? (
              <PortalSidebarHeader title="Administration" collapsedIcon={Settings2} />
            ) : (
              <PortalSidebarHeader title="Monitoring" collapsedIcon={BarChart3} />
            )
          ) : (
            <div className="border-b border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Exam tools
              </p>
              <p className="mt-1 text-sm font-semibold text-card-foreground">
                {me ? executiveUserDisplayName(me) : "Executive overview"}
              </p>
            </div>
          )}

          {isFinanceOfficer ? (
            me ? (
              <FinanceSidebar pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
            )
          ) : usesPortalSidebar ? (
            adminNavConfig && me ? (
              <PortalSidebar
                pathname={pathname}
                onNavigate={() => setSidebarOpen(false)}
                ariaLabel={isSuperAdmin ? "Administration" : "Monitoring"}
                overviewItem={adminNavConfig.overviewItem}
                prependItems={adminNavConfig.prependItems}
                sections={adminNavConfig.sections}
                showOverview={adminNavConfig.showOverview}
                navActive={adminNavActive}
                resolveHref={isMonitoringOfficer ? resolveExamScopedHref : undefined}
              />
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
            )
          ) : (
            <nav
              className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 pb-6"
              aria-label="Dashboard sections"
            >
              {me ? (
                <TooltipProvider>
                  {EXECUTIVE_VIEWER_NAV.map((entry) => {
                    const active = executiveNavLinkActive(entry.href);
                    const linkHref = monitoringExamScopedHref(entry.href)
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
                  })}
                </TooltipProvider>
              ) : (
                <p className="px-3 text-sm text-muted-foreground">Loading…</p>
              )}
            </nav>
          )}
        </div>
      </aside>

      <div
        className={cn(
          "flex h-dvh max-h-dvh flex-col overflow-hidden transition-[padding] duration-200 ease-out motion-reduce:transition-none",
          sidebarCollapsed ? "lg:pl-[3.25rem]" : "lg:pl-64",
        )}
      >
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
          showSidebarCollapse={usesPortalSidebar}
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
            "mx-auto w-full min-h-0 min-w-0 flex-1 overscroll-y-contain px-4 py-6 sm:px-6",
            onPageScrollShell
              ? "scrollbar-hide overflow-x-hidden overflow-y-auto"
              : onMarkingFinancePage
                ? "overflow-x-hidden overflow-hidden"
                : "overflow-x-auto overflow-y-auto",
            pathname === ATTENDANCE_SHEETS_HREF || pathname.startsWith(`${ATTENDANCE_SHEETS_HREF}/`)
              || onOfficialStatisticsPage
              || onInspectorAnalysisPage
              || onInspectorPayVariancePage
              || onCentreSummaryPage
              || onFinanceCentreSummaryPage
              || onExamOfficialsPage
              || onMonitoringPage
              || isScriptControlEdit
              || pathname.startsWith("/dashboard/admin/script-control")
              || onExaminersPage
              || onScriptsAllocationPage
              || onMarkingFinancePage
              || onBankDirectoryPage
              || onWorkforcePage
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
