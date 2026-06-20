"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { DashboardSimpleHeader, DashboardStickyHeader } from "@/components/dashboard-sticky-header";
import { ExaminationNoticeSessionBanner } from "@/components/examination-notice-session-banner";
import { StaffSidebarMainNav } from "@/components/staff-sidebar-nav";
import {
  FinanceSidebarProvider,
  useFinanceSidebarCollapsed,
} from "@/components/finance-sidebar-context";
import { PortalSidebar, PortalSidebarHeader } from "@/components/portal-sidebar";
import { useInspectorPostings } from "@/hooks/use-inspector-postings";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import {
  AUTH_TOKEN_UPDATED_EVENT,
  SUBJECT_OFFICER_SELECT_WORKSPACE_HREF,
  clearAuth,
  getMe,
  type UserMe,
} from "@/lib/auth";
import { countSubjectOfficerAssignments } from "@/lib/subject-officer-exams";
import { buildStaffSidebarNav } from "@/lib/staff-nav";
import {
  SUBJECT_OFFICER_NAV_SECTIONS,
  SUBJECT_OFFICER_OVERVIEW_ITEM,
  subjectOfficerNavActive,
} from "@/lib/subject-officer-nav";
import { cn } from "@/lib/utils";
import { SO_MOBILE_MAIN_CLASS } from "@/components/examiners/constants";
import {
  AllowancesSubNavLink,
  CentreLocationNavLink,
  OfficialAccountsNavLink,
  OfficialAccountsNavSection,
} from "@/components/official-accounts-nav-link";
import { SidebarThemeToggle } from "@/components/sidebar-theme-toggle";
import { OFFICIAL_ACCOUNTS_INSPECTOR_ATTENDANCE_HREF } from "@/lib/official-accounts-zone";

/** Subtitle under the page title: full name plus school name and code when present. */
function staffHeaderSubtitle(me: UserMe): string {
  if (me.role === "SUBJECT_OFFICER") {
    const phone = me.phone_number?.trim() ?? "";
    return phone ? `${me.full_name.trim()} · ${phone}` : me.full_name.trim();
  }
  if (me.role === "DEPOT_KEEPER") {
    const dep =
      me.depot_name != null && me.depot_name.trim() !== ""
        ? me.depot_code
          ? `${me.depot_name.trim()} · ${me.depot_code}`
          : me.depot_name.trim()
        : (me.depot_code ?? "");
    const userSeg = me.username?.trim() ?? "";
    const parts = [me.full_name.trim()];
    if (userSeg) parts.push(userSeg);
    if (dep) parts.push(dep);
    return parts.filter((p) => p !== "").join(" · ");
  }
  const workspace = me.inspector_workspace_label?.trim();
  if (me.role === "INSPECTOR" && workspace) {
    return `${me.full_name.trim()} · ${workspace}`;
  }
  const schoolSegment =
    me.school_name != null && me.school_name.trim() !== ""
      ? me.school_code
        ? `${me.school_name.trim()} · ${me.school_code}`
        : me.school_name.trim()
      : (me.school_code ?? "");

  // Supervisors often have full_name set to the school code at provisioning; avoid "code · name · code".
  const full = me.full_name.trim();
  const code = me.school_code?.trim() ?? "";
  const nameIsOnlySchoolCode = code !== "" && full === code;

  if (nameIsOnlySchoolCode) {
    return schoolSegment || full;
  }
  return schoolSegment ? `${me.full_name} · ${schoolSegment}` : me.full_name;
}

function subjectOfficerHeaderSubtitle(
  me: UserMe,
  workspaceSwitchHref: string | null,
): ReactNode {
  const workspace = me.subject_officer_workspace_label?.trim();
  const fullName = me.full_name.trim();
  const phone = me.phone_number?.trim();
  const identity = phone ? `${fullName} · ${phone}` : fullName;
  if (!workspace) return identity;
  if (!workspaceSwitchHref) return `${identity} · ${workspace}`;
  return (
    <>
      {identity} ·{" "}
      <Link
        href={workspaceSwitchHref}
        className={cn(
          "rounded-sm underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground lg:no-underline",
          inputFocusRing,
        )}
      >
        {workspace}
      </Link>
    </>
  );
}

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const INSPECTOR_SELECT_WORKSPACE_HREF = "/dashboard/inspector/select-workspace?switch=1";

