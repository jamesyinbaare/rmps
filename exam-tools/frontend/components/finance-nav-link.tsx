"use client";

import Link from "next/link";
import {
  BarChart3,
  BookMarked,
  Building2,
  CalendarDays,
  ClipboardList,
  Coins,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

import type { FinanceNavIcon, FinanceNavItem } from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

const ICONS: Record<FinanceNavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  rates: Coins,
  bank: Landmark,
  centre: Building2,
  statistics: BarChart3,
  calendar: CalendarDays,
  attendance: ClipboardList,
  directory: BookMarked,
};

type Props = {
  item: FinanceNavItem;
  active: boolean;
  onNavigate?: () => void;
};

export function FinanceNavLink({ item, active, onNavigate }: Props) {
  const Icon = ICONS[item.icon];

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
