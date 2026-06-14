import type { FinanceNavItem, FinanceNavSection } from "@/lib/finance-nav";
import { SUBJECT_OFFICER_BASE } from "@/lib/subject-officer-lunch-nav";
import { DATA_ENTRY_CLERK_CONFIG, SCRIPT_CHECKER_CONFIG } from "@/lib/workforce-kind";

export const SCRIPT_CHECKING_NAV_SECTION_ID = "script-checking";
export const DATA_ENTRY_NAV_SECTION_ID = "data-entry";

export const SCRIPT_CHECKING_NAV_SECTION_HEADING = "Script checking";
export const DATA_ENTRY_NAV_SECTION_HEADING = "Data entry";

/** @deprecated Use SCRIPT_CHECKING_NAV_SECTION_ID and DATA_ENTRY_NAV_SECTION_ID */
export const WORKFORCE_NAV_SECTION_ID = SCRIPT_CHECKING_NAV_SECTION_ID;

export const WORKFORCE_NAV_SECTION_IDS = [
  SCRIPT_CHECKING_NAV_SECTION_ID,
  DATA_ENTRY_NAV_SECTION_ID,
] as const;

const SCRIPT_CHECKER_ROSTER_ITEM: FinanceNavItem = {
  href: SCRIPT_CHECKER_CONFIG.adminRosterPath,
  label: "Script checkers",
  description: "Checker roster & invites",
  icon: "markedScripts",
};

const SCRIPT_CHECKER_ASSIGNMENTS_ITEM: FinanceNavItem = {
  href: SCRIPT_CHECKER_CONFIG.adminAssignmentsPath,
  label: "Checker assignments",
  description: "Assign script batches",
  icon: "allocation",
};

const SCRIPT_CHECKER_PAYOUTS_ITEM: FinanceNavItem = {
  href: SCRIPT_CHECKER_CONFIG.adminPayoutsPath,
  label: "Checker payouts",
  description: "Completed batches & BoG export",
  icon: "bank",
};

const SCRIPT_CHECKER_RATES_ITEM: FinanceNavItem = {
  href: SCRIPT_CHECKER_CONFIG.adminRatesPath,
  label: "Checker rates",
  description: "Rate, allowances, tax & BoG export",
  icon: "rates",
};

const DATA_ENTRY_CLERK_ROSTER_ITEM: FinanceNavItem = {
  href: DATA_ENTRY_CLERK_CONFIG.adminRosterPath,
  label: "Data entry clerks",
  description: "Clerk roster & invites",
  icon: "markedScripts",
};

const DATA_ENTRY_CLERK_ASSIGNMENTS_ITEM: FinanceNavItem = {
  href: DATA_ENTRY_CLERK_CONFIG.adminAssignmentsPath,
  label: "Clerk assignments",
  description: "Assign data entry batches",
  icon: "allocation",
};

const DATA_ENTRY_CLERK_PAYOUTS_ITEM: FinanceNavItem = {
  href: DATA_ENTRY_CLERK_CONFIG.adminPayoutsPath,
  label: "Clerk payouts",
  description: "Completed batches & BoG export",
  icon: "bank",
};

const DATA_ENTRY_CLERK_RATES_ITEM: FinanceNavItem = {
  href: DATA_ENTRY_CLERK_CONFIG.adminRatesPath,
  label: "Clerk rates",
  description: "Rate, allowances, tax & BoG export",
  icon: "rates",
};

export const SCRIPT_CHECKER_ADMIN_NAV_ITEMS: FinanceNavItem[] = [
  SCRIPT_CHECKER_ROSTER_ITEM,
  SCRIPT_CHECKER_ASSIGNMENTS_ITEM,
];

export const DATA_ENTRY_CLERK_ADMIN_NAV_ITEMS: FinanceNavItem[] = [
  DATA_ENTRY_CLERK_ROSTER_ITEM,
  DATA_ENTRY_CLERK_ASSIGNMENTS_ITEM,
];

export const SCRIPT_CHECKER_SUPER_ADMIN_NAV_ITEMS: FinanceNavItem[] = [
  SCRIPT_CHECKER_ROSTER_ITEM,
  SCRIPT_CHECKER_ASSIGNMENTS_ITEM,
  SCRIPT_CHECKER_PAYOUTS_ITEM,
  SCRIPT_CHECKER_RATES_ITEM,
];

export const DATA_ENTRY_CLERK_SUPER_ADMIN_NAV_ITEMS: FinanceNavItem[] = [
  DATA_ENTRY_CLERK_ROSTER_ITEM,
  DATA_ENTRY_CLERK_ASSIGNMENTS_ITEM,
  DATA_ENTRY_CLERK_PAYOUTS_ITEM,
  DATA_ENTRY_CLERK_RATES_ITEM,
];

export const SCRIPT_CHECKER_FINANCE_NAV_ITEMS: FinanceNavItem[] = [SCRIPT_CHECKER_PAYOUTS_ITEM];

export const DATA_ENTRY_CLERK_FINANCE_NAV_ITEMS: FinanceNavItem[] = [DATA_ENTRY_CLERK_PAYOUTS_ITEM];

