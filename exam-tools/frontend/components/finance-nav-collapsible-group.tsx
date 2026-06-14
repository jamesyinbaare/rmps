"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { useFinanceSidebarCollapsed } from "@/components/finance-sidebar-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { financeNavItemIcon, financeNavSectionIcon } from "@/lib/finance-nav-icons";
import {
  financeNavActive,
  type FinanceNavItem,
  type FinanceNavSectionIcon,
} from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

type Props = {
  heading: string;
  sectionIcon: FinanceNavSectionIcon;
  items: FinanceNavItem[];
  pathname: string;
  onNavigate?: () => void;
  defaultOpen?: boolean;
  navActive?: (pathname: string, href: string) => boolean;
  resolveHref?: (href: string) => string;
};

export function FinanceNavCollapsibleGroup({
  heading,
  sectionIcon,
  items,
  pathname,
  onNavigate,
  defaultOpen = false,
  navActive = financeNavActive,
  resolveHref,
}: Props) {
  const panelId = useId();
  const collapsed = useFinanceSidebarCollapsed();
  const SectionIcon = financeNavSectionIcon(sectionIcon);
  const hasActiveChild = items.some((item) => navActive(pathname, item.href));
  const [open, setOpen] = useState(defaultOpen || hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  const triggerIconClass = cn(
    "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
    hasActiveChild
      ? "bg-success/15 text-success"
      : "bg-muted/80 text-muted-foreground group-hover:bg-success/10 group-hover:text-success",
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={heading}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition-colors",
              hasActiveChild
                ? "bg-success text-success-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <SectionIcon className="size-4" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{heading}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="group/collapsible" data-state={open ? "open" : "closed"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-foreground transition-colors",
          "hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          hasActiveChild && "text-success",
        )}
      >
        <span className={triggerIconClass}>
          <SectionIcon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate">{heading}</span>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            "group-data-[state=open]/collapsible:rotate-90",
          )}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className={cn("overflow-hidden transition-all duration-200", open ? "mt-0.5 block" : "hidden")}
      >
        <div className="relative ml-3 space-y-0.5 border-l border-border/80 pl-2">
          {items.map((item) => (
            <FinanceNavCompactLink
              key={item.href}
              item={item}
              active={navActive(pathname, item.href)}
              onNavigate={onNavigate}
              resolveHref={resolveHref}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FinanceNavCompactLink({
  item,
  active,
  onNavigate,
  resolveHref,
}: {
  item: FinanceNavItem;
  active: boolean;
  onNavigate?: () => void;
  resolveHref?: (href: string) => string;
}) {
  const Icon = financeNavItemIcon(item.icon);
  const href = resolveHref ? resolveHref(item.href) : item.href;
  return (
    <Link
      href={href}
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
