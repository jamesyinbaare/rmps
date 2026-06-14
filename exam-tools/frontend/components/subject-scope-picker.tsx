"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import type { SubjectTypeEnum } from "@/lib/api";

export type SubjectScopePickerSubject = {
  id: number;
  code: string;
  name: string;
  subject_type: SubjectTypeEnum | string;
};
import { formLabelClass } from "@/lib/form-classes";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

type Props = {
  subjects: SubjectScopePickerSubject[];
  selectedSubjectId: number | null;
  onSelectedSubjectIdChange: (id: number | null) => void;
  subjectComboboxId: string;
  disabled?: boolean;
  className?: string;
  /** Reset type filter when this key changes (e.g. examination id). */
  resetKey?: string | number | null;
};

export function SubjectScopePicker({
  subjects,
  selectedSubjectId,
  onSelectedSubjectIdChange,
  subjectComboboxId,
  disabled = false,
  className,
  resetKey,
}: Props) {
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");

  const filteredSubjects = useMemo(() => {
    return subjects
      .filter((s) => subjectTypeFilter === "all" || s.subject_type === subjectTypeFilter)
      .sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b)));
  }, [subjects, subjectTypeFilter]);

  const subjectOptions = useMemo(
    () =>
      filteredSubjects.map((s) => ({
        value: String(s.id),
        label: subjectDisplayLabel(s),
      })),
    [filteredSubjects],
  );

  useEffect(() => {
    setSubjectTypeFilter("all");
    onSelectedSubjectIdChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when examination changes
  }, [resetKey]);

  useEffect(() => {
    if (
      selectedSubjectId != null &&
      !filteredSubjects.some((s) => s.id === selectedSubjectId)
    ) {
      onSelectedSubjectIdChange(null);
    }
  }, [filteredSubjects, onSelectedSubjectIdChange, selectedSubjectId]);

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]", className)}>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject type</p>
        <div className="flex flex-wrap gap-2">
          {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={subjectTypeFilter === opt.value ? "default" : "outline"}
              disabled={disabled}
              onClick={() => setSubjectTypeFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className={formLabelClass} htmlFor={subjectComboboxId}>
          Subject
        </label>
        {subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No subjects on this examination timetable yet.
          </p>
        ) : filteredSubjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No subjects match this type.
          </p>
        ) : (
          <SearchableCombobox
            id={subjectComboboxId}
            options={subjectOptions}
            value={selectedSubjectId != null ? String(selectedSubjectId) : ""}
            onChange={(value) => onSelectedSubjectIdChange(value ? Number(value) : null)}
            placeholder="Select subject"
            searchPlaceholder="Search subjects…"
            widthClass="w-full"
            showAllOption={false}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
