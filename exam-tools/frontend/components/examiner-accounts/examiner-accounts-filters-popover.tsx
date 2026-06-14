"use client";

import Link from "next/link";
import { Filter } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formLabelClass } from "@/lib/form-classes";
import {
  officialAccountsBtnSecondary,
  officialAccountsBtnSecondaryToolbar,
  officialAccountsCommandBarControlClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  regionFilter: string;
  onRegionChange: (region: string) => void;
  subjectSummaryHref: string | null;
  activeFilterCount: number;
  onClearFilters: () => void;
  sectionId: string;
};

export function ExaminerAccountsFiltersPopover({
  regionFilter,
  onRegionChange,
  subjectSummaryHref,
  activeFilterCount,
  onClearFilters,
  sectionId,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            officialAccountsBtnSecondaryToolbar,
            "inline-flex items-center gap-2",
          )}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Filter className="size-4 shrink-0" aria-hidden />
          Filters
          {activeFilterCount > 0 ? (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(100vw-2rem,22rem)] p-4">
        <div className="flex flex-col gap-4">
          <div>
            <label className={formLabelClass} htmlFor={`examiner-accounts-region-${sectionId}`}>
              Region
            </label>
            <select
              id={`examiner-accounts-region-${sectionId}`}
              className={cn(officialAccountsCommandBarControlClass, "mt-1.5 w-full")}
              value={regionFilter}
              onChange={(e) => onRegionChange(e.target.value)}
            >
              <option value="">All regions</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {subjectSummaryHref ? (
            <Link
              href={subjectSummaryHref}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => setOpen(false)}
            >
              Open bank accounts by subject →
            </Link>
          ) : null}
          {activeFilterCount > 0 ? (
            <div className="border-t border-border pt-3">
              <button type="button" className={officialAccountsBtnSecondary} onClick={onClearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
