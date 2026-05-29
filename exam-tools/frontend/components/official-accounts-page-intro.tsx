import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  description: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  /** When set, replaces the default bank-account privacy notice. */
  footerNote?: React.ReactNode;
};

/** Page lead — pairs with the shell sticky title; no duplicate H1. */
export function OfficialAccountsPageIntro({ description, actions, meta, footerNote }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        {actions ? (
          <div className="order-first flex w-full min-w-0 shrink-0 flex-col gap-2 lg:order-2 lg:w-auto lg:flex-row lg:justify-end [&_button]:min-h-11 [&_button]:w-full lg:[&_button]:min-h-10 lg:[&_button]:w-auto">
            {actions}
          </div>
        ) : null}
        <div className="order-2 min-w-0 flex-1 space-y-3 lg:order-1">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      </div>
      {footerNote ?? (
        <p
          className={cn(
            "flex items-start gap-2.5 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-xs leading-relaxed text-muted-foreground shadow-sm",
          )}
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>Account numbers are stored and used for processing official allowances only.</span>
        </p>
      )}
    </div>
  );
}

/** Examination context chip shown under the page description. */
export function OfficialAccountsExamMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs">
      <span className="shrink-0 font-semibold uppercase tracking-wide text-muted-foreground">Exam</span>
      <span className="min-w-0 truncate font-medium text-foreground">{children}</span>
    </span>
  );
}
