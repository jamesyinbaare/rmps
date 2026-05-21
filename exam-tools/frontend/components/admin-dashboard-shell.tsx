"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useState } from "react";

import { DashboardStickyHeader } from "@/components/dashboard-sticky-header";
import { ExecutiveBottomTabNav } from "@/components/executive-bottom-tab-nav";
import {
  EXECUTIVE_CENTRES_HREF,
  EXECUTIVE_MONITORING_HREF,
  executiveMonitoringHref,
  executiveUserDisplayName,
} from "@/lib/executive-selected-examination";
import { clearAuth, getMe, type UserMe } from "@/lib/auth";
import { OfficialAccountsNavLink } from "@/components/official-accounts-nav-link";
import {
  isOfficialAccountsHref,
  isOfficialAccountsPath,
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const BANK_DIRECTORY_HREF = "/dashboard/admin/bank-directory";
const EXTERNAL_INSPECTORS_HREF = "/dashboard/admin/external-inspectors";
const FINANCE_CENTRE_SUMMARY_HREF = "/dashboard/admin/finance-centre-summary";
const CENTRE_SUMMARY_HREF = "/dashboard/admin/centre-summary";

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

const EXECUTIVE_VIEWER_NAV: NavLinkItem[] = [
  { type: "link", href: EXECUTIVE_MONITORING_HREF, label: "Home" },
  { type: "link", href: EXECUTIVE_CENTRES_HREF, label: "Centres" },
];

type NavLinkItem = { type: "link"; href: string; label: string };
type NavHeadingItem = { type: "heading"; label: string };
type NavEntry = NavLinkItem | NavHeadingItem;

const ATTENDANCE_SHEETS_HREF = "/dashboard/admin/attendance-sheets";

const FINANCE_OFFICER_NAV: NavEntry[] = [
  { type: "heading", label: "Finance" },
  { type: "link", href: OFFICIAL_ACCOUNTS_ADMIN_HREF, label: "Official account details" },
  { type: "link", href: EXTERNAL_INSPECTORS_HREF, label: "External inspectors" },
  { type: "link", href: FINANCE_CENTRE_SUMMARY_HREF, label: "Centre invigilator summary" },
  { type: "link", href: CENTRE_SUMMARY_HREF, label: "Centre summary" },
  { type: "link", href: ATTENDANCE_SHEETS_HREF, label: "Attendance sheets" },
];

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
      return FINANCE_OFFICER_NAV;
    }
    if (me.role === "SUPER_ADMIN") {
      const bankItem = nav.find((n) => n.href === BANK_DIRECTORY_HREF);
      const withoutBank = nav.filter((n) => n.href !== BANK_DIRECTORY_HREF);
      if (!bankItem) return nav.map(toLinkItem);
      return [
        ...withoutBank.map(toLinkItem),
        { type: "heading", label: "Finance" },
        { type: "link", href: bankItem.href, label: bankItem.label },
        { type: "link", href: OFFICIAL_ACCOUNTS_ADMIN_HREF, label: "Official account details" },
        { type: "link", href: EXTERNAL_INSPECTORS_HREF, label: "External inspectors" },
        { type: "link", href: FINANCE_CENTRE_SUMMARY_HREF, label: "Centre invigilator summary" },
        { type: "link", href: CENTRE_SUMMARY_HREF, label: "Centre summary" },
        { type: "link", href: ATTENDANCE_SHEETS_HREF, label: "Attendance sheets" },
      ];
    }
    return nav.map(toLinkItem);
  }, [me]);

  const isMonitoringOfficer = me?.role === "TEST_ADMIN_OFFICER";
  const isExecutiveViewer = me?.role === "EXECUTIVE_VIEWER";
  const isTopLevelOfficer = isMonitoringOfficer || isExecutiveViewer;
  const isFinanceOfficer = me?.role === "FINANCE_OFFICER";
  const onExecutiveCentresPage = pathname === EXECUTIVE_CENTRES_HREF;
  const onCentreSummaryPage =
    pathname === CENTRE_SUMMARY_HREF || pathname.startsWith(`${CENTRE_SUMMARY_HREF}/`);
  const onOfficialAccountsPage = isOfficialAccountsPath(pathname) && !onCentreSummaryPage;

  function logout() {
    clearAuth();
    router.replace("/");
  }

  const executiveStickyTitle = isExecutiveViewer
    ? onExecutiveCentresPage
      ? "Centres"
      : "Home"
    : null;

  function navLinkActive(href: string): boolean {
    if (href === "/dashboard/admin") return pathname === href;
    if (isExecutiveViewer && href === EXECUTIVE_MONITORING_HREF) {
      return pathname === EXECUTIVE_MONITORING_HREF;
    }
    if (isExecutiveViewer && href === EXECUTIVE_CENTRES_HREF) {
      return pathname === EXECUTIVE_CENTRES_HREF;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
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
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-out motion-reduce:transition-none lg:translate-x-0",
          isExecutiveViewer && "hidden lg:block",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Exam tools
            </p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">
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
                if (isOfficialAccountsHref(entry.href)) {
                  return (
                    <OfficialAccountsNavLink
                      key={entry.href}
                      href={entry.href}
                      active={active}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  );
                }
                const linkHref =
                  isExecutiveViewer && entry.type === "link"
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
          </nav>
        </div>
      </aside>

      <div className="lg:pl-64">
        <DashboardStickyHeader
          title={
            onCentreSummaryPage
              ? "Centre summary"
              : onOfficialAccountsPage
                ? "Official account details"
                : isTopLevelOfficer
                  ? isExecutiveViewer
                    ? executiveStickyTitle!
                    : "Exam monitoring"
                  : isFinanceOfficer
                    ? "Finance"
                    : "Administrator dashboard"
          }
          subtitle={
            me
              ? isExecutiveViewer
                ? executiveUserDisplayName(me)
                : `${me.full_name}${me.email ? ` · ${me.email}` : ""}`
              : null
          }
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

        <main
          className={cn(
            "mx-auto px-4 py-6 sm:px-6",
            pathname === ATTENDANCE_SHEETS_HREF || pathname.startsWith(`${ATTENDANCE_SHEETS_HREF}/`)
              ? "max-w-[1600px]"
              : "max-w-6xl",
            isExecutiveViewer && "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6",
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
