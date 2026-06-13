"use client";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

const inputGroupShellClass =
  "flex w-full min-w-0 overflow-hidden rounded-lg border border-input-border bg-input shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30";

const inputGroupSelectClass = cn(
  "h-9 shrink-0 appearance-none rounded-none border-0 bg-input px-2.5 text-sm shadow-none hover:bg-input focus:ring-0 focus:ring-offset-0 disabled:bg-input disabled:opacity-60",
);

const inputGroupSubjectTriggerClass =
  "h-9 max-h-9 min-w-0 flex-1 overflow-hidden rounded-none border-0 border-l border-input-border bg-input shadow-none hover:bg-input focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-input disabled:opacity-60";

type SubjectOption = { value: string; label: string };

type Props = {
  sectionId: string;
  subjectTypeFilter: ScriptControlSubjectTypeFilter;
  onSubjectTypeFilterChange: (value: ScriptControlSubjectTypeFilter) => void;
  subjectId: string;
  onSubjectChange: (id: string) => void;
  subjectOptions: SubjectOption[];
  disabled?: boolean;
  subjectEmptyText?: string;
};

export function ExaminersPageSubjectFilter({
  sectionId,
  subjectTypeFilter,
  onSubjectTypeFilterChange,
  subjectId,
  onSubjectChange,
  subjectOptions,
  disabled = false,
  subjectEmptyText = "No subject found.",
}: Props) {
  return (
    <CommandBarBorderField label="Subject" htmlFor={`${sectionId}-subject`} className="min-w-0 flex-1 sm:min-w-56">
      <div className={inputGroupShellClass}>
        <select
          id={`${sectionId}-subject-type`}
          aria-label="Subject type"
          className={cn(
            inputGroupSelectClass,
            "w-[28%] min-w-28 max-w-44 shrink-0 border-r border-input-border",
          )}
          value={subjectTypeFilter}
          disabled={disabled}
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
            disabled={disabled || subjectOptions.length === 0}
          />
        </div>
      </div>
    </CommandBarBorderField>
  );
}
