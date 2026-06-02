"use client";

import {
  BarChart3,
  ClipboardList,
  Coins,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { getMe, type UserMe } from "@/lib/auth";
import { FINANCE_NAV_GROUPS } from "@/lib/finance-nav";
import { officialAccountsPanelClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const GROUP_ACCENT: Record<
  string,
  { icon: LucideIcon; iconWrap: string; cardBorder: string }
> = {
  "Account details": {
    icon: Landmark,
    iconWrap: "bg-success/15 text-success",
    cardBorder: "border-success/20 bg-success/[0.04]",
  },
  "Centre reporting": {
    icon: BarChart3,
    iconWrap: "bg-primary/10 text-primary",
    cardBorder: "border-primary/15 bg-primary/[0.03]",
  },
  Compliance: {
    icon: ClipboardList,
    iconWrap: "bg-warning/20 text-warning-foreground",
    cardBorder: "border-warning/25 bg-warning/[0.06]",
  },
  Setup: {
    icon: Coins,
    iconWrap: "bg-muted text-muted-foreground",
    cardBorder: "border-border bg-muted/20",
  },
};

export function FinanceOfficerHome() {
  const [me, setMe] = useState<UserMe | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === null) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section
        className={cn(
          officialAccountsPanelClass,
          "bg-gradient-to-br from-success/[0.07] via-card to-card p-6 sm:p-8",
        )}
      >
        <div className="flex gap-4 sm:gap-5">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success shadow-sm ring-1 ring-success/20 sm:size-14"
            aria-hidden
          >
            <Landmark className="size-6 sm:size-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {me.full_name ? `Welcome, ${me.full_name}` : "Finance workspace"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Choose a section from the menu on the left. Pick an examination on each page when
              you need exam-specific data.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="finance-sections-heading">
        <h3
          id="finance-sections-heading"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Sections in the menu
        </h3>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {FINANCE_NAV_GROUPS.map((group) => {
            const accent = GROUP_ACCENT[group.heading] ?? GROUP_ACCENT.Setup;
            const Icon = accent.icon;
            return (
              <li
                key={group.heading}
                className={cn(
                  "rounded-xl border p-4 shadow-sm",
                  accent.cardBorder,
                )}
              >
                <div className="flex gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      accent.iconWrap,
                    )}
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{group.heading}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {group.items.map((item) => item.label).join(" · ")}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
