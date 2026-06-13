import {
  BarChart3,
  BookMarked,
  Building2,
  CalendarDays,
  ClipboardList,
  Coins,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  PenLine,
  type LucideIcon,
} from "lucide-react";

import type { FinanceNavIcon, FinanceNavSectionIcon } from "@/lib/finance-nav";

export const FINANCE_NAV_ITEM_ICONS: Record<FinanceNavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  rates: Coins,
  bank: Landmark,
  centre: Building2,
  statistics: BarChart3,
  calendar: CalendarDays,
  attendance: ClipboardList,
  directory: BookMarked,
};

export const FINANCE_NAV_SECTION_ICONS: Record<FinanceNavSectionIcon, LucideIcon> = {
  examinations: GraduationCap,
  coordination: PenLine,
  setup: Coins,
};

export function financeNavItemIcon(icon: FinanceNavIcon): LucideIcon {
  return FINANCE_NAV_ITEM_ICONS[icon];
}

export function financeNavSectionIcon(icon: FinanceNavSectionIcon): LucideIcon {
  return FINANCE_NAV_SECTION_ICONS[icon];
}

/** Expanded sidebar width (matches Tailwind w-64). */
export const FINANCE_SIDEBAR_WIDTH_EXPANDED = "16rem";
/** Collapsed icon rail (matches Tailwind w-[3.25rem]). */
export const FINANCE_SIDEBAR_WIDTH_COLLAPSED = "3.25rem";

export const FINANCE_SIDEBAR_COLLAPSED_STORAGE_KEY = "exam-tools-finance-sidebar-collapsed";
