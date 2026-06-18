import type { TimetableSubjectFilter } from "@/lib/api";
import {
  ACCOUNT_DETAILS_BY_CENTRE_LABEL,
  BANK_ACCOUNTS_LABEL,
  EXAMINER_ACCOUNTS_BY_SUBJECT_HREF,
  EXAMINER_ACCOUNTS_BY_SUBJECT_LABEL,
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
} from "@/lib/official-accounts-zone";
import {
  DATA_ENTRY_CLERK_FINANCE_NAV_ITEMS,
  SCRIPT_CHECKER_FINANCE_NAV_ITEMS,
  WORKFORCE_SETUP_RATE_NAV_ITEMS,
  dataEntryNavSection,
  scriptCheckingNavSection,
} from "@/lib/workforce-nav";

export const FINANCE_HOME_HREF = "/dashboard/admin";

export const OFFICIAL_RATES_HREF = "/dashboard/admin/official-rates";
export const EXAMINER_RATES_HREF = "/dashboard/admin/examiner-rates";
export const EXAMINER_PAYOUTS_HREF = "/dashboard/admin/examiner-payouts";
export const SCRIPT_CHECKER_PAYOUTS_HREF = "/dashboard/admin/script-checker-payouts";
export const DATA_ENTRY_CLERK_PAYOUTS_HREF = "/dashboard/admin/data-entry-clerk-payouts";
export const SCRIPT_CHECKER_RATES_HREF = "/dashboard/admin/script-checker-rates";
export const DATA_ENTRY_CLERK_RATES_HREF = "/dashboard/admin/data-entry-clerk-rates";
export const EXAMINER_ATTENDANCE_HREF = "/dashboard/admin/examiner-attendance";
export const LUNCH_COUPONS_HREF = "/dashboard/admin/lunch-coupons";
export const LUNCH_COUPONS_PRINT_HREF = "/dashboard/admin/lunch-coupon-print";
/** @deprecated Use EXAMINER_ACCOUNTS_BY_SUBJECT_HREF from official-accounts-zone */
export { EXAMINERS_BY_SUBJECT_HREF, EXAMINER_ACCOUNTS_BY_SUBJECT_HREF } from "@/lib/official-accounts-zone";
export const CENTRE_SUMMARY_HREF = "/dashboard/admin/centre-summary";
export const OFFICIAL_STATISTICS_HREF = "/dashboard/admin/official-statistics";
export const FINANCE_CENTRE_SUMMARY_HREF = "/dashboard/admin/finance-centre-summary";
export const INSPECTOR_ANALYSIS_HREF = "/dashboard/admin/inspector-analysis";
export const INSPECTOR_PAY_VARIANCE_HREF = "/dashboard/admin/inspector-pay-variance";
export const ATTENDANCE_SHEETS_HREF = "/dashboard/admin/attendance-sheets";
export const EXAMINER_MARKING_ATTENDANCE_SHEETS_HREF = "/dashboard/admin/examiner-attendance-sheets";
export const BANK_DIRECTORY_HREF = "/dashboard/admin/bank-directory";

export function timetableFilterToAttendanceScope(
  filter: TimetableSubjectFilter,
): "" | "CORE" | "ELECTIVE" {
  if (filter === "CORE_ONLY") return "CORE";
  if (filter === "ELECTIVE_ONLY") return "ELECTIVE";
  return "";
}

export function buildAdminAttendanceSheetsHref(params: {
  examId: number;
  centerId: string;
  subjectFilter: TimetableSubjectFilter;
}): string {
  const p = new URLSearchParams();
  p.set("exam", String(params.examId));
  p.set("center", params.centerId.trim());
  const scope = timetableFilterToAttendanceScope(params.subjectFilter);
  if (scope) p.set("scope", scope);
  return `${ATTENDANCE_SHEETS_HREF}?${p.toString()}`;
}

