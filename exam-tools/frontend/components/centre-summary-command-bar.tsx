"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { CentreSummaryScopeToggle } from "@/components/centre-summary-scope-toggle";
import type { ExportMenuOption } from "@/components/official-accounts-export-menu";
import { ExportFabSpeedDial } from "@/components/export-fab-speed-dial";
import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Examination, TimetableSubjectFilter } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const SECTION_ID = "centre-summary";

const attendanceBtnClass = cn(
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-accent/30 bg-accent px-3.5 text-sm font-semibold text-accent-foreground shadow-md",
  "transition-[filter,box-shadow] hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring/30",
  "disabled:pointer-events-none disabled:opacity-50",
);

const inputGroupShellClass =
  "flex w-full min-w-0 overflow-hidden rounded-lg border border-input-border bg-input shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30";

const inputGroupRegionClass =
  "h-10 shrink-0 cursor-pointer border-0 border-r border-input-border bg-transparent px-2.5 text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3";

const inputGroupCentreTriggerClass =
  "min-h-10 flex-1 rounded-none border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0";

/** Filters + actions — full toolbar width; school field grows on md+. */
const filterGridClass =
  "grid min-w-0 flex-1 grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[minmax(11rem,13rem)_auto_minmax(0,1fr)]";

const actionsWrapClass =
  "flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end";

type CentreOption = { value: string; label: string };
type RegionOption = { value: string; label: string };

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  subjectFilter: TimetableSubjectFilter;
  onSubjectFilterChange: (filter: TimetableSubjectFilter) => void;
  regionFilter: string;
  onRegionChange: (region: string) => void;
  regionOptions: RegionOption[];
  centerId: string;
  onCentreChange: (id: string) => void;
  centerOptions: CentreOption[];
  centresDisabled: boolean;
  centreEmptyText: string;
  attendanceSheetsHref: string;
  canLoad: boolean;
  regionAllLabel?: string;
  exportOptions: ExportMenuOption[];
  exportDisabled: boolean;
  exportDisabledReason?: string;
  exportBusy: string | null;
  onExport: (key: string) => void;
};

export function CentreSummaryCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  subjectFilter,
  onSubjectFilterChange,
  regionFilter,
  onRegionChange,
  regionOptions,
  centerId,
  onCentreChange,
  centerOptions,
  centresDisabled,
  centreEmptyText,
  attendanceSheetsHref,
  canLoad,
  regionAllLabel = "All regions",
  exportOptions,
  exportDisabled,
  exportDisabledReason,
  exportBusy,
  onExport,
}: Props) {
  const exportBusyKey = exportBusy?.startsWith(`${SECTION_ID}:`)
    ? exportBusy.split(":")[1]
    : null;

  return (
    <div className={cn(officialAccountsCommandBarClass, "overflow-visible")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className={filterGridClass}>
          <CommandBarBorderField label="Examination" htmlFor={`${SECTION_ID}-exam`} className="min-w-0">
            <select
              id={`${SECTION_ID}-exam`}
              className={cn(officialAccountsCommandBarControlClass, "h-10 w-full")}
              value={examId ?? ""}
              onChange={(e) => onExamChange(e.target.value ? Number(e.target.value) : null)}
              disabled={exams.length === 0}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </CommandBarBorderField>

          <CentreSummaryScopeToggle
            value={subjectFilter}
            onChange={onSubjectFilterChange}
            disabled={exams.length === 0}
            sectionId={SECTION_ID}
            className="min-w-0 justify-self-start sm:col-start-2 md:col-start-auto"
          />

          <CommandBarBorderField
            label="Region & school"
            htmlFor={`${SECTION_ID}-centre`}
            className="min-w-0 sm:col-span-2 md:col-span-1"
          >
            <div className={inputGroupShellClass}>
              <select
                id={`${SECTION_ID}-region`}
                className={cn(inputGroupRegionClass, "w-28 sm:w-32")}
                value={regionFilter}
                onChange={(e) => onRegionChange(e.target.value)}
                disabled={centresDisabled}
                aria-label="Region"
              >
                <option value="">{regionAllLabel}</option>
                {regionOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <div className="min-w-0 flex-1">
                <SearchableCombobox
                  id={`${SECTION_ID}-centre`}
                  options={centerOptions}
                  value={centerId}
                  onChange={onCentreChange}
                  placeholder="Select school…"
                  searchPlaceholder="Code or name…"
                  emptyText={centreEmptyText}
                  widthClass="w-full"
                  truncateTrigger
                  triggerClassName={inputGroupCentreTriggerClass}
                  showAllOption={false}
                  disabled={centresDisabled}
                />
              </div>
            </div>
          </CommandBarBorderField>
        </div>

        <div
          className={cn(actionsWrapClass, "overflow-visible")}
          role="toolbar"
          aria-label="Centre summary actions"
        >
          <Link
            href={attendanceSheetsHref}
            className={cn(
              attendanceBtnClass,
              "min-w-0 flex-1 gap-2 sm:flex-none sm:px-4",
              "motion-safe:hover:shadow-lg",
              canLoad && "ring-1 ring-accent/35",
              !canLoad && "pointer-events-none opacity-50",
            )}
            aria-disabled={!canLoad}
            tabIndex={canLoad ? undefined : -1}
            title={canLoad ? "Open attendance uploads for this centre" : "Select a centre first"}
          >
            <ClipboardList className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Attendance sheets</span>
          </Link>
          <ExportFabSpeedDial
            options={exportOptions}
            disabled={exportDisabled}
            disabledReason={exportDisabledReason}
            busyKey={exportBusyKey}
            onExport={onExport}
            sectionLabel="Export centre summary"
          />
        </div>
      </div>
    </div>
  );
}
