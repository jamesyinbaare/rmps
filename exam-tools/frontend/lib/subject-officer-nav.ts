import type { FinanceNavItem, FinanceNavSection } from "@/lib/finance-nav";

export const SUBJECT_OFFICER_BASE = "/dashboard/subject-officer";

export const SUBJECT_OFFICER_OVERVIEW_ITEM: FinanceNavItem = {
  href: SUBJECT_OFFICER_BASE,
  label: "Overview",
  description: "Marking home",
  icon: "overview",
};

const COORDINATION_ITEMS: FinanceNavItem[] = [
  {
    href: `${SUBJECT_OFFICER_BASE}/examiners`,
    label: "Examiners",
    description: "Subject examiner roster",
    icon: "examiners",
  },
  {
    href: `${SUBJECT_OFFICER_BASE}/attendance`,
    label: "Attendance",
    description: "Marking centre check-ins",
    icon: "attendance",
  },
  {
    href: `${SUBJECT_OFFICER_BASE}/lunch-verification`,
    label: "Lunch Coupons",
    description: "Verify lunch coupons",
    icon: "lunch",
  },
];

const MARKING_ITEMS: FinanceNavItem[] = [
  {
    href: `${SUBJECT_OFFICER_BASE}/allocations`,
    label: "Allocation",
    description: "Script allocations",
    icon: "allocations",
  },
  {
    href: `${SUBJECT_OFFICER_BASE}/marked-script-returns`,
    label: "Marked Scripts",
    description: "Return marked scripts",
    icon: "markedScripts",
  },
];

export const SUBJECT_OFFICER_NAV_SECTIONS: FinanceNavSection[] = [
  {
    id: "coordination",
    heading: "Coordination",
    icon: "coordination",
    items: COORDINATION_ITEMS,
  },
  {
    id: "marking",
    heading: "Marking",
    icon: "marking",
    items: MARKING_ITEMS,
  },
];

export function subjectOfficerNavActive(pathname: string, href: string): boolean {
  if (href === SUBJECT_OFFICER_BASE) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
