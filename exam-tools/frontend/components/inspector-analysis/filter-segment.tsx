"use client";

import { cn } from "@/lib/utils";

export type FilterSegmentOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  label: string;
  options: FilterSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function FilterSegment<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: Props<T>) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
        role="group"
        aria-label={ariaLabel ?? label}
      >
        {options.map((opt) => {
          const active = value === opt.value;
          const countLabel =
            opt.count != null ? ` (${opt.count.toLocaleString()})` : "";
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
              {countLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
