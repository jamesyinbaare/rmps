import Link from "next/link";

import { PublicSiteNav } from "@/components/public-site-nav";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_16%,transparent)_0%,transparent_62%)]"
      />
      <PublicSiteNav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        <section className="rounded-3xl border border-border/70 bg-card/75 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div>
            <p className="inline-flex items-center rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Official CTVET Access
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Certificate II Examinations Operations Portal
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Coordinate centre-level examination activities through one secure
              platform built for smooth delivery, oversight, and reporting.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:mt-8 sm:gap-5 lg:grid-cols-2">
          <Link
            href="/login/inspector"
            className="group relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg sm:p-6"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,transparent)_0%,transparent_100%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
            <div>
              <p className="text-lg font-semibold text-card-foreground">Inspector</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Access all centre resources with additional examination
                monitoring and reporting tools.
              </p>
            </div>
            <span
              className="mt-4 text-sm font-medium text-primary transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            >
              Continue to sign in →
            </span>
          </Link>

          <Link
            href="/login/supervisor"
            className="group relative flex min-h-[148px] flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg sm:p-6"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,transparent)_0%,transparent_100%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
            <div>
              <p className="text-lg font-semibold text-card-foreground">
                Supervisor
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Access centre and school resources for the examination using
                your assigned credentials.
              </p>
            </div>
            <span
              className="mt-4 text-sm font-medium text-primary transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            >
              Continue to sign in →
            </span>
          </Link>
        </section>
      </main>

      <footer className="border-t border-border/80 bg-card/70 py-6 backdrop-blur-sm">
        <p className="px-4 text-center text-sm text-muted-foreground">
          <Link
            href="/login/admin"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            System administrator access
          </Link>
        </p>
      </footer>
    </div>
  );
}
