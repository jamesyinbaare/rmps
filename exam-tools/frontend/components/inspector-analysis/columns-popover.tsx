"use client";

import { Columns3 } from "lucide-react";
import { useState } from "react";

import type { Table, VisibilityState } from "@tanstack/react-table";

import { INPUT_FOCUS_RING } from "@/components/examiners/constants";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inspectorColumnToggleLabel } from "@/lib/inspector-analysis-table-columns";
import { cn } from "@/lib/utils";

type Props<TData> = {
  table: Table<TData>;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  disabled?: boolean;
};

export function InspectorColumnsPopover<TData>({
  table,
  columnVisibility,
  onColumnVisibilityChange,
  disabled = false,
}: Props<TData>) {
  const [open, setOpen] = useState(false);

  const hideable = table
    .getAllLeafColumns()
    .filter((col) => col.getCanHide() && col.id !== "centre");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={disabled}>
          <Columns3 className="size-4" aria-hidden />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Show columns</p>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {hideable.map((col) => (
            <label key={col.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={cn("size-4 shrink-0 rounded border-border", INPUT_FOCUS_RING)}
                checked={columnVisibility[col.id] !== false}
                onChange={(e) =>
                  onColumnVisibilityChange({ ...columnVisibility, [col.id]: e.target.checked })
                }
              />
              {inspectorColumnToggleLabel(col.id)}
            </label>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => onColumnVisibilityChange({})}
          >
            Show all columns
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
