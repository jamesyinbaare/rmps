"use client";

import { OfficialAccountsExportMenu, type ExportMenuOption } from "@/components/official-accounts-export-menu";
import { OfficialAccountsFilterChips, type OfficialAccountsFilterChip } from "@/components/official-accounts-filter-chips";
import { ExaminerAccountsFiltersPopover } from "@/components/examiner-accounts/examiner-accounts-filters-popover";
import type { Examination } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  sectionId: string;
  searchInputId: string;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchDisabled?: boolean;
  regionFilter: string;
  onRegionChange: (region: string) => void;
  subjectSummaryHref: string | null;
  activeFilterCount: number;
  filterChips: OfficialAccountsFilterChip[];
  onClearFilters: () => void;
  exportOptions: ExportMenuOption[];
  exportDisabled: boolean;
  exportDisabledReason?: string;
  exportBusy: string | null;
  onExport: (key: string) => void;
  busy: boolean;
  total: number;
};

export function ExaminerAccountsCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  sectionId,
  searchInputId,
  searchQuery,
  onSearchQueryChange,
  searchDisabled,
  regionFilter,
  onRegionChange,
  subjectSummaryHref,
  activeFilterCount,
  filterChips,
  onClearFilters,
  exportOptions,
  exportDisabled,
  exportDisabledReason,
  exportBusy,
  onExport,
  busy,
  total,
}: Props) {
  const recordMeta = busy
    ? "Updating records…"
    : `${total.toLocaleString()} examiner${total === 1 ? "" : "s"}`;

  return (
    <div className={officialAccountsCommandBarClass}>
      <div className={cn(officialAccountsCommandBarRowClass, "items-end")}>
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${sectionId}-exam`}>
              Examination
            </label>
            <select
              id={`${sectionId}-exam`}
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
        </div>

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <ExaminerAccountsFiltersPopover
            regionFilter={regionFilter}
            onRegionChange={onRegionChange}
            subjectSummaryHref={subjectSummaryHref}
            activeFilterCount={activeFilterCount}
            onClearFilters={onClearFilters}
            sectionId={sectionId}
          />

          <OfficialAccountsExportMenu
            options={exportOptions}
            recordCount={total}
            centreCount={null}
            disabled={exportDisabled}
            disabledReason={exportDisabledReason}
            exportBusy={exportBusy}
            sectionId={sectionId}
            onExport={onExport}
            toolbar
            hideSummary
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
            Search examiners
          </label>
          <p className="text-sm tabular-nums text-muted-foreground lg:hidden" aria-live="polite">
            {recordMeta}
          </p>
        </div>
        <input
          id={searchInputId}
          type="search"
          className={cn(officialAccountsCommandBarSearchClass, "max-w-none")}
          placeholder="Name or phone…"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          disabled={searchDisabled}
        />
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
