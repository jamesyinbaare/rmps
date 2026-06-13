"use client";

import Link from "next/link";

import { useFinanceSidebarCollapsed } from "@/components/finance-sidebar-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { financeNavItemIcon } from "@/lib/finance-nav-icons";
import type { FinanceNavItem } from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

type Props = {
  item: FinanceNavItem;
  active: boolean;
  onNavigate?: () => void;
  /** Nested item under a collapsible group — single-line, smaller. */
  compact?: boolean;
  /** Icon-only rail (collapsed sidebar). */
  iconOnly?: boolean;
};

function iconOnlyButtonClass(active: boolean): string {
  return cn(
    "flex size-9 items-center justify-center rounded-lg transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
    active
      ? "bg-success text-success-foreground shadow-sm"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

export function FinanceNavLink({
  item,
  active,
  onNavigate,
  compact = false,
  iconOnly: iconOnlyProp,
}: Props) {
  const collapsed = useFinanceSidebarCollapsed();
  const iconOnly = iconOnlyProp ?? collapsed;
  const Icon = financeNavItemIcon(item.icon);

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={iconOnlyButtonClass(active)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  if (compact) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={item.description}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          active
            ? "bg-success/10 font-medium text-success"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 truncate">{item.label}</span>
      </Link>
    );
  }

  const className = cn(
    "group flex gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
    active
      ? "bg-success/10 ring-1 ring-inset ring-success/25"
      : "hover:bg-muted/50",
  );

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          active
            ? "bg-success text-success-foreground"
            : "bg-muted/80 text-muted-foreground group-hover:bg-success/10 group-hover:text-success",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block text-sm font-medium leading-snug text-foreground">{item.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{item.description}</span>
      </span>
    </Link>
  );
}
