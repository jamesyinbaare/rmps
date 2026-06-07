"use client";

import { Columns3 } from "lucide-react";
import { useState } from "react";

import type { VisibilityState } from "@tanstack/react-table";

import {
  COLUMN_TOGGLE_OPTIONS,
  DEFAULT_COLUMN_VISIBILITY,
  INPUT_FOCUS_RING,
  INVITATIONS_COMMAND_BAR_CLASS,
} from "@/components/examiner-invitations/constants";
import { InvitationsFiltersPopover } from "@/components/examiner-invitations/invitations-filters-popover";
import type { InvitationStatusFilter } from "@/components/examiner-invitations/types";
import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { OfficialAccountsFilterChips, type OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Examination } from "@/lib/api";
import {
  officialAccountsBtnPrimary,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
} from "@/lib/official-accounts-zone";
import type { ScriptControlSubjectTypeFilter } from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchDisabled?: boolean;
  statusFilter: InvitationStatusFilter;
  onStatusFilterChange: (value: InvitationStatusFilter) => void;
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
  filterChips: OfficialAccountsFilterChip[];
  onClearFilters: () => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (visibility: VisibilityState) => void;
  selectedCount: number;
  filteredCount: number;
  onSendSms: () => void;
  onSetCoordinationDate: () => void;
  onBulkUpload: () => void;
  onInvite: () => void;
  busy: boolean;
  disabled?: boolean;
  hideExamPicker?: boolean;
};

export function InvitationsCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  searchQuery,
  onSearchQueryChange,
  searchDisabled,
  statusFilter,
  onStatusFilterChange,
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
  filterChips,
  onClearFilters,
  columnVisibility,
  onColumnVisibilityChange,
  selectedCount,
  filteredCount,
  onSendSms,
  onSetCoordinationDate,
  onBulkUpload,
  onInvite,
  busy,
  disabled,
  hideExamPicker = false,
}: Props) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const actionsDisabled = disabled || busy || examId == null;

  const smsLabel =
    selectedCount > 0
      ? `Send SMS (${selectedCount})`
      : filteredCount > 0
        ? `Send SMS (${filteredCount})`
        : "Send SMS";

  return (
    <div className={INVITATIONS_COMMAND_BAR_CLASS}>
      <div className={cn(officialAccountsCommandBarRowClass, "items-end")}>
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          {!hideExamPicker ? (
            <div className="flex min-w-0 flex-col gap-1 sm:min-w-[14rem] sm:flex-1 lg:max-w-xs">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ei-exam">
                Examination
              </label>
              <SearchableCombobox
                id="ei-exam"
                options={exams.map((ex) => ({ value: String(ex.id), label: formatExamLabel(ex) }))}
                value={examId != null ? String(examId) : ""}
                onChange={(v) => onExamChange(v ? Number(v) : null)}
                placeholder="Select examination…"
                searchPlaceholder="Search exams…"
                widthClass="w-full"
                showAllOption={false}
                truncateTrigger
                disabled={busy}
              />
            </div>
          ) : null}
          <div className={cn("flex min-w-0 flex-1 flex-col gap-1 lg:max-w-md", hideExamPicker && "lg:max-w-xl")}>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="ei-search">
              Search
            </label>
            <input
              id="ei-search"
              type="search"
              className={cn(officialAccountsCommandBarSearchClass, searchDisabled && "opacity-60")}
              placeholder="Search name or phone…"
              value={searchQuery}
              disabled={searchDisabled || busy}
              onChange={(e) => onSearchQueryChange(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InvitationsFiltersPopover
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
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
          />
          <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={actionsDisabled}>
                <Columns3 className="size-4" aria-hidden />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Show columns</p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {COLUMN_TOGGLE_OPTIONS.map((col) => (
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
                  onClick={() => onColumnVisibilityChange(DEFAULT_COLUMN_VISIBILITY)}
                >
                  Reset to default
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <Button type="button" size="sm" variant="outline" disabled={actionsDisabled || filteredCount === 0} onClick={onSendSms}>
            {smsLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionsDisabled || selectedCount === 0}
            onClick={onSetCoordinationDate}
          >
            Set coordination date{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={actionsDisabled} onClick={onBulkUpload}>
            Bulk upload
          </Button>
          <button type="button" className={officialAccountsBtnPrimary} disabled={actionsDisabled} onClick={onInvite}>
            Invite examiner
          </button>
        </div>
      </div>
      <OfficialAccountsFilterChips chips={filterChips} onClearAll={onClearFilters} variant="inline" />
    </div>
  );
}
