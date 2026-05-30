"use client";

import { LayoutList } from "lucide-react";
import { useState } from "react";

import { OfficialAccountsExportMenu, type ExportMenuOption } from "@/components/official-accounts-export-menu";
import { OfficialAccountsFilterChips, type OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { OfficialAccountsFiltersPopover } from "@/components/official-accounts-filters-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Examination, RecordSubjectScope } from "@/lib/api";
import {
  officialAccountsBtnSecondaryToolbar,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const SCOPE_OPTIONS: { value: RecordSubjectScope; label: string }[] = [
  { value: "CORE", label: "Core" },
  { value: "ELECTIVE", label: "Elective" },
];

type CentreOption = { value: string; label: string };

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  sectionId: string;
  subjectScopeFilter: RecordSubjectScope;
  onScopeChange: (scope: RecordSubjectScope) => void;
  searchInputId: string;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchDisabled?: boolean;
  searchLimitedToPage?: boolean;
  regionFilter: string;
  onRegionChange: (region: string) => void;
  centerId: string;
  onCentreChange: (id: string) => void;
  centerOptions: CentreOption[];
  centresDisabled: boolean;
  centreSummaryHref: string | null;
  activeFilterCount: number;
  filterChips: OfficialAccountsFilterChip[];
  onClearFilters: () => void;
  showInvigilatorView?: boolean;
  groupByCentre?: boolean;
  onGroupByCentreChange?: (checked: boolean) => void;
  exportOptions: ExportMenuOption[];
  exportCentreCount: number | null;
  exportDisabled: boolean;
  exportDisabledReason?: string;
  exportBusy: string | null;
  exportFootnote?: string;
  onExport: (layout: ExportMenuOption["layout"]) => void;
  busy: boolean;
  total: number;
  clientFilteredCount?: number;
};

export function OfficialAccountsCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  sectionId,
  subjectScopeFilter,
  onScopeChange,
  searchInputId,
  searchQuery,
  onSearchQueryChange,
  searchDisabled,
  searchLimitedToPage,
  regionFilter,
  onRegionChange,
  centerId,
  onCentreChange,
  centerOptions,
  centresDisabled,
  centreSummaryHref,
  activeFilterCount,
  filterChips,
  onClearFilters,
  showInvigilatorView,
  groupByCentre,
  onGroupByCentreChange,
  exportOptions,
  exportCentreCount,
  exportDisabled,
  exportDisabledReason,
  exportBusy,
  exportFootnote,
  onExport,
  busy,
  total,
  clientFilteredCount,
}: Props) {
  const [viewOpen, setViewOpen] = useState(false);

  const recordMeta = busy
    ? "Updating records…"
    : searchQuery.trim() && clientFilteredCount != null
      ? `${clientFilteredCount.toLocaleString()} shown on this page`
      : `${total.toLocaleString()} record${total === 1 ? "" : "s"}`;

  const searchHint =
    searchLimitedToPage && searchQuery.trim()
      ? "Search only matches the current page. Export for the full list."
      : undefined;

  return (
    <div className={officialAccountsCommandBarClass}>
      <div className={cn(officialAccountsCommandBarRowClass, "items-end")}>
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="admin-eo-exam">
              Examination
            </label>
            <select
              id="admin-eo-exam"
              className={cn(officialAccountsCommandBarControlClass, "min-w-48 max-w-xs")}
              value={examId ?? ""}
              onChange={(e) => onExamChange(e.target.value ? Number(e.target.value) : null)}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="text-xs font-medium text-muted-foreground">
              Subject scope <span className="font-normal">(required)</span>
            </legend>
            <div
              className="inline-flex rounded-lg border border-input-border bg-muted/30 p-0.5 shadow-sm"
              role="radiogroup"
              aria-label="Subject scope"
            >
              {SCOPE_OPTIONS.map((opt) => {
                const id = `admin-eo-scope-${sectionId}-${opt.value}`;
                const checked = subjectScopeFilter === opt.value;
                return (
                  <label
                    key={opt.value}
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
                      checked
                        ? "bg-card text-foreground shadow-sm ring-1 ring-success/25"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      id={id}
                      type="radio"
                      name={`admin-eo-scope-${sectionId}`}
                      className="sr-only"
                      value={opt.value}
                      checked={checked}
                      onChange={() => onScopeChange(opt.value)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <OfficialAccountsFiltersPopover
            regionFilter={regionFilter}
            onRegionChange={onRegionChange}
            centerId={centerId}
            onCentreChange={onCentreChange}
            centerOptions={centerOptions}
            centresDisabled={centresDisabled}
            centreSummaryHref={centreSummaryHref}
            activeFilterCount={activeFilterCount}
            onClearFilters={onClearFilters}
            sectionId={sectionId}
          />

          {showInvigilatorView ? (
            <Popover open={viewOpen} onOpenChange={setViewOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    officialAccountsBtnSecondaryToolbar,
                    "inline-flex items-center gap-2",
                    groupByCentre && "ring-1 ring-success/30",
                  )}
                  aria-expanded={viewOpen}
                  aria-label="Table view options"
                >
                  <LayoutList className="size-4 shrink-0" aria-hidden />
                  View
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input-border"
                    checked={groupByCentre ?? false}
                    onChange={(e) => onGroupByCentreChange?.(e.target.checked)}
                  />
                  Group by centre
                </label>
              </PopoverContent>
            </Popover>
          ) : null}

          <OfficialAccountsExportMenu
            options={exportOptions}
            recordCount={total}
            centreCount={exportCentreCount}
            disabled={exportDisabled}
            disabledReason={exportDisabledReason}
            exportBusy={exportBusy}
            sectionId={sectionId}
            onExport={onExport}
            toolbar
            hideSummary
            footnote={exportFootnote}
          />
        </div>

        <p
          className="hidden shrink-0 text-sm tabular-nums text-muted-foreground lg:block"
          aria-live="polite"
        >
          {recordMeta}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={searchInputId}>
            Search records
          </label>
          <p className="text-sm tabular-nums text-muted-foreground lg:hidden" aria-live="polite">
            {recordMeta}
          </p>
        </div>
        <input
          id={searchInputId}
          type="search"
          className={cn(officialAccountsCommandBarSearchClass, "max-w-none")}
          placeholder="Name, centre code, account number…"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          disabled={searchDisabled}
          title={searchHint}
        />
        {searchHint ? <p className="text-xs text-muted-foreground">{searchHint}</p> : null}
      </div>

      {filterChips.length > 0 ? (
        <OfficialAccountsFilterChips
          chips={filterChips}
          onClearAll={onClearFilters}
          variant="inline"
        />
      ) : null}
    </div>
  );
}
