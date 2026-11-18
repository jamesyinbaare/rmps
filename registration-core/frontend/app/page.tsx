"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { SessionHeroImage } from "@/components/branding/SessionHeroImage";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="landing-hero relative flex min-h-svh flex-col overflow-hidden bg-background">
      <SessionHeroImage />

      {/* Stronger left scrim — copy calm, photo vivid on the open side */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/85 via-background/45 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/75 via-transparent to-background/25"
        aria-hidden
      />

      <Navbar variant="overlay" />

      <main className="relative z-10 flex flex-1 flex-col justify-center px-4 pb-10 pt-8 sm:px-6 md:px-8">
        <div className="landing-enter mx-auto w-full max-w-2xl rounded-xl bg-background/70 p-6 ring-1 ring-border/40 backdrop-blur-md sm:p-8">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <Image
                src="/logo-crest-only.png"
                alt=""
                width={52}
                height={52}
                className="h-12 w-12 object-contain sm:h-[52px] sm:w-[52px]"
                priority
              />
              <p className="text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
                CTVET
              </p>
            </div>
            <div className="mt-4 h-px w-9 bg-primary" aria-hidden />
          </div>

          <h1 className="landing-enter landing-enter-delay-1 max-w-[16ch] text-4xl font-semibold leading-[1.12] tracking-tight text-foreground md:text-5xl">
            Examination registration portal
          </h1>

          <p className="landing-enter landing-enter-delay-2 mt-5 max-w-xl text-base text-foreground/80 sm:text-lg">
            Register for examinations, manage school and private applications,
            and check results in one place.
          </p>

          <div className="landing-enter landing-enter-delay-3 mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Button asChild size="lg" className="group">
              <Link href="/examinations">
                Examinations
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-border/80 bg-background/40"
            >
              <Link href="/login/private">Private candidate</Link>
            </Button>
            <Link
              href="/results"
              className="inline-flex h-10 items-center px-2 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Check results
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mt-auto px-4 pb-8 pt-4 sm:px-6 md:px-8">
        <div className="mx-auto max-w-3xl text-left text-sm text-muted-foreground">
          <p>
            Commission for Technical and Vocational Education and Training
          </p>
          <p className="mt-1 text-muted-foreground/80">
            © {new Date().getFullYear()} Registration Core
          </p>
        </div>
      </footer>
    </div>
  );
}
