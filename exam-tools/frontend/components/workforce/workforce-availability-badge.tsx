"use client";

import type { WorkforceAvailabilityStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

export const WORKFORCE_AVAILABILITY_LABEL: Record<WorkforceAvailabilityStatus, string> = {
  pending: "Awaiting response",
  confirmed: "Confirmed",
  declined: "Declined",
};

export const WORKFORCE_AVAILABILITY_TONE: Record<WorkforceAvailabilityStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  confirmed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  declined: "border-destructive/30 bg-destructive/10 text-destructive",
};

type Props = {
  status: WorkforceAvailabilityStatus;
  className?: string;
};

export function WorkforceAvailabilityBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        WORKFORCE_AVAILABILITY_TONE[status],
        className,
      )}
    >
      {WORKFORCE_AVAILABILITY_LABEL[status]}
    </span>
  );
}
