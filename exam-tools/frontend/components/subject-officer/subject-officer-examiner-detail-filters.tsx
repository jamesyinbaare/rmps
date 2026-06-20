"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { MultiSelectCheckboxDropdown } from "@/components/multi-select-checkbox-dropdown";
import { cn } from "@/lib/utils";

const multiSelectCompactTrigger = "!mt-0.5 h-9 min-h-9 py-1.5";

type Props = {
  idPrefix: string;
  regionOptions: MultiSelectCheckboxOption[];
  roleOptions: MultiSelectCheckboxOption[];
  regionFilter: string[];
  roleFilter: string[];
  onRegionFilterChange: (values: string[]) => void;
  onRoleFilterChange: (values: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function SubjectOfficerExaminerDetailFilters({
  idPrefix,
  regionOptions,
  roleOptions,
  regionFilter,
  roleFilter,
  onRegionFilterChange,
  onRoleFilterChange,
  disabled = false,
  className,
}: Props) {
  const [detailSearch, setDetailSearch] = useState(false);
  const activeFilterCount = regionFilter.length + roleFilter.length;

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        onClick={() => setDetailSearch((open) => !open)}
        aria-expanded={detailSearch}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {detailSearch ? "Hide filters" : "Show filters"}
        {!detailSearch && activeFilterCount > 0 ? (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
      {detailSearch ? (
        <div className="grid grid-cols-1 gap-2">
          <MultiSelectCheckboxDropdown
            id={`${idPrefix}-region`}
            label="Region"
            options={regionOptions}
            selected={regionFilter}
            onChange={onRegionFilterChange}
            allLabel="All regions"
            disabled={disabled || regionOptions.length === 0}
            triggerClassName={multiSelectCompactTrigger}
          />
          <MultiSelectCheckboxDropdown
            id={`${idPrefix}-role`}
            label="Role"
            options={roleOptions}
            selected={roleFilter}
            onChange={onRoleFilterChange}
            allLabel="All roles"
            disabled={disabled || roleOptions.length === 0}
            triggerClassName={multiSelectCompactTrigger}
          />
        </div>
      ) : null}
    </div>
  );
}
