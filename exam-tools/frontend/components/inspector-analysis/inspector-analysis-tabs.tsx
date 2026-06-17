"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { INSPECTOR_ANALYSIS_HREF, INSPECTOR_PAY_VARIANCE_HREF } from "@/lib/finance-nav";
import { cn } from "@/lib/utils";

const TABS = [
  { href: INSPECTOR_ANALYSIS_HREF, label: "Staffing" },
  { href: INSPECTOR_PAY_VARIANCE_HREF, label: "Pay variance" },
] as const;

export function InspectorAnalysisTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1"
      aria-label="Inspector report views"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const href = query ? `${tab.href}?${query}` : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
