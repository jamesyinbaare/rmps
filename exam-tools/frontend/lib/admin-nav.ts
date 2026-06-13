import type { ApiRole } from "@/lib/auth";
import {
  BANK_DIRECTORY_NAV_ITEM,
  EXAMINER_ATTENDANCE_HREF,
  FINANCE_NAV_SECTIONS,
  type FinanceNavItem,
  type FinanceNavSection,
} from "@/lib/finance-nav";
import { TEST_ADMIN_INSPECTORS_HREF } from "@/lib/executive-selected-examination";

export const ADMIN_HOME_HREF = "/dashboard/admin";
export const MONITORING_HREF = "/dashboard/admin/monitoring";
export const SCRIPT_CONTROL_HREF = "/dashboard/admin/script-control";
export const SCRIPTS_ALLOCATION_HREF = "/dashboard/admin/scripts-allocation";
export const EXAMINERS_HREF = "/dashboard/admin/examiners";

export const ADMIN_OVERVIEW_ITEM: FinanceNavItem = {
  href: ADMIN_HOME_HREF,
  label: "Overview",
  description: "Administration home",
  icon: "overview",
};

const ADMINISTRATION_ITEMS: FinanceNavItem[] = [
  {
    href: "/dashboard/admin/examinations",
    label: "Examinations",
    description: "Exam cycles & settings",
    icon: "examinations",
  },
  {
    href: "/dashboard/admin/schools",
    label: "Schools",
    description: "Registered schools",
    icon: "schools",
  },
  {
    href: "/dashboard/admin/programmes",
    label: "Programmes",
    description: "Programme catalogue",
    icon: "programmes",
  },
  {
    href: "/dashboard/admin/subjects",
    label: "Subjects",
    description: "Subject catalogue",
    icon: "subjects",
  },
  {
    href: "/dashboard/admin/examination-centres",
    label: "Examination centres",
    description: "Centres & venues",
    icon: "examinationCentres",
  },
  {
    href: "/dashboard/admin/users",
    label: "Users",
    description: "Staff accounts",
    icon: "users",
  },
  {
    href: "/dashboard/admin/depots",
    label: "Depots",
    description: "Script depots",
    icon: "depots",
  },
  {
    href: "/dashboard/admin/inspector-postings",
    label: "Inspector postings",
    description: "Centre assignments",
    icon: "inspectorPostings",
  },
  {
    href: "/dashboard/admin/inspectors",
    label: "Inspectors",
    description: "Inspector roster",
    icon: "inspectors",
  },
  {
    href: "/dashboard/admin/timetable",
    label: "Examination timetable",
    description: "Exam schedule",
    icon: "timetable",
  },
  {
    href: "/dashboard/admin/documents",
    label: "Documents",
    description: "Exam documents",
    icon: "documents",
  },
];

const MONITORING_ITEMS: FinanceNavItem[] = [
  {
    href: MONITORING_HREF,
    label: "Exam overview",
    description: "Monitoring dashboard",
    icon: "monitoring",
  },
  {
    href: "/dashboard/admin/monitoring/inspectors",
    label: "Monitoring inspectors",
    description: "Inspector activity",
    icon: "inspectors",
  },
];

const MARKING_SCRIPTS_ITEMS: FinanceNavItem[] = [
  {
    href: SCRIPT_CONTROL_HREF,
    label: "Worked scripts control",
    description: "Script verification",
    icon: "scripts",
  },
  {
    href: SCRIPTS_ALLOCATION_HREF,
    label: "Scripts allocation",
    description: "Allocate scripts",
    icon: "allocation",
  },
  {
    href: EXAMINERS_HREF,
    label: "Examiners",
    description: "Examiner roster",
    icon: "examiners",
  },
];

const SUPER_ADMIN_CORE_SECTIONS: FinanceNavSection[] = [
  {
    id: "administration",
    heading: "Administration",
    icon: "administration",
    items: ADMINISTRATION_ITEMS,
  },
  {
    id: "monitoring",
    heading: "Monitoring",
    icon: "monitoring",
    items: MONITORING_ITEMS,
  },
  {
    id: "marking-scripts",
    heading: "Marking & scripts",
    icon: "markingScripts",
    items: MARKING_SCRIPTS_ITEMS,
  },
];

export const SUPER_ADMIN_NAV_SECTIONS: FinanceNavSection[] = [
  ...SUPER_ADMIN_CORE_SECTIONS,
  ...FINANCE_NAV_SECTIONS,
];

const TEST_ADMIN_EXAMINATION_ITEMS: FinanceNavItem[] = [
  {
    href: TEST_ADMIN_INSPECTORS_HREF,
    label: "Inspectors",
    description: "Inspector monitoring",
    icon: "inspectors",
  },
  {
    href: SCRIPT_CONTROL_HREF,
    label: "Worked scripts control",
    description: "Script verification",
    icon: "scripts",
  },
];

const TEST_ADMIN_COORDINATION_MARKING_ITEMS: FinanceNavItem[] = [
  {
    href: EXAMINERS_HREF,
    label: "Examiners",
    description: "Examiner roster",
    icon: "examiners",
  },
  {
    href: SCRIPTS_ALLOCATION_HREF,
    label: "Scripts allocation",
    description: "Allocate scripts",
    icon: "allocation",
  },
  {
    href: EXAMINER_ATTENDANCE_HREF,
    label: "Examiners attendance",
    description: "Marking centre check-ins",
    icon: "attendance",
  },
  {
    href: "/dashboard/admin/lunch-coupons",
    label: "Lunch coupons",
    description: "Verify lunch coupons",
    icon: "lunch",
  },
];

export const TEST_ADMIN_OVERVIEW_ITEM: FinanceNavItem = {
  href: MONITORING_HREF,
  label: "Overview",
  description: "Exam monitoring home",
  icon: "overview",
};

export const TEST_ADMIN_NAV_SECTIONS: FinanceNavSection[] = [
  {
    id: "examination",
    heading: "Examination",
    icon: "examinations",
    items: TEST_ADMIN_EXAMINATION_ITEMS,
  },
  {
    id: "coordination-marking",
    heading: "Coordination & marking",
    icon: "coordination",
    items: TEST_ADMIN_COORDINATION_MARKING_ITEMS,
  },
];

export type AdminNavConfig = {
  overviewItem: FinanceNavItem;
  prependItems: FinanceNavItem[];
  sections: FinanceNavSection[];
  showOverview: boolean;
};

export function getAdminNavForRole(role: ApiRole): AdminNavConfig | null {
  if (role === "SUPER_ADMIN") {
    return {
      overviewItem: ADMIN_OVERVIEW_ITEM,
      prependItems: [BANK_DIRECTORY_NAV_ITEM],
      sections: SUPER_ADMIN_NAV_SECTIONS,
      showOverview: true,
    };
  }
  if (role === "TEST_ADMIN_OFFICER") {
    return {
      overviewItem: TEST_ADMIN_OVERVIEW_ITEM,
      prependItems: [],
      sections: TEST_ADMIN_NAV_SECTIONS,
      showOverview: true,
    };
  }
  return null;
}

export function adminNavActive(pathname: string, href: string): boolean {
  if (href === ADMIN_HOME_HREF || href === MONITORING_HREF) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