export type FinanceNavIcon =
  | "overview"
  | "rates"
  | "bank"
  | "centre"
  | "statistics"
  | "calendar"
  | "attendance"
  | "directory"
  | "examinations"
  | "schools"
  | "programmes"
  | "subjects"
  | "users"
  | "depots"
  | "inspectors"
  | "documents"
  | "timetable"
  | "monitoring"
  | "scripts"
  | "allocation"
  | "examiners"
  | "allocations"
  | "markedScripts"
  | "lunch"
  | "inspectorPostings"
  | "examinationCentres";

export type FinanceNavItem = {
  href: string;
  label: string;
  description: string;
  icon: FinanceNavIcon;
};

export type FinanceNavGroup = {
  heading: string;
  items: FinanceNavItem[];
};

export type FinanceNavSectionIcon =
  | "examinations"
  | "coordination"
  | "setup"
  | "administration"
  | "monitoring"
  | "marking"
  | "markingScripts"
  | "workforce"
  | "scriptChecking"
  | "dataEntry"
  | "analysis";

export type FinanceNavSection = {
  id: string;
  heading: string;
  icon: FinanceNavSectionIcon;
  items: FinanceNavItem[];
  /** Secondary footer zone in the sidebar (e.g. infrequent reports). */
  deemphasized?: boolean;
};

export const FINANCE_OVERVIEW_ITEM: FinanceNavItem = {
  href: FINANCE_HOME_HREF,
  label: "Overview",
  description: "Workspace home",
  icon: "overview",
};

export const BANK_DIRECTORY_NAV_ITEM: FinanceNavItem = {
  href: BANK_DIRECTORY_HREF,
  label: "Bank directory",
  description: "Branches & codes",
  icon: "directory",
};

export function financeNavActive(pathname: string, href: string): boolean {
  if (href === FINANCE_HOME_HREF) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const COORDINATION_MARKING_NAV_GROUP: FinanceNavGroup = {
  heading: "Coordination & marking",
  items: [
    {
      href: EXAMINER_PAYOUTS_HREF,
      label: "Examiner bank accounts",
      description: "Bank details, allocation & payout",
      icon: "bank",
    },
    {
      href: EXAMINER_ACCOUNTS_BY_SUBJECT_HREF,
      label: EXAMINER_ACCOUNTS_BY_SUBJECT_LABEL,
      description: "Single subject drill-down",
      icon: "centre",
    },
    {
      href: EXAMINER_ATTENDANCE_HREF,
      label: "Examiner attendance",
      description: "Marking centre check-ins",
      icon: "attendance",
    },
  ],
};

const EXAMINATIONS_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: OFFICIAL_ACCOUNTS_ADMIN_HREF,
    label: BANK_ACCOUNTS_LABEL,
    description: "All centres",
    icon: "bank",
  },
  {
    href: CENTRE_SUMMARY_HREF,
    label: ACCOUNT_DETAILS_BY_CENTRE_LABEL,
    description: "Single centre drill-down",
    icon: "centre",
  },
  {
    href: OFFICIAL_STATISTICS_HREF,
    label: "Centre overview",
    description: "Headcounts & variance",
    icon: "statistics",
  },
  {
    href: ATTENDANCE_SHEETS_HREF,
    label: "Attendance sheets",
    description: "Centre uploads",
    icon: "attendance",
  },
  {
    href: EXAMINER_MARKING_ATTENDANCE_SHEETS_HREF,
    label: "Marking attendance sheets",
    description: "Cohort signed uploads",
    icon: "attendance",
  },
];

const ANALYSIS_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: FINANCE_CENTRE_SUMMARY_HREF,
    label: "Invigilator by day",
    description: "Per-day coverage",
    icon: "calendar",
  },
  {
    href: INSPECTOR_ANALYSIS_HREF,
    label: "Inspector analysis",
    description: "Staffing & headcount",
    icon: "statistics",
  },
  {
    href: INSPECTOR_PAY_VARIANCE_HREF,
    label: "Inspector pay variance",
    description: "Days & payout comparison",
    icon: "statistics",
  },
];

