"use client";

import type { LucideIcon } from "lucide-react";

import { FinanceNavSection } from "@/components/finance-nav-section";
import { useFinanceSidebarCollapsed } from "@/components/finance-sidebar-context";
import { SidebarThemeToggle } from "@/components/sidebar-theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FinanceNavItem, FinanceNavSection as FinanceNavSectionConfig } from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

type PortalSidebarHeaderProps = {
  title: string;
  subtitle?: string;
  collapsedIcon?: LucideIcon;
  accent?: "finance" | "default";
};

export function PortalSidebarHeader({
  title,
  subtitle = "Exam tools",
  collapsedIcon: CollapsedIcon,
  accent = "default",
}: PortalSidebarHeaderProps) {
  const collapsed = useFinanceSidebarCollapsed();

  return (
    <div
      className={cn(
        "border-b border-border",
        accent === "finance" && "bg-gradient-to-br from-success/10 via-card to-card",
        collapsed ? "flex justify-center p-3" : "p-4",
      )}
    >
      {collapsed && CollapsedIcon ? (
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            accent === "finance" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
          title={title}
          aria-hidden
        >
          <CollapsedIcon className="size-4" />
        </span>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{subtitle}</p>
          <p
            className={cn(
              "mt-1 text-sm font-semibold",
              accent === "finance" ? "text-success" : "text-card-foreground",
            )}
          >
            {title}
          </p>
        </>
      )}
    </div>
  );
}

type PortalSidebarProps = {
  pathname: string;
  onNavigate?: () => void;
  ariaLabel: string;
  overviewItem: FinanceNavItem;
  sections: FinanceNavSectionConfig[];
  prependItems?: FinanceNavItem[];
  showOverview?: boolean;
  navActive?: (pathname: string, href: string) => boolean;
  resolveHref?: (href: string) => string;
};

export function PortalSidebar({
  pathname,
  onNavigate,
  ariaLabel,
  overviewItem,
  sections,
  prependItems = [],
  showOverview = true,
  navActive,
  resolveHref,
}: PortalSidebarProps) {
  const collapsed = useFinanceSidebarCollapsed();

  return (
    <TooltipProvider>
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-3",
          collapsed ? "items-center px-2 pt-3" : "px-3 pt-3",
        )}
        aria-label={ariaLabel}
      >
        <FinanceNavSection
          pathname={pathname}
          onNavigate={onNavigate}
          prependItems={prependItems}
          showOverview={showOverview}
          sections={sections}
          overviewItem={overviewItem}
          navActive={navActive}
          resolveHref={resolveHref}
        />
      </nav>
      <div className="hidden shrink-0 border-t border-border p-2 lg:flex lg:justify-end lg:px-3 lg:py-3">
        <SidebarThemeToggle variant={collapsed ? "icon" : "pill"} />
      </div>
    </TooltipProvider>
  );
}