function inspectorHeaderSubtitle(me: UserMe, workspaceSwitchHref: string | null): ReactNode {
  const workspace = me.inspector_workspace_label?.trim();
  const fullName = me.full_name.trim();
  if (!workspace) return staffHeaderSubtitle(me);
  if (!workspaceSwitchHref) return `${fullName} · ${workspace}`;
  return (
    <>
      {fullName} ·{" "}
      <Link
        href={workspaceSwitchHref}
        className={cn(
          "rounded-sm underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground lg:no-underline",
          inputFocusRing,
        )}
      >
        {workspace}
      </Link>
    </>
  );
}

type Props = {
  title: string;
  children?: React.ReactNode;
  /** When set, shows Overview + Examination timetable sub-nav for staff dashboards */
  staffRole?: "supervisor" | "inspector" | "depot-keeper" | "subject-officer";
  /** Optional override for the main content area (e.g. full-bleed mobile layouts). */
  mainClassName?: string;
};

export function DashboardShell({ title, children, staffRole, mainClassName }: Props) {
  if (staffRole === "subject-officer") {
    return (
      <FinanceSidebarProvider>
        <DashboardShellInner title={title} staffRole={staffRole} mainClassName={mainClassName}>
          {children}
        </DashboardShellInner>
      </FinanceSidebarProvider>
    );
  }

  return (
    <DashboardShellInner title={title} staffRole={staffRole} mainClassName={mainClassName}>
      {children}
    </DashboardShellInner>
  );
}

