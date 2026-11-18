"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = [
  {
    href: "/login",
    title: "School registration",
    description: "School administrators register candidates for examinations.",
  },
  {
    href: "/login/private",
    title: "Private candidate",
    description: "Register as a private candidate and manage your application.",
  },
  {
    href: "/timetable",
    title: "Timetable",
    description: "View examination schedules when published.",
    hint: "Coming soon",
  },
] as const;

const DELAYS = [
  "landing-enter-delay-2",
  "landing-enter-delay-3",
  "landing-enter-delay-4",
] as const;

export default function ExaminationsPage() {
  return (
    <div className="public-ambient flex min-h-svh flex-col">
      <Navbar />

      <main className="flex flex-1 flex-col justify-center px-4 py-14 sm:px-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <header className="mb-12">
            <p className="landing-enter text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              CTVET
            </p>
            <h1 className="landing-enter landing-enter-delay-1 mt-3 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Examinations
            </h1>
            <div
              className="landing-enter landing-enter-delay-1 mt-5 h-px w-9 bg-primary"
              aria-hidden
            />
            <p className="landing-enter landing-enter-delay-2 mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Choose how you register, or open the timetable when it is
              available.
            </p>
          </header>

          <ul className="border-y border-border/80">
            {ACTIONS.map((action, index) => (
              <li
                key={action.href}
                className={cn(
                  "landing-enter border-b border-border/80 last:border-b-0",
                  DELAYS[index]
                )}
              >
                <Link
                  href={action.href}
                  className="public-action-row group flex items-start justify-between gap-6 py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex min-w-0 gap-5 sm:gap-6">
                    <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground/70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-lg font-medium tracking-tight text-foreground transition-colors group-hover:text-primary">
                          {action.title}
                        </span>
                        {"hint" in action && action.hint ? (
                          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                            {action.hint}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <PublicFooter className="landing-enter landing-enter-delay-5" />
    </div>
  );
}
