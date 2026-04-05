"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  { href: "/dashboard/admin/inspectors", label: "Inspectors" },
  { href: "/dashboard/admin/timetable", label: "Examination timetable" },
  { href: "/dashboard/admin/documents", label: "Documents" },
];

type Props = {
  children: React.ReactNode;
};

export function AdminDashboardShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
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
            <p className="mt-1 text-sm font-semibold text-card-foreground">Administration</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {nav.map((item) => {
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
            })}
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
                Administrator dashboard
              </h1>
              {me ? (
                <p className="truncate text-sm text-muted-foreground">
                  {me.full_name}
                  {me.email ? ` · ${me.email}` : ""}
                </p>
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
