"use client";

import type { InvitationStatusCounts, InvitationStatusFilter } from "@/components/examiner-invitations/types";
import { cn } from "@/lib/utils";

const STAT_TONE: Partial<Record<InvitationStatusFilter, string>> = {
  pending: "border-amber-200/80 bg-amber-50/50 hover:bg-amber-50/80",
  accepted: "border-emerald-200/80 bg-emerald-50/50 hover:bg-emerald-50/80",
  declined: "border-red-200/80 bg-red-50/50 hover:bg-red-50/80",
  expired: "border-slate-200/80 bg-slate-50/50 hover:bg-slate-50/80",
};

type Props = {
  counts: InvitationStatusCounts;
  activeStatus: InvitationStatusFilter;
  onStatusClick: (status: InvitationStatusFilter) => void;
};

export function InvitationsSummaryStats({ counts, activeStatus, onStatusClick }: Props) {
  const items: { key: InvitationStatusFilter; label: string; value: number }[] = [
    { key: "all", label: "Total", value: counts.total },
    { key: "pending", label: "Pending", value: counts.pending },
    { key: "accepted", label: "Accepted", value: counts.accepted },
    { key: "declined", label: "Declined", value: counts.declined },
    { key: "expired", label: "Expired", value: counts.expired },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onStatusClick(item.key)}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-left transition-colors dark:hover:bg-muted/40",
            activeStatus === item.key
              ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
              : cn("border-border bg-background", STAT_TONE[item.key], "dark:border-border dark:bg-background"),
          )}
        >
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
        </button>
      ))}
    </div>
  );
}
