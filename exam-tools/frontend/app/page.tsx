import Link from "next/link";

import { PublicSiteNav } from "@/components/public-site-nav";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicSiteNav />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8 sm:max-w-2xl sm:px-6 sm:py-12">
        <div className="mb-8 text-center sm:mb-12 sm:text-left">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Certificate examination resource management
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Exam tools
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Sign in with your role to open your workspace.
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-4 sm:gap-6">
          <Link
            href="/login/inspector"
            className="flex min-h-[52px] flex-col justify-center rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 sm:min-h-0 sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div>
              <span className="text-lg font-semibold text-card-foreground">
                Inspector
              </span>
              <p className="mt-1 text-sm text-muted-foreground">
                School code and phone number
              </p>
            </div>
            <span
              className="mt-3 text-sm font-medium text-primary sm:mt-0"
              aria-hidden
            >
              Sign in →
            </span>
          </Link>

          <Link
            href="/login/supervisor"
            className="flex min-h-[52px] flex-col justify-center rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 sm:min-h-0 sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div>
              <span className="text-lg font-semibold text-card-foreground">
                Supervisor
              </span>
              <p className="mt-1 text-sm text-muted-foreground">
                School code and password
              </p>
            </div>
            <span
              className="mt-3 text-sm font-medium text-primary sm:mt-0"
              aria-hidden
            >
              Sign in →
            </span>
          </Link>
        </div>
      </main>

      <footer className="border-t border-border bg-card py-6">
        <p className="px-4 text-center text-sm text-muted-foreground">
          <Link
            href="/login/admin"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            System administrator
          </Link>
        </p>
      </footer>
    </div>
  );
}