export const SUBJECT_OFFICER_SCRIPT_CHECKER_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: `${SUBJECT_OFFICER_BASE}/script-checker-assignments`,
    label: "Checker assignments",
    description: "Assign checker batches",
    icon: "markedScripts",
  },
];

export const SUBJECT_OFFICER_DATA_ENTRY_CLERK_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: `${SUBJECT_OFFICER_BASE}/data-entry-clerk-assignments`,
    label: "Clerk assignments",
    description: "Assign clerk batches",
    icon: "markedScripts",
  },
];

/** @deprecated Use SCRIPT_CHECKER_ADMIN_NAV_ITEMS and DATA_ENTRY_CLERK_ADMIN_NAV_ITEMS */
export const ADMIN_WORKFORCE_NAV_ITEMS: FinanceNavItem[] = [
  ...SCRIPT_CHECKER_ADMIN_NAV_ITEMS,
  ...DATA_ENTRY_CLERK_ADMIN_NAV_ITEMS,
];

/** @deprecated Use SCRIPT_CHECKER_FINANCE_NAV_ITEMS and DATA_ENTRY_CLERK_FINANCE_NAV_ITEMS */
export const FINANCE_WORKFORCE_NAV_ITEMS: FinanceNavItem[] = [
  ...SCRIPT_CHECKER_FINANCE_NAV_ITEMS,
  ...DATA_ENTRY_CLERK_FINANCE_NAV_ITEMS,
];

/** Checker and clerk rate links for the finance Setup menu. */
export const WORKFORCE_SETUP_RATE_NAV_ITEMS: FinanceNavItem[] = [
  SCRIPT_CHECKER_RATES_ITEM,
  DATA_ENTRY_CLERK_RATES_ITEM,
];

/** @deprecated Use SUBJECT_OFFICER_SCRIPT_CHECKER_NAV_ITEMS and SUBJECT_OFFICER_DATA_ENTRY_CLERK_NAV_ITEMS */
export const SUBJECT_OFFICER_WORKFORCE_NAV_ITEMS: FinanceNavItem[] = [
  ...SUBJECT_OFFICER_SCRIPT_CHECKER_NAV_ITEMS,
  ...SUBJECT_OFFICER_DATA_ENTRY_CLERK_NAV_ITEMS,
];

/** @deprecated Use SCRIPT_CHECKER_SUPER_ADMIN_NAV_ITEMS and DATA_ENTRY_CLERK_SUPER_ADMIN_NAV_ITEMS */
export const SUPER_ADMIN_WORKFORCE_NAV_ITEMS: FinanceNavItem[] = [
  ...SCRIPT_CHECKER_SUPER_ADMIN_NAV_ITEMS,
  ...DATA_ENTRY_CLERK_SUPER_ADMIN_NAV_ITEMS,
];

export function scriptCheckingNavSection(items: FinanceNavItem[]): FinanceNavSection {
  return {
    id: SCRIPT_CHECKING_NAV_SECTION_ID,
    heading: SCRIPT_CHECKING_NAV_SECTION_HEADING,
    icon: "scriptChecking",
    items,
  };
}

export function dataEntryNavSection(items: FinanceNavItem[]): FinanceNavSection {
  return {
    id: DATA_ENTRY_NAV_SECTION_ID,
    heading: DATA_ENTRY_NAV_SECTION_HEADING,
    icon: "dataEntry",
    items,
  };
}

/** @deprecated Use scriptCheckingNavSection or dataEntryNavSection */
export function workforceNavSection(items: FinanceNavItem[]): FinanceNavSection {
  return scriptCheckingNavSection(items);
}

const ADMIN_WORKFORCE_SCROLL_SHELL_PATHS = [
  SCRIPT_CHECKER_CONFIG.adminRosterPath,
  SCRIPT_CHECKER_CONFIG.adminAssignmentsPath,
  SCRIPT_CHECKER_CONFIG.adminPayoutsPath,
  DATA_ENTRY_CLERK_CONFIG.adminRosterPath,
  DATA_ENTRY_CLERK_CONFIG.adminAssignmentsPath,
  DATA_ENTRY_CLERK_CONFIG.adminPayoutsPath,
] as const;

const SUBJECT_OFFICER_WORKFORCE_ASSIGNMENT_PATHS = [
  SCRIPT_CHECKER_CONFIG.subjectOfficerAssignmentsPath,
  DATA_ENTRY_CLERK_CONFIG.subjectOfficerAssignmentsPath,
] as const;

function matchesPathPrefix(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Admin workforce roster, assignment, and payout pages. */
export function isAdminWorkforceRosterOrAssignmentPage(pathname: string): boolean {
  return ADMIN_WORKFORCE_SCROLL_SHELL_PATHS.some((p) => matchesPathPrefix(pathname, p));
}

export function isSubjectOfficerWorkforceAssignmentPage(pathname: string): boolean {
  return SUBJECT_OFFICER_WORKFORCE_ASSIGNMENT_PATHS.some((p) => matchesPathPrefix(pathname, p));
}

export function isWorkforceNavSectionId(sectionId: string): boolean {
  return (WORKFORCE_NAV_SECTION_IDS as readonly string[]).includes(sectionId);
}
