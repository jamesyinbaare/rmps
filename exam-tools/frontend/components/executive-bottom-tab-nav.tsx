"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  EXECUTIVE_CENTRES_HREF,
  EXECUTIVE_EXAM_ID_PARAM,
  EXECUTIVE_MONITORING_HREF,
  executiveMonitoringHref,
  readExecutiveSelectedExamId,
} from "@/lib/executive-selected-examination";
import { parseMonitoringExamIdFromUrl } from "@/lib/monitoring-access";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background";

export {
  EXECUTIVE_CENTRES_HREF,
  EXECUTIVE_MONITORING_HREF,
} from "@/lib/executive-selected-examination";

type TabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

const TABS: TabItem[] = [
  {
    href: EXECUTIVE_MONITORING_HREF,
    label: "Home",
    icon: Home,
    isActive: (pathname) => pathname === EXECUTIVE_MONITORING_HREF,
  },
  {
    href: EXECUTIVE_CENTRES_HREF,
    label: "Centres",
    icon: Building2,
    isActive: (pathname) => pathname === EXECUTIVE_CENTRES_HREF,
  },
];

function tabHref(base: string, rawExamIdFromUrl: string | null): string {
  return executiveMonitoringHref(base, rawExamIdFromUrl);
}

export function ExecutiveBottomTabNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawExamIdFromUrl = searchParams.get(EXECUTIVE_EXAM_ID_PARAM);
  const resolvedExamId =
    parseMonitoringExamIdFromUrl(rawExamIdFromUrl) ?? readExecutiveSelectedExamId();
  const rawForHref =
    rawExamIdFromUrl ??
    (resolvedExamId != null ? String(resolvedExamId) : null);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      aria-label="Executive sections"
    >
      <div
        className="mx-auto flex max-w-6xl pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        role="tablist"
      >
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          const href = tabHref(tab.href, rawForHref);
          return (
            <Link
              key={tab.href}
              href={href}
              role="tab"
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium transition-colors",
                active
                  ? "border-t-2 border-primary text-primary"
                  : "border-t-2 border-transparent text-muted-foreground hover:text-foreground",
                inputFocusRing,
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
