"use client";

import {
  CalendarClock,
  Clock,
  Columns3,
  Download,
  MailPlus,
  MessageSquare,
  MessagesSquare,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { VisibilityState } from "@tanstack/react-table";

import {
  COLUMN_TOGGLE_OPTIONS,
  DEFAULT_COLUMN_VISIBILITY,
  INPUT_FOCUS_RING,
  INVITATIONS_COMMAND_BAR_CLASS,
} from "@/components/examiner-invitations/constants";
import { InvitationsFiltersPopover } from "@/components/examiner-invitations/invitations-filters-popover";
import { SO_MOBILE_COMMAND_BAR } from "@/components/examiners/constants";
import { ExaminersAdminToolbar } from "@/components/examiners/toolbar/examiners-admin-toolbar";
import { ExaminersSelectionBar } from "@/components/examiners/toolbar/examiners-selection-bar";
import {
  ExaminersToolsMenu,
  type ExaminersToolsMenuSection,
} from "@/components/examiners/toolbar/examiners-tools-menu";
import type { MultiSelectCheckboxOption } from "@/components/multi-select-checkbox-dropdown";
import { FabSpeedDial } from "@/components/fab-speed-dial";
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
  examId: number | null;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchDisabled?: boolean;
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
  onBulkExtendDeadline?: () => void;
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
  onBulkUpload: () => void;
  onInvite: () => void;
  onDownloadLinks?: () => void;
  busy: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  hideSubjectScopeFilters?: boolean;
  mobileContactLayout?: boolean;
  adminToolbarLayout?: boolean;
};

