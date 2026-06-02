"use client";

import { FinanceNavSection } from "@/components/finance-nav-section";

type Props = {
  pathname: string;
  onNavigate?: () => void;
};

export function FinanceSidebar({ pathname, onNavigate }: Props) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 pb-6" aria-label="Finance">
      <FinanceNavSection pathname={pathname} onNavigate={onNavigate} showOverview />
    </nav>
  );
}
