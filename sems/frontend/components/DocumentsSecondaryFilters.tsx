"use client";

import { ListFilter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DocumentsSecondaryFiltersProps {
  testType?: string;
  testTypeChanged?: boolean;
  recentActive: boolean;
  onTestTypeChange: (value: string | undefined) => void;
  onTestTypeChangedToggle: () => void;
  onRecentToggle: () => void;
  onClear: () => void;
}

export function DocumentsSecondaryFilters({
  testType,
  testTypeChanged,
  recentActive,
  onTestTypeChange,
  onTestTypeChangedToggle,
  onRecentToggle,
  onClear,
}: DocumentsSecondaryFiltersProps) {
  const activeCount =
    (testType ? 1 : 0) + (testTypeChanged ? 1 : 0) + (recentActive ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          aria-label={
            activeCount > 0
              ? `More filters, ${activeCount} active`
              : "More filters"
          }
        >
          <ListFilter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span
              className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background"
              )}
            >
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">More filters</p>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onClear}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="documents-paper-filter" className="text-xs text-muted-foreground">
            Paper
          </Label>
          <Select
            value={testType ?? "all"}
            onValueChange={(value) =>
              onTestTypeChange(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger id="documents-paper-filter" size="sm" className="h-8 w-full">
              <SelectValue placeholder="Paper" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All papers</SelectItem>
              <SelectItem value="1">Objectives</SelectItem>
              <SelectItem value="2">Essay</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Quick toggles</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant={testTypeChanged ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={onTestTypeChangedToggle}
              title="Show only sheets whose paper was changed via Advanced Edit"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Changed
            </Button>
            <Button
              type="button"
              variant={recentActive ? "secondary" : "outline"}
              size="sm"
              className="h-8"
              onClick={onRecentToggle}
            >
              Recents
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
