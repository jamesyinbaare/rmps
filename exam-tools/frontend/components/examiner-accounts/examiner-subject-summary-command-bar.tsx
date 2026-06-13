"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import type { ExportMenuOption } from "@/components/official-accounts-export-menu";
import { ExportFabSpeedDial } from "@/components/export-fab-speed-dial";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Examination } from "@/lib/api";
import {
  EXAMINER_PAYOUTS_HREF,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

const SECTION_ID = "examiner-subject-summary";

const allAccountsBtnClass = cn(
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent text-accent-foreground shadow-md",
  "transition-[filter,box-shadow] hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring/30",
  "disabled:pointer-events-none disabled:opacity-50",
);

const standaloneTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";

const inputGroupShellClass =
  "flex w-full min-w-0 overflow-hidden rounded-lg border border-input-border bg-input shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30";

const inputGroupSelectClass = cn(
  officialAccountsCommandBarControlClass,
  "h-10 shrink-0 appearance-none rounded-none border-0 bg-input px-2.5 shadow-none hover:bg-input focus:ring-0 focus:ring-offset-0 disabled:bg-input",
);

const inputGroupSubjectTriggerClass =
  "h-10 max-h-10 min-w-0 flex-1 overflow-hidden rounded-none border-0 border-x border-input-border bg-input shadow-none hover:bg-input focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-input";

/** Full-row ratio: exam 2 · subject group 5 · region 2 · actions 1. */
const toolbarRowClass =
  "grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,5fr)_minmax(0,2fr)_minmax(0,1fr)] items-end gap-3";

type SubjectOption = { value: string; label: string };

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  formatExamLabel: (ex: Examination) => string;
  subjectTypeFilter: ScriptControlSubjectTypeFilter;
  onSubjectTypeFilterChange: (value: ScriptControlSubjectTypeFilter) => void;
  subjectId: string;
  onSubjectChange: (id: string) => void;
  subjectOptions: SubjectOption[];
  subjectsDisabled: boolean;
  subjectEmptyText: string;
  paperNumbers: number[];
  paperNumber: number | null;
  onPaperNumberChange: (paper: number | null) => void;
  regionFilter: string;
  onRegionChange: (region: string) => void;
  allAccountsHref: string;
  canLoad: boolean;
  exportOptions: ExportMenuOption[];
  exportDisabled: boolean;
  exportDisabledReason?: string;
  exportBusy: string | null;
  onExport: (key: string) => void;
};

export function ExaminerSubjectSummaryCommandBar({
  exams,
  examId,
  onExamChange,
  formatExamLabel,
  subjectTypeFilter,
  onSubjectTypeFilterChange,
  subjectId,
  onSubjectChange,
  subjectOptions,
  subjectsDisabled,
  subjectEmptyText,
  paperNumbers,
  paperNumber,
  onPaperNumberChange,
  regionFilter,
  onRegionChange,
  allAccountsHref,
  canLoad,
  exportOptions,
  exportDisabled,
  exportDisabledReason,
  exportBusy,
  onExport,
}: Props) {
  const exportBusyKey = exportBusy?.startsWith(`${SECTION_ID}:`)
    ? exportBusy.split(":")[1]
    : null;

  const regionOptions = [
    { value: "", label: "All regions" },
    ...REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
  ];

  const examSelected = examId != null;
  const filtersDisabled = !examSelected || subjectsDisabled;
  const paperDisabled = !subjectId.trim() || paperNumbers.length === 0;

  return (
    <div className={cn(officialAccountsCommandBarClass, "overflow-visible")}>
      <div className={toolbarRowClass}>
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
              triggerClassName={standaloneTriggerClass}
              showAllOption={false}
              disabled={exams.length === 0}
            />
          </CommandBarBorderField>

          <CommandBarBorderField label="Subject & paper" htmlFor={`${SECTION_ID}-subject`} className="min-w-0">
            <div className={inputGroupShellClass}>
              <select
                id={`${SECTION_ID}-subject-type`}
                aria-label="Subject type"
                className={cn(
                  inputGroupSelectClass,
                  "w-[24%] min-w-28 max-w-40 shrink-0 border-r border-input-border",
                )}
                value={subjectTypeFilter}
                disabled={filtersDisabled}
                onChange={(e) =>
                  onSubjectTypeFilterChange(e.target.value as ScriptControlSubjectTypeFilter)
                }
              >
                {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="min-w-0 flex-1 overflow-hidden">
                <SearchableCombobox
                  id={`${SECTION_ID}-subject`}
                  options={subjectOptions}
                  value={subjectId}
                  onChange={onSubjectChange}
                  placeholder="Select subject…"
                  searchPlaceholder="Code or name…"
                  emptyText={subjectEmptyText}
                  widthClass="w-full max-w-full"
                  popoverWidthClass="min-w-[var(--radix-popover-trigger-width)]"
                  truncateTrigger
                  triggerClassName={inputGroupSubjectTriggerClass}
                  showAllOption={false}
                  disabled={filtersDisabled}
                />
              </div>

              <select
                id={`${SECTION_ID}-paper`}
                aria-label="Paper"
                className={cn(
                  inputGroupSelectClass,
                  "w-[16%] min-w-20 max-w-28 shrink-0 border-l border-input-border",
                )}
                value={paperNumber != null ? String(paperNumber) : ""}
                disabled={paperDisabled}
                onChange={(e) =>
                  onPaperNumberChange(e.target.value ? Number.parseInt(e.target.value, 10) : null)
                }
              >
                <option value="">{paperDisabled ? "—" : "Paper"}</option>
                {paperNumbers.map((paper) => (
                  <option key={paper} value={paper}>
                    P{paper}
                  </option>
                ))}
              </select>
            </div>
          </CommandBarBorderField>

          <CommandBarBorderField label="Region" htmlFor={`${SECTION_ID}-region`} className="min-w-0">
            <SearchableCombobox
              id={`${SECTION_ID}-region`}
              options={regionOptions}
              value={regionFilter}
              onChange={onRegionChange}
              placeholder="All regions"
              searchPlaceholder="Region…"
              emptyText="No region found."
              widthClass="w-full"
              truncateTrigger
              triggerClassName={standaloneTriggerClass}
              allOptionLabel="All regions"
              disabled={!examSelected}
            />
          </CommandBarBorderField>

        <div
          className="flex min-w-0 items-end justify-end gap-2"
          role="toolbar"
          aria-label="Subject summary actions"
        >
          <Link
            href={allAccountsHref}
            className={cn(
              allAccountsBtnClass,
              "motion-safe:hover:shadow-lg",
              examSelected && "ring-1 ring-accent/35",
            )}
            aria-label="All examiner bank accounts"
            title="All examiner bank accounts"
          >
            <BookOpen className="size-4 shrink-0" aria-hidden />
          </Link>
          <ExportFabSpeedDial
            options={exportOptions}
            disabled={exportDisabled}
            disabledReason={exportDisabledReason}
            busyKey={exportBusyKey}
            onExport={onExport}
            sectionLabel="Export subject examiners"
          />
        </div>
      </div>
    </div>
  );
}

export { EXAMINER_PAYOUTS_HREF };
