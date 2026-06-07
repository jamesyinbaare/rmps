"use client";

import type { InvitationStatusCounts, InvitationStatusFilter } from "@/components/examiner-invitations/types";
import { cn } from "@/lib/utils";

const STATUS_TABS: { value: InvitationStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
];

const STATUS_TONE: Record<InvitationStatusFilter, string> = {
  all: "border-border bg-muted/40 text-foreground",
  pending:
    "border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  accepted:
    "border-emerald-300/60 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
  declined:
    "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
  expired: "border-border bg-muted/60 text-muted-foreground",
};

type Props = {
  active: InvitationStatusFilter;
  counts: InvitationStatusCounts;
  onChange: (status: InvitationStatusFilter) => void;
};

export function InvitationsStatusTabs({ active, counts, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-xl border border-primary/10 bg-primary/[0.035] p-1.5 dark:border-border dark:bg-muted/30"
      role="tablist"
      aria-label="Invitation status filter"
    >
      {STATUS_TABS.map((tab) => {
        const isActive = active === tab.value;
        const count = tab.value === "all" ? counts.total : counts[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex min-w-[4.5rem] flex-col items-center rounded-lg border px-3 py-2 text-center transition-colors sm:min-w-0 sm:flex-row sm:gap-2 sm:px-3 sm:py-1.5",
              isActive ? STATUS_TONE[tab.value] : "border-transparent text-muted-foreground hover:bg-background/80",
            )}
            onClick={() => onChange(tab.value)}
          >
            <span className="text-xs font-semibold sm:text-sm">{tab.label}</span>
            <span
              className={cn(
                "tabular-nums text-lg font-bold leading-none sm:text-sm",
                isActive ? "" : "text-foreground/80",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
