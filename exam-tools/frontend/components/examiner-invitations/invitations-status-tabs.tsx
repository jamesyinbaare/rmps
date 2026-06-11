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
      className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-border/60 px-2 py-1.5 sm:px-3"
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
              "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors sm:text-sm",
              isActive ? STATUS_TONE[tab.value] : "border-transparent text-muted-foreground hover:bg-muted/50",
            )}
            onClick={() => onChange(tab.value)}
          >
            <span className="font-medium">{tab.label}</span>
            <span className={cn("tabular-nums font-semibold", !isActive && "text-foreground/70")}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
