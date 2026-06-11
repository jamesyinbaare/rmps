import type { TimetableSubjectFilter } from "@/lib/api";
import {
  ACCOUNT_DETAILS_BY_CENTRE_LABEL,
  BANK_ACCOUNTS_LABEL,
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
} from "@/lib/official-accounts-zone";

export const FINANCE_HOME_HREF = "/dashboard/admin";

export const OFFICIAL_RATES_HREF = "/dashboard/admin/official-rates";
export const EXAMINER_RATES_HREF = "/dashboard/admin/examiner-rates";
export const EXAMINER_PAYOUTS_HREF = "/dashboard/admin/examiner-payouts";
export const CENTRE_SUMMARY_HREF = "/dashboard/admin/centre-summary";
export const OFFICIAL_STATISTICS_HREF = "/dashboard/admin/official-statistics";
export const FINANCE_CENTRE_SUMMARY_HREF = "/dashboard/admin/finance-centre-summary";
export const ATTENDANCE_SHEETS_HREF = "/dashboard/admin/attendance-sheets";
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
  | "directory";

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

export const FINANCE_NAV_GROUPS: FinanceNavGroup[] = [
  {
    heading: "Account details",
    items: [
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
        href: EXAMINER_PAYOUTS_HREF,
        label: "Examiner payouts",
        description: "Marking examiner allowances",
        icon: "bank",
      },
    ],
  },
  {
    heading: "Centre reporting",
    items: [
      {
        href: OFFICIAL_STATISTICS_HREF,
        label: "Centre overview",
        description: "Headcounts & variance",
        icon: "statistics",
      },
      {
        href: FINANCE_CENTRE_SUMMARY_HREF,
        label: "Invigilator by day",
        description: "Per-day coverage",
        icon: "calendar",
      },
    ],
  },
  {
    heading: "Compliance",
    items: [
      {
        href: ATTENDANCE_SHEETS_HREF,
        label: "Attendance sheets",
        description: "Centre uploads",
        icon: "attendance",
      },
    ],
  },
  {
    heading: "Setup",
    items: [
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
    ],
  },
];

const FINANCE_PAGE_TITLES: [href: string, title: string][] = [
  [FINANCE_HOME_HREF, "Overview"],
  [BANK_DIRECTORY_HREF, "Bank directory"],
  [OFFICIAL_RATES_HREF, "Allowance rates"],
  [EXAMINER_RATES_HREF, "Examiner rates"],
  [EXAMINER_PAYOUTS_HREF, "Examiner payouts"],
  [OFFICIAL_ACCOUNTS_ADMIN_HREF, BANK_ACCOUNTS_LABEL],
  [CENTRE_SUMMARY_HREF, ACCOUNT_DETAILS_BY_CENTRE_LABEL],
  [OFFICIAL_STATISTICS_HREF, "Centre overview"],
  [FINANCE_CENTRE_SUMMARY_HREF, "Invigilator by day"],
  [ATTENDANCE_SHEETS_HREF, "Attendance sheets"],
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
