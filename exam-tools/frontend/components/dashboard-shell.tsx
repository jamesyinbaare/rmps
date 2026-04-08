"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Exam tools
              </p>
              <h1 className="text-lg font-semibold text-card-foreground sm:text-xl">{title}</h1>
              {me ? (
                <p className="mt-1 text-sm text-muted-foreground">{staffHeaderSubtitle(me)}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link
                href="/"
                className={`inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted ${inputFocusRing}`}
              >
                Home
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Log out
              </button>
            </div>
          </div>
        </header>
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
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-out lg:translate-x-0 ${
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
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input-border bg-background lg:hidden ${inputFocusRing}`}
              aria-expanded={sidebarOpen}
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="text-lg leading-none">☰</span>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-card-foreground sm:text-lg">
                {title}
              </h1>
              {me ? (
                <p className="truncate text-sm text-muted-foreground">{staffHeaderSubtitle(me)}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href="/"
                className={`inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:px-4 ${inputFocusRing}`}
              >
                Home
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover sm:px-4"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
