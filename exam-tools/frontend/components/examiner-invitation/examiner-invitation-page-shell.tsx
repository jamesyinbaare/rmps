"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

export function ExaminerInvitationPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_14%,transparent)_0%,transparent_65%)] sm:h-96"
      />
      <header className="border-b border-border/60 bg-background/80 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-center gap-3">
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <Image
              src="/logo-crest-only.png"
              alt="CTVET crest"
              fill
              sizes="44px"
              className="object-cover"
              priority
            />
          </span>
          <div className="min-w-0 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">CTVET</p>
            <p className="truncate text-sm text-muted-foreground">Examiner invitation</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8">
        {children}
      </main>
      <footer className="border-t border-border/60 bg-card/50 px-4 py-4 text-center backdrop-blur-sm">
        <p className="text-xs text-muted-foreground">
          Commission for Technical and Vocational Education and Training
        </p>
      </footer>
    </div>
  );
}

export function ExaminerInvitationLoadingState() {
  return (
    <ExaminerInvitationPageShell>
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-2/3 rounded-lg bg-muted" />
        <div className="h-4 w-full rounded bg-muted/80" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted/60" />
          ))}
        </div>
        <div className="mt-8 h-12 rounded-xl bg-muted" />
      </div>
    </ExaminerInvitationPageShell>
  );
}

export function ExaminerInvitationDetailTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/90 p-3.5 shadow-sm backdrop-blur-sm sm:p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function formatInvitationDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCoordinationDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function invitationStatusMeta(
  status: "pending" | "accepted" | "declined" | "expired" | "quota_waitlisted",
) {
  switch (status) {
    case "accepted":
      return {
        label: "Confirmed",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    case "declined":
      return {
        label: "Declined",
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    case "expired":
      return {
        label: "Expired",
        className: "border-border bg-muted text-muted-foreground",
      };
    case "quota_waitlisted":
      return {
        label: "On waitlist",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      };
    default:
      return {
        label: "Awaiting response",
        className: "border-primary/30 bg-primary/10 text-primary",
      };
  }
}
