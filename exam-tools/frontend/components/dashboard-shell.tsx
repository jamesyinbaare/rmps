"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { DashboardSimpleHeader, DashboardStickyHeader } from "@/components/dashboard-sticky-header";
import { ExaminationNoticeSessionBanner } from "@/components/examination-notice-session-banner";
import { clearAuth, getMe, type UserMe } from "@/lib/auth";

/** Subtitle under the page title: full name plus school name and code when present. */
function staffHeaderSubtitle(me: UserMe): string {
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

type Props = {
  title: string;
  children?: React.ReactNode;
  /** When set, shows Overview + Examination timetable sub-nav for staff dashboards */
  staffRole?: "supervisor" | "inspector" | "depot-keeper";
};

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export function DashboardShell({ title, children, staffRole }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebarNavId = useId();
  const [me, setMe] = useState<UserMe | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
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
        : "/dashboard/inspector";
  const timetableHref = `${staffBase}/timetable`;
  const documentsHref = `${staffBase}/documents`;
  const roleLabel =
    staffRole === "supervisor"
      ? "Supervisor"
      : staffRole === "depot-keeper"
        ? "Depot keeper"
        : "Inspector";

  const scriptsHref = `${staffBase}/scripts-control`;
  const irregularScriptsHref = `${staffBase}/irregular-scripts-control`;
  const questionPaperHref = `${staffBase}/question-paper-control`;
  const examinationNoticeHref = `${staffBase}/examination-notice`;

  const staffNav = [
    { href: staffBase, label: "Overview", active: pathname === staffBase },
    {
      href: timetableHref,
      label: "Examination timetable",
      active: pathname.startsWith(timetableHref),
    },
    ...(staffRole === "inspector" || staffRole === "depot-keeper"
      ? [
          {
            href: scriptsHref,
            label: "Worked Scripts Control",
            active: pathname.startsWith(scriptsHref),
          },
          {
            href: irregularScriptsHref,
            label: "Irregular Scripts Control",
            active: pathname.startsWith(irregularScriptsHref),
          },
          {
            href: questionPaperHref,
            label: "Question paper control",
            active: pathname.startsWith(questionPaperHref),
          },
        ]
      : []),
    ...(staffRole === "supervisor" || staffRole === "inspector" || staffRole === "depot-keeper"
      ? [
          {
            href: examinationNoticeHref,
            label: "Examination notice",
            active: pathname.startsWith(examinationNoticeHref),
          },
        ]
      : []),
    {
      href: documentsHref,
      label: "Documents",
      active: pathname.startsWith(documentsHref),
    },
  ];

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
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-out motion-reduce:transition-none lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Exam tools
            </p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">{roleLabel}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Dashboard sections">
            {staffNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  item.active
                    ? "bg-primary text-primary-foreground"
                    : "text-card-foreground hover:bg-muted"
                } ${inputFocusRing}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <div className="lg:pl-64">
        <DashboardStickyHeader
          title={title}
          subtitle={me ? staffHeaderSubtitle(me) : null}
          onLogout={logout}
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

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
