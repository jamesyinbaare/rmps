"use client";

import { SearchableCombobox } from "@/components/searchable-combobox";
import type { SubjectOfficerMeExamAssignment } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const COMBO_THRESHOLD = 5;

type Props = {
  assignments: SubjectOfficerMeExamAssignment[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  loading?: boolean;
  compact?: boolean;
};

export function SubjectOfficerExamSelector({
  assignments,
  examId,
  onExamChange,
  loading = false,
  compact = false,
}: Props) {
  const options = assignments.map((a) => ({
    value: String(a.examination_id),
    label: a.examination_name,
  }));

  const labelClass = compact ? "text-xs font-medium text-muted-foreground" : formLabelClass;
  const controlClass = compact ? cn(formInputClass, "mt-0.5 h-9") : cn(formInputClass, "mt-1");

  if (loading) {
    return (
      <div className={compact ? "min-w-48" : "max-w-md"}>
        <span className={labelClass}>Examination</span>
        <select className={cn(controlClass, "opacity-60")} disabled aria-busy="true">
          <option>Loading examinations…</option>
        </select>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No examination assignments found for your account.</p>
    );
  }

  return (
    <div className={compact ? "min-w-48 flex-1 sm:max-w-xs" : "max-w-md"}>
      <label className={labelClass} htmlFor="so-exam-select">
        Examination
      </label>
      {assignments.length >= COMBO_THRESHOLD ? (
        <SearchableCombobox
          id="so-exam-select"
          options={options}
          value={examId != null ? String(examId) : ""}
          onChange={(v) => onExamChange(v ? Number(v) : null)}
          placeholder="Select examination…"
          searchPlaceholder="Search examinations…"
          showAllOption={false}
          widthClass="w-full mt-1"
          triggerClassName="h-9 min-h-9"
          truncateTrigger
        />
      ) : (
        <select
          id="so-exam-select"
          className={controlClass}
          value={examId ?? ""}
          onChange={(e) => onExamChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select examination…</option>
          {assignments.map((a) => (
            <option key={a.examination_id} value={a.examination_id}>
              {a.examination_name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

type BarProps = Props & {
  subjectSummary?: string | null;
};

export function SubjectOfficerExamBar({
  assignments,
  examId,
  onExamChange,
  loading = false,
  subjectSummary = null,
}: BarProps) {
  const selected = assignments.find((a) => a.examination_id === examId);

  return (
    <div className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-4">
        <SubjectOfficerExamSelector
          assignments={assignments}
          examId={examId}
          onExamChange={onExamChange}
          loading={loading}
          compact
        />
        {selected && subjectSummary ? (
          <p className="pb-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Subjects:</span> {subjectSummary}
          </p>
        ) : null}
      </div>
    </div>
  );
}
