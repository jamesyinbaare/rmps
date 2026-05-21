"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { cn } from "@/lib/utils";

function AnimatedStatFigure({
  value,
  className,
  animationDelayMs = 0,
}: {
  value: number;
  className?: string;
  /** Stagger count-up when several stats mount together. */
  animationDelayMs?: number;
}) {
  const animated = useAnimatedNumber(value, { delayMs: animationDelayMs });
  return (
    <span className={cn("inline-block tabular-nums", className)} aria-label={value.toLocaleString()}>
      {animated.toLocaleString()}
    </span>
  );
}

export function executiveScopeLabel(scope: string): string {
  if (scope === "ALL") return "All subjects";
  if (scope === "CORE") return "Core";
  if (scope === "ELECTIVE") return "Elective";
  return scope;
}

export function executiveScopeBadgeClass(scope: string): string {
  if (scope === "CORE") return "bg-primary/15 text-primary";
  if (scope === "ELECTIVE") return "bg-success/15 text-success";
  return "bg-secondary/25 text-secondary-foreground";
}

export function ExecutiveStatTile({
  label,
  value,
  tint,
  className,
  featured = false,
  animationDelayMs = 0,
}: {
  label: string;
  value: number;
  tint: "primary" | "success" | "secondary";
  className?: string;
  /** Full-width bar layout for stacked national totals. */
  featured?: boolean;
  /** Delay before count-up starts (ms). */
  animationDelayMs?: number;
}) {
  const styles =
    tint === "primary"
      ? "border-primary/30 bg-linear-to-br from-primary/12 via-card to-primary/5 ring-1 ring-primary/15"
      : tint === "success"
        ? "border-success/30 bg-linear-to-br from-success/12 via-card to-accent/5 ring-1 ring-success/15"
        : "border-secondary/40 bg-linear-to-br from-secondary/15 via-card to-secondary/5 ring-1 ring-secondary/20";
  const valueClass =
    tint === "primary" ? "text-primary" : tint === "success" ? "text-success" : "text-secondary-foreground";

  if (featured) {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-xl border px-4 py-5 text-center shadow-md sm:px-5 sm:py-6 lg:py-4",
          styles,
          className,
        )}
      >
        <p className={cn("text-4xl font-bold sm:text-5xl lg:text-5xl", valueClass)}>
          <AnimatedStatFigure value={value} animationDelayMs={animationDelayMs} />
        </p>
        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground lg:mt-1.5 lg:text-sm">
          {label}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border p-3.5 text-center shadow-sm lg:p-4",
        styles,
        className,
      )}
    >
      <p className={cn("text-2xl font-bold lg:text-5xl", valueClass)}>
        <AnimatedStatFigure value={value} animationDelayMs={animationDelayMs} />
      </p>
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground lg:mt-2 lg:text-sm">
        {label}
      </p>
    </div>
  );
}

export function ExecutiveSectionHeading({
  icon: Icon,
  accentClass,
  children,
  as = "h2",
}: {
  icon: LucideIcon;
  accentClass: string;
  children: ReactNode;
  as?: "h2" | "h4";
}) {
  const Tag = as;
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("h-8 w-1 shrink-0 rounded-full", accentClass)} aria-hidden />
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Tag className="text-sm font-semibold tracking-tight text-card-foreground">{children}</Tag>
    </div>
  );
}

export function ExecutiveBrandHero({
  eyebrow = "Exam overview",
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-primary/40 bg-card shadow-lg ring-1 ring-primary/15">
      <div className="h-1 bg-linear-to-r from-primary via-secondary to-success" aria-hidden />
      <div className="relative bg-linear-to-br from-primary via-accent to-success px-4 py-5">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.14),transparent_60%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/80">
            {eyebrow}
          </p>
          <p className="mt-1 text-xl font-bold leading-snug text-primary-foreground">{title}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function ExecutiveLoadingPulse({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <div
        className="h-10 w-10 animate-pulse rounded-full bg-linear-to-br from-primary via-secondary to-success motion-reduce:animate-none"
        aria-hidden
      />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export const executiveExamSelectClass =
  "min-h-11 w-full rounded-lg border border-primary-foreground/30 bg-card px-3 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/40";

export const executiveFormInputClass =
  "min-h-11 w-full rounded-lg border border-primary/20 bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
