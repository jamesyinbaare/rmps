"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clearAuth, getMe, type UserMe } from "@/lib/auth";

type Props = {
  title: string;
  children?: React.ReactNode;
};

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export function DashboardShell({ title, children }: Props) {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);

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
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Exam tools
            </p>
            <h1 className="text-lg font-semibold text-card-foreground sm:text-xl">
              {title}
            </h1>
            {me ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {me.full_name}
                {me.school_code ? ` · ${me.school_code}` : ""}
              </p>
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
