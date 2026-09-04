"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

export const rateAmountInputClass =
  "h-9 w-full min-w-[4.5rem] rounded-md border border-input-border bg-input px-2 text-right text-sm tabular-nums text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

export const searchInputClass =
  "h-9 w-full rounded-md border border-input-border bg-input pl-9 pr-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export function RatesSectionHeader({
  step,
  title,
  description,
  action,
}: {
  step: number;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {step}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {description ? <p className="mt-1 pl-8 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ExaminerRatesPaneHeader({
  groupLabel,
  title,
  description,
}: {
  groupLabel: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{groupLabel}</p>
      <h3 className="mt-0.5 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ExaminerRatesPayRuleNote() {
  return (
    <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      An allowance is paid only when{" "}
      <span className="font-medium text-foreground">roster source</span> allows it{" "}
      <span className="font-medium text-foreground">and</span> at least one of the examiner&apos;s{" "}
      <span className="font-medium text-foreground">allowance groups</span> enables it.
    </p>
  );
}

export function InlineSearchField({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={searchInputClass}
      />
    </div>
  );
}
