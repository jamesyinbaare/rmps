import { cn } from "@/lib/utils";

export const OFFICIAL_ACCOUNTS_ADMIN_HREF = "/dashboard/admin/exam-officials";
export const OFFICIAL_ACCOUNTS_INSPECTOR_HREF = "/dashboard/inspector/exam-officials";

export const OFFICIAL_ACCOUNTS_PATHS = [
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
  OFFICIAL_ACCOUNTS_INSPECTOR_HREF,
] as const;

export const OFFICIAL_ACCOUNTS_ZONE_ATTR = {
  "data-zone": "official-accounts",
} as const;

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

export const officialAccountsPanelToolbarClass =
  "flex flex-col gap-4 border-b border-border bg-muted/20 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:px-5 sm:py-5";

export const officialAccountsPanelFooterClass =
  "flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/10 px-4 py-3 text-sm sm:px-5";

export const officialAccountsBtnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export const officialAccountsBtnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

export function formatOfficialAccountsRecordLabel(count: number, busy?: boolean): string {
  if (busy) return "Updating records…";
  if (count === 0) return "No records";
  return `${count.toLocaleString()} record${count === 1 ? "" : "s"}`;
}
