import {
  BarChart3,
  BookMarked,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  Coins,
  FileText,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  MapPin,
  Keyboard,
  PenLine,
  ScrollText,
  Settings2,
  Ticket,
  Truck,
  UserCog,
  Users,
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
  examinations: GraduationCap,
  schools: Building2,
  programmes: BookOpen,
  subjects: ScrollText,
  users: Users,
  depots: Truck,
  inspectors: UserCog,
  documents: FileText,
  timetable: CalendarDays,
  monitoring: BarChart3,
  scripts: ClipboardList,
  allocation: MapPin,
  examiners: Users,
  allocations: MapPin,
  markedScripts: BookMarked,
  lunch: Ticket,
  inspectorPostings: UserCog,
  examinationCentres: Building2,
};

export const FINANCE_NAV_SECTION_ICONS: Record<FinanceNavSectionIcon, LucideIcon> = {
  examinations: GraduationCap,
  analysis: BarChart3,
  coordination: PenLine,
  setup: Coins,
  administration: Settings2,
  monitoring: BarChart3,
  marking: PenLine,
  markingScripts: ClipboardList,
  workforce: ClipboardCheck,
  scriptChecking: ClipboardCheck,
  dataEntry: Keyboard,
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
