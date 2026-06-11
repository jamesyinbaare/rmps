"use client";

import { Filter } from "lucide-react";
import { useState } from "react";

import { INPUT_FOCUS_RING } from "@/components/examiners/constants";
import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

type Props = {
  subjectTypeFilter: ScriptControlSubjectTypeFilter;
  onSubjectTypeFilterChange: (value: ScriptControlSubjectTypeFilter) => void;
  subjectOptions: MultiSelectCheckboxOption[];
  subjectFilter: string[];
  onSubjectFilterChange: (values: string[]) => void;
  roleOptions: MultiSelectCheckboxOption[];
  roleFilter: string[];
  onRoleFilterChange: (values: string[]) => void;
  regionOptions: MultiSelectCheckboxOption[];
  regionFilter: string[];
  onRegionFilterChange: (values: string[]) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  disabled?: boolean;
};

export function RosterFiltersPopover({
  subjectTypeFilter,
  onSubjectTypeFilterChange,
  subjectOptions,
  subjectFilter,
  onSubjectFilterChange,
  roleOptions,
  roleFilter,
  onRoleFilterChange,
  regionOptions,
  regionFilter,
  onRegionFilterChange,
  activeFilterCount,
  onClearFilters,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-lg border border-input-border bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted",
            INPUT_FOCUS_RING,
            disabled && "pointer-events-none opacity-60",
          )}
          aria-expanded={open}
          disabled={disabled}
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
            <label className={formLabelClass} htmlFor="roster-popover-subject-type">
              Subject type
            </label>
            <select
              id="roster-popover-subject-type"
              className={cn(formInputClass, "mt-1.5 w-full")}
              value={subjectTypeFilter}
              onChange={(e) => onSubjectTypeFilterChange(e.target.value as ScriptControlSubjectTypeFilter)}
            >
              {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <MultiSelectCheckboxDropdown
            id="roster-popover-subject"
            label="Subject"
            options={subjectOptions}
            selected={subjectFilter}
            onChange={onSubjectFilterChange}
            allLabel="All subjects"
          />
          <MultiSelectCheckboxDropdown
            id="roster-popover-role"
            label="Role type"
            options={roleOptions}
            selected={roleFilter}
            onChange={onRoleFilterChange}
            allLabel="All roles"
          />
          <MultiSelectCheckboxDropdown
            id="roster-popover-region"
            label="Region"
            options={regionOptions}
            selected={regionFilter}
            onChange={onRegionFilterChange}
            allLabel="All regions"
          />
          {activeFilterCount > 0 ? (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => {
                  onClearFilters();
                  setOpen(false);
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
