"use client";

import { FinanceNavLink } from "@/components/finance-nav-link";
import {
  FINANCE_NAV_GROUPS,
  FINANCE_OVERVIEW_ITEM,
  financeNavActive,
  type FinanceNavItem,
} from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

type Props = {
  pathname: string;
  onNavigate?: () => void;
  /** Shown above grouped links (e.g. bank directory for super admin). */
  prependItems?: FinanceNavItem[];
  showOverview?: boolean;
};

export function FinanceNavSection({
  pathname,
  onNavigate,
  prependItems = [],
  showOverview = false,
}: Props) {
  return (
    <>
      {showOverview ? (
        <FinanceNavLink
          item={FINANCE_OVERVIEW_ITEM}
          active={financeNavActive(pathname, FINANCE_OVERVIEW_ITEM.href)}
          onNavigate={onNavigate}
        />
      ) : null}

      {prependItems.length > 0 ? (
        <div className={cn(showOverview ? "mt-3" : undefined, "space-y-0.5")}>
          {prependItems.map((item) => (
            <FinanceNavLink
              key={item.href}
              item={item}
              active={financeNavActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}

      {FINANCE_NAV_GROUPS.map((group, groupIndex) => (
        <div
          key={group.heading}
          className={cn(
            groupIndex === 0 && !showOverview && prependItems.length === 0 ? "mt-0" : "mt-4",
            groupIndex === 0 && (showOverview || prependItems.length > 0) ? "mt-3" : undefined,
          )}
        >
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.heading}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <FinanceNavLink
                key={item.href}
                item={item}
                active={financeNavActive(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