const SETUP_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: OFFICIAL_RATES_HREF,
    label: "Allowance rates",
    description: "Centre official rates",
    icon: "rates",
  },
  {
    href: EXAMINER_RATES_HREF,
    label: "Examiner rates",
    description: "Role & subject allowances",
    icon: "rates",
  },
  ...WORKFORCE_SETUP_RATE_NAV_ITEMS,
];

/** Top-level collapsible sidebar sections (sidebar-07 style). */
export const FINANCE_NAV_SECTIONS: FinanceNavSection[] = [
  {
    id: "examinations",
    heading: "Examinations",
    icon: "examinations",
    items: EXAMINATIONS_NAV_ITEMS,
  },
  {
    id: "coordination-marking",
    heading: "Coordination & marking",
    icon: "coordination",
    items: COORDINATION_MARKING_NAV_GROUP.items,
  },
  scriptCheckingNavSection(SCRIPT_CHECKER_FINANCE_NAV_ITEMS),
  dataEntryNavSection(DATA_ENTRY_CLERK_FINANCE_NAV_ITEMS),
  {
    id: "setup",
    heading: "Setup",
    icon: "setup",
    items: SETUP_NAV_ITEMS,
  },
  {
    id: "analysis",
    heading: "Reports",
    icon: "analysis",
    items: ANALYSIS_NAV_ITEMS,
    deemphasized: true,
  },
];

/** Collapsible sidebar sections mapped to overview cards on the finance home page. */
export const FINANCE_NAV_GROUPS: FinanceNavGroup[] = FINANCE_NAV_SECTIONS.map((section) => ({
  heading: section.heading,
  items: section.items,
}));

const FINANCE_PAGE_TITLES: [href: string, title: string][] = [
  [FINANCE_HOME_HREF, "Overview"],
  [BANK_DIRECTORY_HREF, "Bank directory"],
  [OFFICIAL_RATES_HREF, "Allowance rates"],
  [EXAMINER_RATES_HREF, "Examiner rates"],
  [EXAMINER_PAYOUTS_HREF, "Examiner bank accounts"],
  [SCRIPT_CHECKER_PAYOUTS_HREF, "Script checker payouts"],
  [DATA_ENTRY_CLERK_PAYOUTS_HREF, "Data entry clerk payouts"],
  [SCRIPT_CHECKER_RATES_HREF, "Script checker rates"],
  [DATA_ENTRY_CLERK_RATES_HREF, "Data entry clerk rates"],
  [EXAMINER_ATTENDANCE_HREF, "Examiner attendance"],
  [EXAMINER_ACCOUNTS_BY_SUBJECT_HREF, EXAMINER_ACCOUNTS_BY_SUBJECT_LABEL],
  [OFFICIAL_ACCOUNTS_ADMIN_HREF, BANK_ACCOUNTS_LABEL],
  [CENTRE_SUMMARY_HREF, ACCOUNT_DETAILS_BY_CENTRE_LABEL],
  [OFFICIAL_STATISTICS_HREF, "Centre overview"],
  [FINANCE_CENTRE_SUMMARY_HREF, "Invigilator by day"],
  [INSPECTOR_ANALYSIS_HREF, "Inspector analysis"],
  [INSPECTOR_PAY_VARIANCE_HREF, "Inspector pay variance"],
  [ATTENDANCE_SHEETS_HREF, "Attendance sheets"],
  [EXAMINER_MARKING_ATTENDANCE_SHEETS_HREF, "Marking attendance sheets"],
];

export function financePageStickyTitle(pathname: string): string | null {
  for (const [href, title] of FINANCE_PAGE_TITLES) {
    if (href === FINANCE_HOME_HREF) {
      if (pathname === href) return title;
      continue;
    }
    if (pathname === href || pathname.startsWith(`${href}/`)) return title;
  }
  return null;
}