function DashboardShellInner({ title, children, staffRole, mainClassName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebarNavId = useId();
  const [me, setMe] = useState<UserMe | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isInspector = staffRole === "inspector";
  const isSubjectOfficerRole = staffRole === "subject-officer";
  const { count: inspectorPostingCount } = useInspectorPostings(isInspector);
  const { assignments: subjectOfficerAssignments, loading: subjectOfficerAssignmentsLoading } =
    useSubjectOfficerAssignments();
  const subjectOfficerAssignmentCount = countSubjectOfficerAssignments(subjectOfficerAssignments);
  const onSelectWorkspacePage = pathname.startsWith("/dashboard/inspector/select-workspace");
  const onSubjectOfficerSelectWorkspacePage = pathname.startsWith(
    "/dashboard/subject-officer/select-workspace",
  );
  const showInspectorChangeCentre =
    isInspector && inspectorPostingCount > 1 && !onSelectWorkspacePage;
  const inspectorWorkspaceSwitchHref = showInspectorChangeCentre
    ? INSPECTOR_SELECT_WORKSPACE_HREF
    : null;
  const showSubjectOfficerSwitchWorkspace =
    isSubjectOfficerRole &&
    !subjectOfficerAssignmentsLoading &&
    subjectOfficerAssignmentCount > 1 &&
    !onSubjectOfficerSelectWorkspacePage;
  const subjectOfficerWorkspaceSwitchHref = showSubjectOfficerSwitchWorkspace
    ? SUBJECT_OFFICER_SELECT_WORKSPACE_HREF
    : null;

  useEffect(() => {
    function refreshMe() {
      getMe()
        .then(setMe)
        .catch(() => setMe(null));
    }
    refreshMe();
    if (typeof window !== "undefined") {
      window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, refreshMe);
      return () => window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, refreshMe);
    }
    return undefined;
  }, []);

  function logout() {
    clearAuth();
    router.replace("/");
  }

  if (!staffRole) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardSimpleHeader
          title={title}
          subtitle={me ? staffHeaderSubtitle(me) : null}
          onLogout={logout}
        />
        <main className="mx-auto max-w-3xl p-4 sm:p-6">{children}</main>
      </div>
    );
  }

  const staffBase =
    staffRole === "supervisor"
      ? "/dashboard/supervisor"
      : staffRole === "depot-keeper"
        ? "/dashboard/depot-keeper"
        : staffRole === "subject-officer"
          ? "/dashboard/subject-officer"
          : "/dashboard/inspector";
  const roleLabel =
    staffRole === "supervisor"
      ? "Supervisor"
      : staffRole === "depot-keeper"
        ? "Depot keeper"
        : staffRole === "subject-officer"
          ? "Subject officer"
          : "Inspector";
  const examOfficialsHref = `${staffBase}/exam-officials`;
  const centreLocationHref = `${staffBase}/centre-location`;
  const examinationNoticeHref = `${staffBase}/examination-notice`;

  const changeCentreNavItem = showInspectorChangeCentre
    ? {
        href: INSPECTOR_SELECT_WORKSPACE_HREF,
        label: "Change centre",
        active: onSelectWorkspacePage,
        icon: true as const,
      }
    : null;

  const { prependItems, sections } = buildStaffSidebarNav({
    staffRole,
    pathname,
    staffBase,
    changeCentreNavItem,
  });

  const isSubjectOfficer = staffRole === "subject-officer";
  const financeSidebarCollapsed = useFinanceSidebarCollapsed();
  const subjectOfficerSidebarCollapsed = isSubjectOfficer && financeSidebarCollapsed;

  const showInspectorBottomNav = staffRole === "inspector";
  const examOfficialsActive = pathname.startsWith(examOfficialsHref);
  const attendanceSheetsActive = pathname.startsWith(OFFICIAL_ACCOUNTS_INSPECTOR_ATTENDANCE_HREF);
  const centreLocationActive = pathname.startsWith(centreLocationHref);
  return (
    <div
      className="min-h-screen bg-background [--staff-sticky-header-offset:4.5rem] [scroll-padding-top:var(--staff-sticky-header-offset)]"
    >
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
          subjectOfficerSidebarCollapsed ? "w-64 lg:w-[3.25rem]" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          {isSubjectOfficer ? (
            <PortalSidebarHeader title="Subject officer" collapsedIcon={PenLine} />
          ) : (
            <div className="border-b border-border p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Exam tools
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-card-foreground">{roleLabel}</p>
            </div>
          )}
          {isSubjectOfficer ? (
            <PortalSidebar
              pathname={pathname}
              onNavigate={() => setSidebarOpen(false)}
              ariaLabel="Marking"
              overviewItem={SUBJECT_OFFICER_OVERVIEW_ITEM}
              sections={SUBJECT_OFFICER_NAV_SECTIONS}
              showOverview
              navActive={subjectOfficerNavActive}
            />
          ) : (
            <>
          <nav
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 pb-5"
            aria-label="Dashboard sections"
          >
            <div className="flex flex-col lg:min-h-full lg:flex-1">
              <StaffSidebarMainNav
                prependItems={prependItems}
                sections={sections}
                onNavigate={() => setSidebarOpen(false)}
              />
              {showInspectorBottomNav ? (
              <div className="flex flex-col gap-0 lg:mt-auto">
                <OfficialAccountsNavSection title="Allowances">
                  <OfficialAccountsNavLink
                    href={examOfficialsHref}
                    active={examOfficialsActive}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                  <AllowancesSubNavLink
                    href={OFFICIAL_ACCOUNTS_INSPECTOR_ATTENDANCE_HREF}
                    active={attendanceSheetsActive}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                </OfficialAccountsNavSection>
                <OfficialAccountsNavSection title="Route planning">
                  <CentreLocationNavLink
                    href={centreLocationHref}
                    active={centreLocationActive}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                </OfficialAccountsNavSection>
              </div>
              ) : null}
            </div>
          </nav>
          <div className="hidden shrink-0 border-t border-border p-3 lg:block">
            <SidebarThemeToggle />
          </div>
            </>
          )}
        </div>
      </aside>

      <div
        className={cn(
          subjectOfficerSidebarCollapsed ? "lg:pl-[3.25rem]" : "lg:pl-64",
          isSubjectOfficer && "flex h-dvh max-h-dvh flex-col overflow-hidden",
        )}
      >
        <div className={isSubjectOfficer ? "shrink-0" : undefined}>
        <DashboardStickyHeader
          title={title}
          subtitle={
            me
              ? isInspector
                ? inspectorHeaderSubtitle(me, inspectorWorkspaceSwitchHref)
                : isSubjectOfficerRole
                  ? subjectOfficerHeaderSubtitle(me, subjectOfficerWorkspaceSwitchHref)
                  : staffHeaderSubtitle(me)
              : null
          }
          onLogout={logout}
          showSidebarCollapse={isSubjectOfficer}
          sidebar={{
            id: sidebarNavId,
            open: sidebarOpen,
            onOpenChange: setSidebarOpen,
          }}
        />

        <ExaminationNoticeSessionBanner
          staffRole={staffRole}
          examinationNoticeHref={examinationNoticeHref}
        />
        </div>

        <main
          className={cn(
            "mx-auto w-full px-4 py-6 sm:px-6",
            isSubjectOfficer
              ? "scrollbar-hide flex min-h-0 max-w-[1600px] flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
              : "max-w-6xl",
            isSubjectOfficer && SO_MOBILE_MAIN_CLASS,
            mainClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
