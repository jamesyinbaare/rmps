"use client";

import Link from "next/link";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { EXAMINERS_COMBOBOX_THRESHOLD } from "@/components/examiners/examiners-context-bar";
import { formatExamLabel } from "@/lib/official-rates-draft";
import type { Examination } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  loading?: boolean;
  compact?: boolean;
  singleExam?: Examination | null;
  showCreateExamsLink?: boolean;
  examLabelFn?: (ex: Examination) => string;
  id?: string;
};

export function ExaminersExamSelector({
  exams,
  examId,
  onExamChange,
  loading = false,
  compact = false,
  singleExam = null,
  showCreateExamsLink = true,
  examLabelFn,
  id = "examiners-exam-select",
}: Props) {
  const labelFor = (ex: Examination) => (examLabelFn ? examLabelFn(ex) : formatExamLabel(ex));
  const labelClass = compact ? "text-xs font-medium text-muted-foreground" : formLabelClass;
  const controlClass = compact ? cn(formInputClass, "mt-0.5 h-9") : cn(formInputClass, "mt-1");
  const wrapperClass = compact ? "min-w-0 w-full flex-1 sm:min-w-48 sm:max-w-xs" : "max-w-md";

  if (loading) {
    return (
      <div className={wrapperClass}>
        <label className={labelClass} htmlFor={id}>
          Examination
        </label>
        <select className={cn(controlClass, "opacity-60")} disabled aria-busy="true" id={id}>
          <option>Loading examinations…</option>
        </select>
      </div>
    );
  }

  if (singleExam) {
    return (
      <div className={wrapperClass}>
        <span className={labelClass}>Examination</span>
        <p className={cn(controlClass, "flex items-center font-medium")} title={labelFor(singleExam)}>
          {labelFor(singleExam)}
        </p>
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className={wrapperClass}>
        <span className={labelClass}>Examination</span>
        <p className="mt-1 text-sm text-muted-foreground">
          No examinations yet.
          {showCreateExamsLink ? (
            <>
              {" "}
              <Link href="/dashboard/admin/examinations" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  const useCombobox = exams.length > EXAMINERS_COMBOBOX_THRESHOLD;

  return (
    <div className={wrapperClass}>
      <label className={labelClass} htmlFor={id}>
        Examination
      </label>
      {useCombobox ? (
        <SearchableCombobox
          id={id}
          options={exams.map((ex) => ({ value: String(ex.id), label: labelFor(ex) }))}
          value={examId != null ? String(examId) : ""}
          onChange={(v) => onExamChange(v ? Number(v) : null)}
          placeholder="Select examination…"
          searchPlaceholder="Search examinations…"
          showAllOption={false}
          widthClass="w-full mt-0.5"
          triggerClassName="h-9 min-h-9"
          truncateTrigger
        />
      ) : (
        <select
          id={id}
          className={controlClass}
          value={examId ?? ""}
          onChange={(e) => onExamChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select examination…</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {labelFor(ex)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
