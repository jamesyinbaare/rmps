"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  onClearSelection: () => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function ExaminersSelectionBar({
  selectedCount,
  onClearSelection,
  children,
  disabled = false,
  className,
}: Props) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2",
        className,
      )}
      role="region"
      aria-label="Selection actions"
    >
      <span className="text-sm font-medium text-foreground" aria-live="polite">
        {selectedCount} selected
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto gap-1 text-muted-foreground"
        disabled={disabled}
        onClick={onClearSelection}
      >
        <X className="size-4" aria-hidden />
        Clear
      </Button>
    </div>
  );
}