function InvitationsColumnsPopover({
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
          {COLUMN_TOGGLE_OPTIONS.map((col) => (
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
            onClick={() => onColumnVisibilityChange(DEFAULT_COLUMN_VISIBILITY)}
          >
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InvitationsCommandBar({
  examId,
  searchQuery,
  onSearchQueryChange,
  searchDisabled,
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
  onBulkExtendDeadline,
  onBulkDelete,
  onClearSelection,
  onBulkUpload,
  onInvite,
  onDownloadLinks,
  busy,
  disabled,
  readOnly = false,
  hideSubjectScopeFilters = false,
  mobileContactLayout = false,
  adminToolbarLayout = false,
}: Props) {
  const actionsDisabled = disabled || busy || examId == null;

  const smsLabel =
    selectedCount > 0
      ? `Send SMS (${selectedCount})`
      : filteredCount > 0
        ? `Send SMS (${filteredCount})`
        : "Send SMS";

  const coordinationLabel =
    selectedCount > 0 ? `Set coordination date (${selectedCount})` : "Set coordination date";

  const extendDeadlineLabel =
    selectedCount > 0 ? `Extend respond-by (${selectedCount})` : "Extend respond-by";

  const deleteLabel = selectedCount > 0 ? `Delete (${selectedCount})` : "Delete";

  const searchInput = (
    <input
      id="ei-search"
      type="search"
      aria-label="Search invitations"
      className={cn(
        officialAccountsCommandBarSearchClass,
        "w-full min-w-0 sm:max-w-xs md:max-w-sm lg:max-w-md",
        searchDisabled && "opacity-60",
      )}
      placeholder="Search name or phone…"
      value={searchQuery}
      disabled={searchDisabled || busy}
      onChange={(e) => onSearchQueryChange(e.target.value)}
    />
  );

  const filtersPopover = (
    <InvitationsFiltersPopover
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
      hideSubjectScopeFilters={hideSubjectScopeFilters}
    />
  );

  const filterChipsNode = (
    <OfficialAccountsFilterChips chips={filterChips} onClearAll={onClearFilters} variant="inline" />
  );

  const bulkFabOptions = useMemo(
    () => {
      const options = [
        {
          key: "sms",
          label: smsLabel,
          icon: MessageSquare,
          disabled: filteredCount === 0,
        },
        {
          key: "coordination",
          label: coordinationLabel,
          icon: CalendarClock,
          disabled: selectedCount === 0,
        },
      ];
      if (onBulkExtendDeadline) {
        options.push({
          key: "extend-deadline",
          label: extendDeadlineLabel,
          icon: Clock,
          disabled: selectedCount === 0,
        });
      }
      if (onBulkDelete && !readOnly) {
        options.push({
          key: "delete",
          label: deleteLabel,
          icon: Trash2,
          disabled: selectedCount === 0,
        });
      }
      return options;
    },
    [coordinationLabel, deleteLabel, extendDeadlineLabel, filteredCount, onBulkDelete, onBulkExtendDeadline, readOnly, selectedCount, smsLabel],
  );

  const inviteFabOptions = useMemo(
    () => [
      {
        key: "invite",
        label: "Invite examiner",
        icon: MailPlus,
      },
      {
        key: "bulk-upload",
        label: "Invite examiners",
        icon: Upload,
      },
    ],
    [],
  );

  function handleBulkFabSelect(key: string) {
    if (key === "sms") onSendSms();
    else if (key === "coordination") onSetCoordinationDate();
    else if (key === "extend-deadline") onBulkExtendDeadline?.();
    else if (key === "delete") onBulkDelete?.();
  }

  function handleInviteFabSelect(key: string) {
    if (key === "invite") onInvite();
    else if (key === "bulk-upload") onBulkUpload();
  }

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
    if (onDownloadLinks) {
      dataItems.push({
        key: "download-links",
        label: "Download links",
        icon: Download,
      });
    }
    if (!readOnly) {
      dataItems.push({
        key: "bulk-upload",
        label: "Invite examiners",
        icon: Upload,
        description: "Bulk upload invitations",
      });
    }
    if (dataItems.length > 0) {
      sections.push({ label: "Data", items: dataItems });
    }

    return sections;
  }, [adminToolbarLayout, filteredCount, onDownloadLinks, readOnly, selectedCount, smsLabel]);

  function handleToolsSelect(key: string) {
    if (key === "sms") onSendSms();
    else if (key === "download-links") onDownloadLinks?.();
    else if (key === "bulk-upload") onBulkUpload();
  }

  if (adminToolbarLayout) {
    return (
      <ExaminersAdminToolbar
        mobileContactLayout={mobileContactLayout}
        toolbarLabel="Invitation actions"
        className={cn(INVITATIONS_COMMAND_BAR_CLASS, "overflow-visible")}
        search={searchInput}
        discoverActions={
          <>
            {filtersPopover}
            <InvitationsColumnsPopover
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={onColumnVisibilityChange}
              disabled={actionsDisabled}
            />
          </>
        }
        pageActions={
          <>
            <ExaminersToolsMenu sections={toolsSections} disabled={actionsDisabled} onSelect={handleToolsSelect} />
            {!readOnly ? (
              <button type="button" className={officialAccountsBtnPrimary} disabled={actionsDisabled} onClick={onInvite}>
                Invite examiner
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
              {coordinationLabel}
            </Button>
            {onBulkExtendDeadline ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={actionsDisabled || selectedCount === 0}
                onClick={onBulkExtendDeadline}
              >
                {extendDeadlineLabel}
              </Button>
            ) : null}
            {onBulkDelete && !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={actionsDisabled || selectedCount === 0}
                onClick={onBulkDelete}
              >
                {deleteLabel}
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
        INVITATIONS_COMMAND_BAR_CLASS,
        "overflow-visible",
        mobileContactLayout && SO_MOBILE_COMMAND_BAR,
        mobileContactLayout && "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
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
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 overflow-visible sm:ml-auto"
          role="toolbar"
          aria-label="Invitation actions"
        >
          {filtersPopover}
          <InvitationsColumnsPopover
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={onColumnVisibilityChange}
            disabled={actionsDisabled}
            className={mobileContactLayout ? "hidden md:inline-flex" : undefined}
          />
          {onDownloadLinks ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionsDisabled}
              onClick={onDownloadLinks}
            >
              Download links
            </Button>
          ) : null}
          <FabSpeedDial
            options={bulkFabOptions}
            disabled={actionsDisabled}
            disabledReason="Select an examination first"
            busy={busy}
            onSelect={handleBulkFabSelect}
            mainIcon={MessagesSquare}
            sectionLabel="Bulk invitation actions"
          />
          {readOnly ? null : (
            <FabSpeedDial
              options={inviteFabOptions}
              disabled={actionsDisabled}
              disabledReason="Select an examination first"
              busy={busy}
              onSelect={handleInviteFabSelect}
              mainIcon={UserPlus}
              sectionLabel="Add invitations"
            />
          )}
        </div>
      </div>
      {filterChipsNode}
    </div>
  );
}
