import Link from "next/link";

import { PublicSiteNav } from "@/components/public-site-nav";

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export default function TimetablePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicSiteNav />

      <main className="flex-1">
        <section className="border-b border-border bg-linear-to-b from-primary/10 to-background py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Examination timetables
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Timetable downloads are available only after you sign in to your dashboard.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-xl px-4 sm:px-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <p className="text-sm text-muted-foreground">
                Choose your role to open the correct workspace. Administrators use{" "}
                <strong className="text-card-foreground">Examination timetable</strong> in the admin menu.
                Supervisors and inspectors use{" "}
                <strong className="text-card-foreground">Examination timetable</strong> in their dashboard.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                <li>
                  <Link
                    href="/login/admin"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Administrator sign-in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login/supervisor"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Supervisor sign-in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login/inspector"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Inspector sign-in
                  </Link>
                </li>
              </ul>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/" className={secondaryButtonClass}>
                  ← Back to home
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card py-6">
        <p className="px-4 text-center text-sm text-muted-foreground">
          Certificate examination resource management
        </p>
      </footer>
    </div>
  );
}
