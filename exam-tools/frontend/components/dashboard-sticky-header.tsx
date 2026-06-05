"use client";

import Link from "next/link";
import { Home, LogOut, Menu } from "lucide-react";
import type { ReactNode } from "react";

import { SidebarThemeToggle } from "@/components/sidebar-theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

/** Shared motion + hover tint for logout controls in the header. */
const logoutControlClass = cn(
  "group transition-[color,background-color,transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
  "[&_svg]:transition-[transform,color] [&_svg]:duration-200 [&_svg]:ease-out motion-reduce:[&_svg]:transition-none",
  "hover:[&_svg]:translate-x-0.5 hover:[&_svg]:text-destructive",
  "active:scale-95 motion-reduce:active:scale-100",
  inputFocusRing,
);

function HeaderLogoutIconButton({
  onLogout,
  className,
}: {
  onLogout: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        logoutControlClass,
        "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      onClick={onLogout}
      aria-label="Log out"
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
    </Button>
  );
}

function HeaderLogoutLabeledButton({
  onLogout,
  className,
}: {
  onLogout: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        logoutControlClass,
        "min-h-11 gap-2 px-3 sm:px-4",
        "text-foreground hover:border-destructive/35 hover:bg-destructive/8 hover:text-destructive",
        className,
      )}
      onClick={onLogout}
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      Log out
    </Button>
  );
}

export type DashboardStickyHeaderSidebar = {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  onLogout: () => void;
  /** When set, shows the mobile sidebar trigger (hidden at `lg` and up). */
  sidebar?: DashboardStickyHeaderSidebar;
  /** Green accent border for official account details routes. */
  accent?: "official-accounts";
  /** Simpler bar below `lg`; full navbar from `lg` up when used with sidebar on desktop. */
  executiveMobileOnly?: boolean;
};

export function DashboardStickyHeader({
  title,
  subtitle,
  onLogout,
  sidebar,
  accent,
  executiveMobileOnly = false,
}: Props) {
  const showMobileThemeToggle = executiveMobileOnly || sidebar != null;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-card/95 backdrop-blur",
        accent === "official-accounts" ? "border-success/40" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 sm:px-6",
          executiveMobileOnly ? "py-2.5 lg:py-3" : "py-3",
        )}
      >
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
          <h1 className="truncate text-base font-semibold text-card-foreground sm:text-lg">{title}</h1>
          {subtitle ? (
            <p
              className={cn(
                "truncate text-muted-foreground",
                executiveMobileOnly ? "mt-0.5 text-xs lg:mt-0 lg:text-sm" : "text-sm",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            className={cn(
              "hidden min-h-11 gap-2 px-3 sm:px-4 lg:inline-flex",
              executiveMobileOnly && "max-lg:hidden",
              inputFocusRing,
            )}
            asChild
          >
            <Link href="/">
              <Home className="size-4 shrink-0" aria-hidden />
              Home
            </Link>
          </Button>
          {showMobileThemeToggle ? (
            <div className="lg:hidden">
              <SidebarThemeToggle align="start" />
            </div>
          ) : null}
          <HeaderLogoutIconButton onLogout={onLogout} className="shrink-0 lg:hidden" />
          <HeaderLogoutLabeledButton
            onLogout={onLogout}
            className={cn("hidden lg:inline-flex", executiveMobileOnly && "max-lg:hidden")}
          />
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
}: Omit<Props, "sidebar" | "executiveMobileOnly" | "accent">) {
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
          <HeaderLogoutIconButton onLogout={onLogout} className="shrink-0 sm:hidden" />
          <HeaderLogoutLabeledButton onLogout={onLogout} className="hidden min-h-11 px-4 sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}
