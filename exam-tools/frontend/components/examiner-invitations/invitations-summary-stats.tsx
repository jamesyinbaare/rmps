"use client";

import type { InvitationStatusCounts, InvitationStatusFilter } from "@/components/examiner-invitations/types";
import { cn } from "@/lib/utils";

const STAT_TONE: Partial<Record<InvitationStatusFilter, string>> = {
  pending: "border-amber-200/80 bg-amber-50/50 hover:bg-amber-50/80",
  accepted: "border-emerald-200/80 bg-emerald-50/50 hover:bg-emerald-50/80",
  declined: "border-red-200/80 bg-red-50/50 hover:bg-red-50/80",
  expired: "border-slate-200/80 bg-slate-50/50 hover:bg-slate-50/80",
};

const STATUS_DOT: Partial<Record<InvitationStatusFilter, string>> = {
  all: "bg-primary",
  pending: "bg-amber-500",
  accepted: "bg-emerald-500",
  declined: "bg-red-500",
  expired: "bg-slate-400",
};

type Props = {
  counts: InvitationStatusCounts;
  activeStatus: InvitationStatusFilter;
  onStatusClick: (status: InvitationStatusFilter) => void;
};

function statButtonClass(active: boolean, key: InvitationStatusFilter) {
  return cn(
    "shrink-0 snap-start rounded-xl border px-3.5 py-3 text-left transition-all",
    "min-w-[6.75rem] touch-manipulation sm:min-w-0",
    "active:scale-[0.98]",
    active
      ? "border-primary/50 bg-primary/5 shadow-sm ring-2 ring-primary/25"
      : cn("border-border bg-background dark:border-border dark:bg-background", STAT_TONE[key], "hover:bg-muted/40"),
  );
}

export function InvitationsSummaryStats({ counts, activeStatus, onStatusClick }: Props) {
  const items: { key: InvitationStatusFilter; label: string; value: number }[] = [
    { key: "all", label: "Total", value: counts.total },
    { key: "pending", label: "Pending", value: counts.pending },
    { key: "accepted", label: "Accepted", value: counts.accepted },
    { key: "declined", label: "Declined", value: counts.declined },
    { key: "expired", label: "Expired", value: counts.expired },
  ];

  const activeLabel = items.find((item) => item.key === activeStatus)?.label ?? "Total";

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground md:sr-only">
        Swipe sideways to browse invitation counts. Tap a card to filter by status.
      </p>

      <div className="relative -mx-2 sm:mx-0">
        <div
          className={cn(
            "flex gap-2 overflow-x-auto overscroll-x-contain px-2 pb-1",
            "snap-x snap-mandatory scrollbar-hide",
            "sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5",
          )}
          role="tablist"
          aria-label="Filter invitations by status"
        >
          {items.map((item) => {
            const active = activeStatus === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onStatusClick(item.key)}
                className={statButtonClass(active, item.key)}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[item.key] ?? "bg-muted-foreground")}
                    aria-hidden
                  />
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                </div>
                <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-foreground sm:text-xl">
                  {item.value.toLocaleString()}
                </p>
              </button>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent sm:hidden"
          aria-hidden
        />
      </div>

      <p className="text-xs text-muted-foreground md:hidden">
        Showing <span className="font-medium text-foreground">{activeLabel}</span>
        {activeStatus !== "all" ? (
          <>
            {" "}
            ·{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => onStatusClick("all")}
            >
              Show all
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
