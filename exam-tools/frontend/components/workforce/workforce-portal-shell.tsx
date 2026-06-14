"use client";

import Image from "next/image";

import { SidebarThemeToggle } from "@/components/sidebar-theme-toggle";
import { cn } from "@/lib/utils";

type Props = {
  portalLabel: string;
  children: React.ReactNode;
};

export function WorkforcePortalShell({ portalLabel, children }: Props) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_14%,transparent)_0%,transparent_65%)] sm:h-96"
      />
      <header className="relative border-b border-border/60 bg-background/80 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-center gap-3">
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <Image src="/logo-crest-only.png" alt="CTVET crest" fill sizes="44px" className="object-cover" priority />
          </span>
          <div className="min-w-0 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">CTVET</p>
            <p className="truncate text-sm text-muted-foreground">{portalLabel}</p>
          </div>
        </div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 sm:right-6">
          <SidebarThemeToggle variant="icon" />
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

export function WorkforcePortalLoadingState({ portalLabel }: { portalLabel: string }) {
  return (
    <WorkforcePortalShell portalLabel={portalLabel}>
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-2/3 rounded-lg bg-muted" />
        <div className="h-4 w-full rounded bg-muted/80" />
        <div className="mt-6 h-24 rounded-2xl bg-muted/60" />
        <div className="h-32 rounded-2xl bg-muted/50" />
      </div>
    </WorkforcePortalShell>
  );
}

export function WorkforcePortalTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/90 p-3.5 shadow-sm sm:p-4", className)}>
      <div className="flex items-start gap-2.5">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function formatInvitationDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
