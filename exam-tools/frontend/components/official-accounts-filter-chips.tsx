"use client";

import { X } from "lucide-react";

import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export type OfficialAccountsFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  chips: OfficialAccountsFilterChip[];
  onClearAll: () => void;
  className?: string;
  /** inline = inside command bar; default = full-width band */
  variant?: "band" | "inline";
};

export function OfficialAccountsFilterChips({
  chips,
  onClearAll,
  className,
  variant = "band",
}: Props) {
  if (chips.length === 0) return null;

  return (
    <div
      className={cn(
        variant === "inline"
          ? "flex flex-wrap items-center gap-2 overflow-x-auto overscroll-x-contain border-t border-border/50 pt-2"
          : "flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/5 px-4 py-2.5 sm:px-5",
        className,
      )}
      aria-label="Active filters"
    >
      <span className="text-xs font-medium text-muted-foreground">
        {variant === "band" ? "Filters:" : "Active:"}
      </span>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-3 pr-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={chip.onRemove}
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span className="truncate">{chip.label}</span>
          <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        className={cn(
          officialAccountsBtnSecondary,
          variant === "band" && "min-h-8 px-2.5 py-1 text-xs",
        )}
        onClick={onClearAll}
      >
        Clear filters
      </button>
    </div>
  );
}
