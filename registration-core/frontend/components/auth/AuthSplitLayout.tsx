"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AuthSplitLayoutProps {
  title: string;
  subtitle?: ReactNode;
  form: ReactNode;
  footer?: ReactNode;
  eyebrow: string;
  headline: string;
  description: string;
  className?: string;
}

export function AuthSplitLayout({
  title,
  subtitle,
  form,
  footer,
  eyebrow,
  headline,
  description,
  className,
}: AuthSplitLayoutProps) {
  return (
    <div className={cn("flex min-h-svh bg-background", className)}>
      {/* Marketing panel — solid brand color, no photos */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border bg-primary lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.25), transparent 40%)",
          }}
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-crest-only.png"
              alt="CTVET"
              width={32}
              height={32}
              className="h-8 w-8 object-contain drop-shadow"
              priority
            />
            <span className="text-sm font-semibold tracking-tight text-primary-foreground">
              CTVET
            </span>
          </Link>

          <div className="max-w-md space-y-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary-foreground/75">
              {eyebrow}
            </p>
            <h2 className="text-[36px] font-medium leading-[1.15] tracking-[-0.03em] text-primary-foreground xl:text-[42px]">
              {headline}
            </h2>
            <p className="text-sm leading-relaxed text-primary-foreground/85">
              {description}
            </p>
          </div>

          <p className="text-xs text-primary-foreground/70">
            Commission for Technical and Vocational Education and Training
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex w-full flex-1 flex-col items-center justify-center px-6 py-10 lg:w-1/2 lg:px-10">
        <div className="w-full max-w-[360px] space-y-8">
          <div className="space-y-5">
            <Link href="/" className="inline-flex items-center gap-2 lg:hidden">
              <Image
                src="/logo-crest-only.png"
                alt="CTVET"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            </Link>
            <div className="hidden lg:block">
              <Image
                src="/logo-crest-only.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                priority
              />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {title}
              </h1>
              {subtitle ? (
                <div className="text-sm text-muted-foreground">{subtitle}</div>
              ) : null}
            </div>
          </div>

          {form}

          {footer ? (
            <div className="text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function AuthLoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
