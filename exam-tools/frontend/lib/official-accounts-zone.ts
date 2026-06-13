import { cn } from "@/lib/utils";

export const OFFICIAL_ACCOUNTS_ADMIN_HREF = "/dashboard/admin/exam-officials";
export const OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF = "/dashboard/admin/centre-summary";
export const BANK_ACCOUNTS_LABEL = "Bank Accounts";
export const ACCOUNT_DETAILS_BY_CENTRE_LABEL = "Bank accounts by Centre";
export const OFFICIAL_ACCOUNTS_STATISTICS_HREF = "/dashboard/admin/official-statistics";
export const OFFICIAL_ACCOUNTS_INSPECTOR_HREF = "/dashboard/inspector/exam-officials";
export const OFFICIAL_ACCOUNTS_INSPECTOR_ATTENDANCE_HREF = "/dashboard/inspector/attendance-sheets";
export const EXAMINER_PAYOUTS_HREF = "/dashboard/admin/examiner-payouts";
export const EXAMINER_ATTENDANCE_HREF = "/dashboard/admin/examiner-attendance";
/** @deprecated Use EXAMINER_ACCOUNTS_BY_SUBJECT_HREF */
export const EXAMINERS_BY_SUBJECT_HREF = "/dashboard/admin/examiners-by-subject";
export const EXAMINER_ACCOUNTS_BY_SUBJECT_HREF = "/dashboard/admin/examiner-accounts-by-subject";
export const EXAMINER_BANK_ACCOUNTS_LABEL = "Examiner bank accounts";
export const EXAMINER_ACCOUNTS_BY_SUBJECT_LABEL = "Bank accounts by subject";

export function buildExaminerAccountsBySubjectHref(params: {
  examId: number;
  subjectId?: string;
  region?: string;
  role?: string;
}): string {
  const p = new URLSearchParams();
  p.set("exam", String(params.examId));
  if (params.subjectId?.trim()) p.set("subject", params.subjectId.trim());
  if (params.region?.trim()) p.set("region", params.region.trim());
  if (params.role?.trim()) p.set("role", params.role.trim());
  return `${EXAMINER_ACCOUNTS_BY_SUBJECT_HREF}?${p.toString()}`;
}

export const OFFICIAL_ACCOUNTS_PATHS = [
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
  OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF,
  OFFICIAL_ACCOUNTS_STATISTICS_HREF,
  OFFICIAL_ACCOUNTS_INSPECTOR_HREF,
  OFFICIAL_ACCOUNTS_INSPECTOR_ATTENDANCE_HREF,
  EXAMINER_PAYOUTS_HREF,
  EXAMINER_ATTENDANCE_HREF,
  EXAMINERS_BY_SUBJECT_HREF,
  EXAMINER_ACCOUNTS_BY_SUBJECT_HREF,
] as const;

export const OFFICIAL_ACCOUNTS_ZONE_ATTR = {
  "data-zone": "official-accounts",
} as const;

/** Nav card for the main bank-accounts entry only (not bank accounts by centre or other finance links). */
export function isOfficialAccountsHref(href: string): boolean {
  return href === OFFICIAL_ACCOUNTS_ADMIN_HREF || href === OFFICIAL_ACCOUNTS_INSPECTOR_HREF;
}

export function isOfficialAccountsPath(pathname: string): boolean {
  return OFFICIAL_ACCOUNTS_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/** Main content panel — subtle green top edge marks the allowances workspace. */
export const officialAccountsPanelClass = cn(
  "official-accounts-panel relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-success/70 before:content-['']",
);

/** Page shell under role tabs — fills main column height. */
export const officialAccountsPageLayoutClass = "flex min-h-0 flex-1 flex-col";

/** Card that grows to fill remaining viewport; content scrolls inside. */
export const officialAccountsPanelFillClass = cn(
  officialAccountsPanelClass,
  "flex min-h-0 flex-1 flex-col overflow-hidden",
);

/** Tab panel body — sits below page-level role tabs. */
export const officialAccountsTabPanelClass =
  "official-accounts-tab-panel flex min-h-0 flex-1 flex-col overflow-hidden";

/** Table block: toolbar fixed, body scrolls, footer pinned. */
export const officialAccountsTableLayoutClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

export const officialAccountsTableScrollClass = "min-h-0 flex-1 overflow-auto overscroll-contain";

/** Table on pages that scroll with the main column (no nested vertical scroll). */
export const officialAccountsTablePageScrollClass = "scrollbar-hide overflow-x-auto";
export const officialAccountsTablePageLayoutClass = "flex flex-col";

export const officialAccountsPanelToolbarClass =
  "flex flex-col gap-4 border-b border-border bg-muted/20 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:px-5 sm:py-5";

/** Command bar above the data table (exam, scope, search, actions). */
export const officialAccountsCommandBarClass =
  "flex shrink-0 flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3.5 sm:px-5 sm:py-4";

export const officialAccountsCommandBarRowClass =
  "flex flex-wrap items-center gap-3";

export const officialAccountsCommandBarControlClass =
  "block min-h-10 max-w-full rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export const officialAccountsCommandBarSearchClass =
  "block min-h-10 w-full min-w-[12rem] flex-1 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 md:min-w-[16rem] lg:max-w-md";

export const officialAccountsPanelFooterClass =
  "flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 px-4 py-3 text-sm sm:px-5";

export const officialAccountsBtnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export const officialAccountsBtnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

/** Toolbar actions — same touch target as form controls, slightly less horizontal padding. */
export const officialAccountsBtnPrimaryToolbar =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export const officialAccountsBtnSecondaryToolbar =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export function formatOfficialAccountsRecordLabel(count: number, busy?: boolean): string {
  if (busy) return "Updating records…";
  if (count === 0) return "No records";
  return `${count.toLocaleString()} record${count === 1 ? "" : "s"}`;
}
