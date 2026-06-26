"use client";

import { EXAMINER_PAYOUT_VIEW_OPTIONS, type ExaminerPayoutView } from "@/lib/examiner-payout-view";
import { officialAccountsPayoutSegmentedClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  value: ExaminerPayoutView;
  onChange: (view: ExaminerPayoutView) => void;
  disabled?: boolean;
  className?: string;
};

export function ExaminerPayoutViewSegmented({ value, onChange, disabled, className }: Props) {
  return (
    <div
      className={cn(officialAccountsPayoutSegmentedClass, className)}
      role="group"
      aria-label="Payout view"
    >
      {EXAMINER_PAYOUT_VIEW_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
