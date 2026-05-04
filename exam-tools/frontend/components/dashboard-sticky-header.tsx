"use client";

import Link from "next/link";
import { Home, LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export type DashboardStickyHeaderSidebar = {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Props = {
  title: string;
  subtitle?: string | null;
  onLogout: () => void;
  /** When set, shows the mobile sidebar trigger (hidden at `lg` and up). */
  sidebar?: DashboardStickyHeaderSidebar;
};

export function DashboardStickyHeader({ title, subtitle, onLogout, sidebar }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        {sidebar ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("shrink-0 lg:hidden", inputFocusRing)}
            aria-expanded={sidebar.open}
            aria-controls={sidebar.id}
            aria-label={sidebar.open ? "Close menu" : "Open menu"}
            onClick={() => sidebar.onOpenChange(!sidebar.open)}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-card-foreground sm:text-lg">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className={cn("hidden min-h-11 gap-2 px-3 sm:px-4 lg:inline-flex", inputFocusRing)}
            asChild
          >
            <Link href="/">
              <Home className="size-4 shrink-0" aria-hidden />
              Home
            </Link>
          </Button>
          <Button
            type="button"
            className={cn("min-h-11 gap-2 px-3 sm:px-4", inputFocusRing)}
            onClick={onLogout}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Same actions as the sticky bar, for layouts without a sidebar (e.g. simple dashboard routes). */
export function DashboardSimpleHeader({
  title,
  subtitle,
  onLogout,
}: Omit<Props, "sidebar">) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Exam tools
          </p>
          <h1 className="text-lg font-semibold text-card-foreground sm:text-xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            variant="outline"
            className={cn("hidden min-h-11 gap-2 px-4 lg:inline-flex", inputFocusRing)}
            asChild
          >
            <Link href="/">
              <Home className="size-4 shrink-0" aria-hidden />
              Home
            </Link>
          </Button>
          <Button type="button" className={cn("min-h-11 gap-2 px-4", inputFocusRing)} onClick={onLogout}>
            <LogOut className="size-4 shrink-0" aria-hidden />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
