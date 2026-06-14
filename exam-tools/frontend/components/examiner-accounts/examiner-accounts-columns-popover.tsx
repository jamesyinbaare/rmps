"use client";

import { Columns3 } from "lucide-react";
import { useState } from "react";

import type { VisibilityState } from "@tanstack/react-table";

import { INPUT_FOCUS_RING } from "@/components/examiners/constants";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS,
  EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY,
} from "@/lib/examiner-accounts-table-columns";
import { cn } from "@/lib/utils";

type Props = {
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  disabled?: boolean;
  /** Hide Subjects toggle when viewing a single subject. */
  hideSubjectsToggle?: boolean;
};

export function ExaminerAccountsColumnsPopover({
  columnVisibility,
  onColumnVisibilityChange,
  disabled,
  hideSubjectsToggle,
}: Props) {
  const [open, setOpen] = useState(false);
  const options = EXAMINER_ACCOUNTS_COLUMN_TOGGLE_OPTIONS.filter(
    (col) => !(hideSubjectsToggle && col.id === "subjects"),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={disabled}>
          <Columns3 className="size-4" aria-hidden />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Show columns</p>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {options.map((col) => (
            <label key={col.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={cn("size-4 shrink-0 rounded border-border", INPUT_FOCUS_RING)}
                checked={columnVisibility[col.id] !== false}
                onChange={(e) =>
                  onColumnVisibilityChange({ ...columnVisibility, [col.id]: e.target.checked })
                }
              />
              {col.label}
            </label>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => onColumnVisibilityChange(EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY)}
          >
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
