"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { OfficialAccountsExportMenu, type ExportMenuOption } from "@/components/official-accounts-export-menu";
import type { Examination } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
  officialAccountsTableSearchClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  sectionId: string;
  personLabelPlural: string;
  searchInputId: string;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchDisabled?: boolean;
  exportOptions: ExportMenuOption[];
  exportDisabled: boolean;
  exportDisabledReason?: string;
  exportBusy: string | null;
  onExport: (key: string) => void;
  busy: boolean;
  total: number;
  clientFilteredCount?: number;
  aside?: ReactNode;
  hideRecordMeta?: boolean;
};

export function WorkforcePayoutsCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  sectionId,
  personLabelPlural,
  searchInputId,
  searchQuery,
  onSearchQueryChange,
  searchDisabled,
  exportOptions,
  exportDisabled,
  exportDisabledReason,
  exportBusy,
  onExport,
  busy,
  total,
  clientFilteredCount,
  aside,
  hideRecordMeta = false,
}: Props) {
  const recordMeta = busy
    ? "Updating records…"
    : searchQuery.trim() && clientFilteredCount != null
      ? `${clientFilteredCount.toLocaleString()} shown`
      : `${total.toLocaleString()} record${total === 1 ? "" : "s"}`;

  return (
    <div className={cn(officialAccountsCommandBarClass, "gap-2 px-3 py-2 sm:px-4")}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${sectionId}-exam`}>
          Examination
        </label>
        <select
          id={`${sectionId}-exam`}
          className={cn(
            officialAccountsCommandBarControlClass,
            "h-8 min-h-8 w-auto min-w-44 max-w-72 py-0 text-[13px]",
          )}
          value={examId ?? ""}
          onChange={(e) => onExamChange(e.target.value ? Number(e.target.value) : null)}
        >
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {formatExamLabel(ex)}
            </option>
          ))}
        </select>

        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <label className="sr-only" htmlFor={searchInputId}>
            Search {personLabelPlural.toLowerCase()}
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id={searchInputId}
            type="search"
            className={cn(officialAccountsTableSearchClass, "w-full max-w-none pl-8")}
            placeholder={`Search ${personLabelPlural.toLowerCase()}…`}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            disabled={searchDisabled}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {aside}
          {hideRecordMeta ? null : (
            <p className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block" aria-live="polite">
              {recordMeta}
            </p>
          )}
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
      </div>
      {hideRecordMeta ? null : (
        <p className="text-xs tabular-nums text-muted-foreground sm:hidden" aria-live="polite">
          {recordMeta}
        </p>
      )}
    </div>
  );
}
