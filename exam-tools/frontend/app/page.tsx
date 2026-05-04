import Link from "next/link";

import { PublicSiteNav } from "@/components/public-site-nav";

const roleCards = [
  {
    href: "/login/inspector",
    title: "Inspector",
    summary: "Monitoring and reporting tools.",
    capabilities: "Scripts, oversight, reports",
  },
  {
    href: "/login/depot-keeper",
    title: "Depot Keeper",
    summary: "Confirm script and question paper records.",
    capabilities: "Depot checks, verification",
  },
  {
    href: "/login/supervisor",
    title: "Supervisor",
    summary: "Coordinate centre and school operations.",
    capabilities: "Centre access, coordination",
  },
] as const;

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_12%,transparent)_0%,transparent_62%)] sm:h-[420px]"
      />
      <PublicSiteNav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-10">
        <section className="rounded-3xl border border-border/70 bg-card/75 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div>
            <p className="inline-flex items-center rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Official CTVET Access
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              CTVET Exam Operations Portal
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Secure role-based access for inspectors, depot keepers, and supervisors.
            </p>
            <p className="mt-3 text-sm font-medium text-foreground">Choose your role to sign in.</p>
          </div>
        </section>

        <section className="mt-5 grid gap-3.5 sm:mt-8 sm:gap-5 lg:grid-cols-3">
          {roleCards.map((role) => (
            <Link
              key={role.href}
              href={role.href}
              className="group relative flex min-h-[152px] flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:min-h-[164px] sm:p-6"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_8%,transparent)_0%,transparent_100%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <div>
                <p className="text-lg font-semibold text-card-foreground">{role.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{role.summary}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/90">
                  {role.capabilities}
                </p>
              </div>
              <span className="mt-4 text-sm font-medium text-primary">Sign in</span>
            </Link>
          ))}
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
        <p className="mt-2 px-4 text-center text-xs text-muted-foreground">
          Need help signing in? Contact your examination coordinator.
        </p>
      </footer>
    </div>
  );
}
