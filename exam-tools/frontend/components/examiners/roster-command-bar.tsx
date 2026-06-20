"use client";

import { Columns3 } from "lucide-react";
import { useState } from "react";

import type { VisibilityState } from "@tanstack/react-table";

import {
  EXAMINERS_COMMAND_BAR_CLASS,
  EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS,
  INPUT_FOCUS_RING,
  ROSTER_COLUMN_TOGGLE_OPTIONS,
  ROSTER_DEFAULT_COLUMN_VISIBILITY,
  SO_MOBILE_COMMAND_BAR,
} from "@/components/examiners/constants";
import { RosterFiltersPopover } from "@/components/examiners/roster-filters-popover";
import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { OfficialAccountsFilterChips, type OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  officialAccountsBtnPrimary,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
} from "@/lib/official-accounts-zone";
import type { ScriptControlSubjectTypeFilter } from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

type Props = {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchDisabled?: boolean;
  subjectTypeFilter: ScriptControlSubjectTypeFilter;
  onSubjectTypeFilterChange: (value: ScriptControlSubjectTypeFilter) => void;
  roleOptions: MultiSelectCheckboxOption[];
  roleFilter: string[];
  onRoleFilterChange: (values: string[]) => void;
  regionOptions: MultiSelectCheckboxOption[];
  regionFilter: string[];
  onRegionFilterChange: (values: string[]) => void;
  subjectOptions: MultiSelectCheckboxOption[];
  subjectFilter: string[];
  onSubjectFilterChange: (values: string[]) => void;
  activeFilterCount: number;
  filterChips: OfficialAccountsFilterChip[];
  onClearFilters: () => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  selectedCount: number;
  filteredCount: number;
  onSendSms: () => void;
  onAdd: () => void;
  onBulkUpload?: () => void;
  showBulkUpload: boolean;
  canManageRoster?: boolean;
  onConfigureReferenceCodes?: () => void;
  showReferenceCodesConfig?: boolean;
  showQuotaStatusView?: boolean;
  onViewQuotas?: () => void;
  quotaStatusDisabled?: boolean;
  busy: boolean;
  disabled?: boolean;
  embedded?: boolean;
  hideSubjectScopeFilters?: boolean;
  mobileContactLayout?: boolean;
};

export function RosterCommandBar({
  searchQuery,
  onSearchQueryChange,
  searchDisabled,
  subjectTypeFilter,
  onSubjectTypeFilterChange,
  roleOptions,
  roleFilter,
  onRoleFilterChange,
  regionOptions,
  regionFilter,
  onRegionFilterChange,
  subjectOptions,
  subjectFilter,
  onSubjectFilterChange,
  activeFilterCount,
  filterChips,
  onClearFilters,
  columnVisibility,
  onColumnVisibilityChange,
  selectedCount,
  filteredCount,
  onSendSms,
  onAdd,
  onBulkUpload,
  showBulkUpload,
  canManageRoster = true,
  onConfigureReferenceCodes,
  showReferenceCodesConfig = false,
  onViewQuotas,
  showQuotaStatusView = false,
  quotaStatusDisabled = false,
  busy,
  disabled,
  embedded = false,
  hideSubjectScopeFilters = false,
  mobileContactLayout = false,
}: Props) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const actionsDisabled = disabled || busy;

  const smsLabel =
    selectedCount > 0
      ? `Send SMS (${selectedCount})`
      : filteredCount > 0
        ? `Send SMS (${filteredCount})`
        : "Send SMS";

  return (
    <div
      className={cn(
        embedded ? EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS : EXAMINERS_COMMAND_BAR_CLASS,
        mobileContactLayout && SO_MOBILE_COMMAND_BAR,
        mobileContactLayout && "sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
      )}
    >
      <div
        className={cn(
          officialAccountsCommandBarRowClass,
          "flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <input
          id="roster-search"
          type="search"
          aria-label="Search examiners"
          className={cn(
            officialAccountsCommandBarSearchClass,
            "w-full min-w-0 sm:max-w-xs md:max-w-sm lg:max-w-md",
            searchDisabled && "opacity-60",
          )}
          placeholder="Search code, name, or phone…"
          value={searchQuery}
          disabled={searchDisabled || busy}
          onChange={(e) => onSearchQueryChange(e.target.value)}
        />
        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto"
          role="toolbar"
          aria-label="Roster actions"
        >
          <RosterFiltersPopover
            subjectTypeFilter={subjectTypeFilter}
            onSubjectTypeFilterChange={onSubjectTypeFilterChange}
            subjectOptions={subjectOptions}
            subjectFilter={subjectFilter}
            onSubjectFilterChange={onSubjectFilterChange}
            roleOptions={roleOptions}
            roleFilter={roleFilter}
            onRoleFilterChange={onRoleFilterChange}
            regionOptions={regionOptions}
            regionFilter={regionFilter}
            onRegionFilterChange={onRegionFilterChange}
            activeFilterCount={activeFilterCount}
            onClearFilters={onClearFilters}
            disabled={actionsDisabled}
            hideSubjectScopeFilters={hideSubjectScopeFilters}
          />
          <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("gap-1.5", mobileContactLayout && "hidden md:inline-flex")}
                disabled={actionsDisabled}
              >
                <Columns3 className="size-4" aria-hidden />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Show columns</p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {ROSTER_COLUMN_TOGGLE_OPTIONS.map((col) => (
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
                  onClick={() => onColumnVisibilityChange(ROSTER_DEFAULT_COLUMN_VISIBILITY)}
                >
                  Reset to default
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <Button type="button" size="sm" variant="outline" disabled={actionsDisabled || filteredCount === 0} onClick={onSendSms}>
            {smsLabel}
          </Button>
          {showReferenceCodesConfig && onConfigureReferenceCodes ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionsDisabled}
              onClick={onConfigureReferenceCodes}
            >
              Reference codes
            </Button>
          ) : null}
          {showQuotaStatusView && onViewQuotas ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionsDisabled || quotaStatusDisabled}
              onClick={onViewQuotas}
            >
              View quotas
            </Button>
          ) : null}
          {canManageRoster && showBulkUpload && onBulkUpload ? (
            <Button type="button" size="sm" variant="outline" disabled={actionsDisabled} onClick={onBulkUpload}>
              Bulk upload
            </Button>
          ) : null}
          {canManageRoster ? (
            <button type="button" className={officialAccountsBtnPrimary} disabled={actionsDisabled} onClick={onAdd}>
              Add examiner
            </button>
          ) : null}
        </div>
      </div>
      <OfficialAccountsFilterChips chips={filterChips} onClearAll={onClearFilters} variant="inline" />
    </div>
  );
}
