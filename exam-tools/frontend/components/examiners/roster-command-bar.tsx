"use client";

import { BarChart3, Columns3, Hash, MessageSquare, Upload } from "lucide-react";
import { useMemo, useState } from "react";

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
import { ExaminersAdminToolbar } from "@/components/examiners/toolbar/examiners-admin-toolbar";
import { ExaminersSelectionBar } from "@/components/examiners/toolbar/examiners-selection-bar";
import {
  ExaminersToolsMenu,
  type ExaminersToolsMenuSection,
} from "@/components/examiners/toolbar/examiners-tools-menu";
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
  sourceOptions: MultiSelectCheckboxOption[];
  sourceFilter: string[];
  onSourceFilterChange: (values: string[]) => void;
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
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
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
  adminToolbarLayout?: boolean;
};

function RosterColumnsPopover({
  columnVisibility,
  onColumnVisibilityChange,
  disabled,
  className,
}: {
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);

  return (
    <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={cn("gap-1.5", className)} disabled={disabled}>
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
                onChange={(e) => onColumnVisibilityChange({ ...columnVisibility, [col.id]: e.target.checked })}
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
  );
}

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
  sourceOptions,
  sourceFilter,
  onSourceFilterChange,
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
  onBulkDelete,
  onClearSelection,
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
  adminToolbarLayout = false,
}: Props) {
  const actionsDisabled = disabled || busy;

  const smsLabel =
    selectedCount > 0
      ? `Send SMS (${selectedCount})`
      : filteredCount > 0
        ? `Send SMS (${filteredCount})`
        : "Send SMS";

  const searchInput = (
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
  );

  const filtersPopover = (
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
      sourceOptions={sourceOptions}
      sourceFilter={sourceFilter}
      onSourceFilterChange={onSourceFilterChange}
      activeFilterCount={activeFilterCount}
      onClearFilters={onClearFilters}
      disabled={actionsDisabled}
      hideSubjectScopeFilters={hideSubjectScopeFilters}
    />
  );

  const filterChipsNode = (
    <OfficialAccountsFilterChips chips={filterChips} onClearAll={onClearFilters} variant="inline" />
  );

  const toolsSections = useMemo((): ExaminersToolsMenuSection[] => {
    if (!adminToolbarLayout) return [];

    const sections: ExaminersToolsMenuSection[] = [];

    if (selectedCount === 0) {
      sections.push({
        label: "Communications",
        items: [
          {
            key: "sms",
            label: smsLabel,
            icon: MessageSquare,
            disabled: filteredCount === 0,
          },
        ],
      });
    }

    const dataItems: ExaminersToolsMenuSection["items"] = [];
    if (showQuotaStatusView && onViewQuotas) {
      dataItems.push({
        key: "quotas",
        label: "View quotas",
        icon: BarChart3,
        disabled: quotaStatusDisabled,
      });
    }
    if (showReferenceCodesConfig && onConfigureReferenceCodes) {
      dataItems.push({
        key: "reference-codes",
        label: "Reference codes",
        icon: Hash,
      });
    }
    if (dataItems.length > 0) {
      sections.push({ label: "Data", items: dataItems });
    }

    if (canManageRoster && showBulkUpload && onBulkUpload) {
      sections.push({
        label: "Admin",
        items: [{ key: "bulk-upload", label: "Bulk upload", icon: Upload }],
      });
    }

    return sections;
  }, [
    adminToolbarLayout,
    canManageRoster,
    filteredCount,
    onBulkUpload,
    onConfigureReferenceCodes,
    onViewQuotas,
    quotaStatusDisabled,
    selectedCount,
    showBulkUpload,
    showQuotaStatusView,
    showReferenceCodesConfig,
    smsLabel,
  ]);

  function handleToolsSelect(key: string) {
    if (key === "sms") onSendSms();
    else if (key === "quotas") onViewQuotas?.();
    else if (key === "reference-codes") onConfigureReferenceCodes?.();
    else if (key === "bulk-upload") onBulkUpload?.();
  }

  if (adminToolbarLayout) {
    return (
      <ExaminersAdminToolbar
        embedded={embedded}
        mobileContactLayout={mobileContactLayout}
        toolbarLabel="Roster actions"
        search={searchInput}
        discoverActions={
          <>
            {filtersPopover}
            <RosterColumnsPopover
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={onColumnVisibilityChange}
              disabled={actionsDisabled}
            />
          </>
        }
        pageActions={
          <>
            <ExaminersToolsMenu sections={toolsSections} disabled={actionsDisabled} onSelect={handleToolsSelect} />
            {canManageRoster ? (
              <button type="button" className={officialAccountsBtnPrimary} disabled={actionsDisabled} onClick={onAdd}>
                Add examiner
              </button>
            ) : null}
          </>
        }
        selectionBar={
          <ExaminersSelectionBar
            selectedCount={selectedCount}
            onClearSelection={onClearSelection ?? (() => {})}
            disabled={actionsDisabled}
          >
            <Button type="button" size="sm" variant="outline" disabled={actionsDisabled} onClick={onSendSms}>
              {smsLabel}
            </Button>
            {onBulkDelete ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={actionsDisabled}
                onClick={onBulkDelete}
              >
                Delete ({selectedCount})
              </Button>
            ) : null}
          </ExaminersSelectionBar>
        }
        filterChips={filterChipsNode}
      />
    );
  }

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
        {searchInput}
        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto"
          role="toolbar"
          aria-label="Roster actions"
        >
          {filtersPopover}
          <RosterColumnsPopover
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
            disabled={actionsDisabled}
            className={mobileContactLayout ? "hidden md:inline-flex" : undefined}
          />
          <Button type="button" size="sm" variant="outline" disabled={actionsDisabled || filteredCount === 0} onClick={onSendSms}>
            {smsLabel}
          </Button>
          {onBulkDelete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={actionsDisabled}
              onClick={onBulkDelete}
            >
              Delete ({selectedCount})
            </Button>
          ) : null}
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
      {filterChipsNode}
    </div>
  );
}
