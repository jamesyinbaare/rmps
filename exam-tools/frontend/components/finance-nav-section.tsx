"use client";

import { FinanceNavCollapsibleGroup } from "@/components/finance-nav-collapsible-group";
import { FinanceNavLink } from "@/components/finance-nav-link";
import { useFinanceSidebarCollapsed } from "@/components/finance-sidebar-context";
import {
  FINANCE_NAV_SECTIONS,
  FINANCE_OVERVIEW_ITEM,
  financeNavActive,
  type FinanceNavItem,
} from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

type Props = {
  pathname: string;
  onNavigate?: () => void;
  prependItems?: FinanceNavItem[];
  showOverview?: boolean;
};

export function FinanceNavSection({
  pathname,
  onNavigate,
  prependItems = [],
  showOverview = false,
}: Props) {
  const collapsed = useFinanceSidebarCollapsed();
  const hasTopItems = showOverview || prependItems.length > 0;

  return (
    <>
      {!collapsed && showOverview ? (
        <FinanceNavLink
          item={FINANCE_OVERVIEW_ITEM}
          active={financeNavActive(pathname, FINANCE_OVERVIEW_ITEM.href)}
          onNavigate={onNavigate}
        />
      ) : null}

      {!collapsed && prependItems.length > 0 ? (
        <div
          className={cn(
            "space-y-0.5",
            showOverview && "mt-3",
          )}
        >
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

      <div
        className={cn(
          collapsed ? "flex flex-col items-center gap-1" : "space-y-1",
          !collapsed && hasTopItems && "mt-3",
        )}
      >
        {FINANCE_NAV_SECTIONS.map((section) => (
          <FinanceNavCollapsibleGroup
            key={section.id}
            heading={section.heading}
            sectionIcon={section.icon}
            items={section.items}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </>
  );
}
