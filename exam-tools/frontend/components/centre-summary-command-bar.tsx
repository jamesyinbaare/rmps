"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { CentreSummaryScopeToggle } from "@/components/centre-summary-scope-toggle";
import type { ExportMenuOption } from "@/components/official-accounts-export-menu";
import { ExportFabSpeedDial } from "@/components/export-fab-speed-dial";
import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Examination, TimetableSubjectFilter } from "@/lib/api";
import { officialAccountsCommandBarClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const SECTION_ID = "centre-summary";

const attendanceBtnClass = cn(
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent text-accent-foreground shadow-md",
  "transition-[filter,box-shadow] hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring/30",
  "disabled:pointer-events-none disabled:opacity-50",
);

const inputGroupShellClass =
  "flex w-full min-w-0 overflow-hidden rounded-lg border border-input-border bg-input shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30";

const inputGroupCentreTriggerClass =
  "h-10 max-h-10 min-w-0 flex-1 overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0";

const inputGroupRegionTriggerClass =
  "h-10 w-36 shrink-0 rounded-none border-0 border-r border-input-border bg-transparent px-2.5 shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 sm:w-40 sm:px-3";

const examSelectTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";

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
            <SearchableCombobox
              id={`${SECTION_ID}-exam`}
              options={exams.map((ex) => ({
                value: String(ex.id),
                label: formatExamLabel(ex),
              }))}
              value={examId != null ? String(examId) : ""}
              onChange={(v) => onExamChange(v ? Number(v) : null)}
              placeholder="Select examination…"
              searchPlaceholder="Examination…"
              emptyText="No examination found."
              widthClass="w-full"
              truncateTrigger
              triggerClassName={examSelectTriggerClass}
              showAllOption={false}
              disabled={exams.length === 0}
            />
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
              <SearchableCombobox
                id={`${SECTION_ID}-region`}
                options={regionOptions}
                value={regionFilter}
                onChange={onRegionChange}
                placeholder={regionAllLabel}
                searchPlaceholder="Region…"
                emptyText="No region found."
                widthClass="w-36 sm:w-40"
                popoverWidthClass="w-[var(--radix-popover-trigger-width)]"
                truncateTrigger
                triggerClassName={inputGroupRegionTriggerClass}
                allOptionLabel={regionAllLabel}
                disabled={centresDisabled}
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <SearchableCombobox
                  id={`${SECTION_ID}-centre`}
                  options={centerOptions}
                  value={centerId}
                  onChange={onCentreChange}
                  placeholder="Select school…"
                  searchPlaceholder="Code or name…"
                  emptyText={centreEmptyText}
                  widthClass="w-full max-w-full"
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
              "motion-safe:hover:shadow-lg",
              canLoad && "ring-1 ring-accent/35",
              !canLoad && "pointer-events-none opacity-50",
            )}
            aria-label="Attendance sheets"
            aria-disabled={!canLoad}
            tabIndex={canLoad ? undefined : -1}
            title={canLoad ? "Attendance sheets" : "Select a centre first"}
          >
            <ClipboardList className="size-4 shrink-0" aria-hidden />
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
