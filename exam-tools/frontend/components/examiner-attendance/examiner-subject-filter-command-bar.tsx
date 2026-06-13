"use client";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Examination } from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
} from "@/lib/official-accounts-zone";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

const inputGroupShellClass =
  "flex w-full min-w-0 overflow-hidden rounded-lg border border-input-border bg-input shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30";

const inputGroupSelectClass = cn(
  officialAccountsCommandBarControlClass,
  "h-10 shrink-0 appearance-none rounded-none border-0 bg-input px-2.5 shadow-none hover:bg-input focus:ring-0 focus:ring-offset-0 disabled:bg-input",
);

const inputGroupSubjectTriggerClass =
  "h-10 max-h-10 min-w-0 flex-1 overflow-hidden rounded-none border-0 border-l border-input-border bg-input shadow-none hover:bg-input focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-input";

const standaloneTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";

/** Full-row ratio: exam 2 · subject group 5. */
const toolbarRowClass =
  "grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,5fr)] items-end gap-3";

type SubjectOption = { value: string; label: string };

type Props = {
  sectionId: string;
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
};

export function ExaminerSubjectFilterCommandBar({
  sectionId,
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
}: Props) {
  const examSelected = examId != null;
  const filtersDisabled = !examSelected || subjectsDisabled;

  return (
    <div className={cn(officialAccountsCommandBarClass, "overflow-visible")}>
      <div className={toolbarRowClass}>
        <CommandBarBorderField label="Examination" htmlFor={`${sectionId}-exam`} className="min-w-0">
          <SearchableCombobox
            id={`${sectionId}-exam`}
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

        <CommandBarBorderField label="Subject" htmlFor={`${sectionId}-subject`} className="min-w-0">
          <div className={inputGroupShellClass}>
            <select
              id={`${sectionId}-subject-type`}
              aria-label="Subject type"
              className={cn(
                inputGroupSelectClass,
                "w-[28%] min-w-28 max-w-44 shrink-0 border-r border-input-border",
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
                id={`${sectionId}-subject`}
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
          </div>
        </CommandBarBorderField>
      </div>
    </div>
  );
}
