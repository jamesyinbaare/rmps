"use client";

import { Landmark } from "lucide-react";

import { FinanceNavSection } from "@/components/finance-nav-section";
import { useFinanceSidebarCollapsed } from "@/components/finance-sidebar-context";
import { SidebarThemeToggle } from "@/components/sidebar-theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  pathname: string;
  onNavigate?: () => void;
};

export function FinanceSidebar({ pathname, onNavigate }: Props) {
  const collapsed = useFinanceSidebarCollapsed();

  return (
    <TooltipProvider>
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-3",
          collapsed ? "items-center px-2 pt-3" : "px-3 pt-3",
        )}
        aria-label="Finance"
      >
        <FinanceNavSection pathname={pathname} onNavigate={onNavigate} showOverview />
      </nav>
      <div
        className={cn(
          "hidden shrink-0 border-t border-border p-2 lg:flex lg:justify-end lg:px-3 lg:py-3",
        )}
      >
        <SidebarThemeToggle variant={collapsed ? "icon" : "pill"} />
      </div>
    </TooltipProvider>
  );
}

export function FinanceSidebarHeader({ isFinanceOfficer }: { isFinanceOfficer: boolean }) {
  const collapsed = useFinanceSidebarCollapsed();

  return (
    <div
      className={cn(
        "border-b border-border",
        isFinanceOfficer && "bg-gradient-to-br from-success/10 via-card to-card",
        collapsed ? "flex justify-center p-3" : "p-4",
      )}
    >
      {collapsed ? (
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            isFinanceOfficer ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
          title="Finance"
          aria-hidden
        >
          <Landmark className="size-4" />
        </span>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exam tools</p>
          <p
            className={cn(
              "mt-1 text-sm font-semibold",
              isFinanceOfficer ? "text-success" : "text-card-foreground",
            )}
          >
            Finance
          </p>
        </>
      )}
    </div>
  );
}
