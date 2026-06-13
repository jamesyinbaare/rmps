"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useFinanceSidebar } from "@/components/finance-sidebar-context";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function FinanceSidebarToggle({ className }: Props) {
  const { collapsed, toggleCollapsed } = useFinanceSidebar();

  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40",
        className,
      )}
    >
      {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
    </button>
  );
}
