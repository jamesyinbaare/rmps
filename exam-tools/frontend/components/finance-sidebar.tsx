"use client";

import { Landmark } from "lucide-react";

import { PortalSidebar, PortalSidebarHeader } from "@/components/portal-sidebar";
import {
  FINANCE_NAV_SECTIONS,
  FINANCE_OVERVIEW_ITEM,
  financeNavActive,
} from "@/lib/finance-nav";

type Props = {
  pathname: string;
  onNavigate?: () => void;
};

export function FinanceSidebar({ pathname, onNavigate }: Props) {
  return (
    <PortalSidebar
      pathname={pathname}
      onNavigate={onNavigate}
      ariaLabel="Finance"
      overviewItem={FINANCE_OVERVIEW_ITEM}
      sections={FINANCE_NAV_SECTIONS}
      showOverview
      navActive={financeNavActive}
    />
  );
}

export function FinanceSidebarHeader({ isFinanceOfficer }: { isFinanceOfficer: boolean }) {
  return (
    <PortalSidebarHeader
      title="Finance"
      accent={isFinanceOfficer ? "finance" : "default"}
      collapsedIcon={Landmark}
    />
  );
}
