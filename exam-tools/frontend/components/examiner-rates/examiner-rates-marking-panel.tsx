"use client";

import {
  ExaminerRatesPaneHeader,
  InlineSearchField,
  rateAmountInputClass,
} from "@/components/examiner-rates/shared";
import type { ExaminerAllowanceSubjectRef } from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  markingCellKey,
  subjectTypeLabel,
  type MarkingDefaultsDraft,
  type MarkingRateDraft,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/examiner-rates-draft";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  editing: boolean;
  saving: boolean;
  subjects: ExaminerAllowanceSubjectRef[];
  searchedSubjects: ExaminerAllowanceSubjectRef[];
  markingRates: MarkingRateDraft;
  markingDefaults: MarkingDefaultsDraft;
  cellErrors: Record<string, string>;
  markingSubjectSearch: string;
  markingSubjectTypeFilter: ScriptControlSubjectTypeFilter;
  onDefaultsChange: (next: MarkingDefaultsDraft) => void;
  onSearchChange: (value: string) => void;
  onTypeFilterChange: (value: ScriptControlSubjectTypeFilter) => void;
  onMarkingCellChange: (subjectId: number, paperNumber: number, value: string) => void;
  onApplyDefaults: () => void;
};

export function ExaminerRatesMarkingPanel({
  editing,
  saving,
  subjects,
  searchedSubjects,
  markingRates,
  markingDefaults,
  cellErrors,
  markingSubjectSearch,
  markingSubjectTypeFilter,
  onDefaultsChange,
  onSearchChange,
  onTypeFilterChange,
  onMarkingCellChange,
  onApplyDefaults,
}: Props) {
  return (
    <div>
      <ExaminerRatesPaneHeader
        groupLabel="Amounts"
        title="Marking"
        description="Per-script rates by subject and paper. Exam defaults fill in when a subject cell is blank."
      />
      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No subjects are on this examination timetable yet. Add timetable subjects before configuring marking
          rates.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={formLabelClass} htmlFor="default-paper-1">
                Default Paper 1 (GHS)
              </label>
              <input
                id="default-paper-1"
                className={cn(rateAmountInputClass, "mt-1")}
                value={markingDefaults.paper1}
                disabled={!editing}
                onChange={(e) => onDefaultsChange({ ...markingDefaults, paper1: e.target.value })}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="default-paper-2">
                Default Paper 2 (GHS)
              </label>
              <input
                id="default-paper-2"
                className={cn(rateAmountInputClass, "mt-1")}
                value={markingDefaults.paper2}
                disabled={!editing}
                onChange={(e) => onDefaultsChange({ ...markingDefaults, paper2: e.target.value })}
              />
            </div>
            {editing ? (
              <div className="flex items-end">
                <button type="button" className={officialAccountsBtnPrimary} onClick={onApplyDefaults}>
                  Apply defaults to unset subjects
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full max-w-xs">
              <label className={formLabelClass} htmlFor="marking-subject-search">
                Search subjects
              </label>
              <InlineSearchField
                id="marking-subject-search"
                value={markingSubjectSearch}
                onChange={onSearchChange}
                placeholder="Code or name…"
                className="mt-1"
              />
            </div>
            <div className="w-full max-w-xs">
              <label className={formLabelClass} htmlFor="marking-subject-type-filter">
                Subject type
              </label>
              <select
                id="marking-subject-type-filter"
                className={cn(formInputClass, "mt-1")}
                value={markingSubjectTypeFilter}
                onChange={(e) => onTypeFilterChange(e.target.value as ScriptControlSubjectTypeFilter)}
              >
                {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {(markingSubjectSearch.trim() || markingSubjectTypeFilter !== "all") && (
              <p className="text-xs text-muted-foreground sm:pb-2">
                Showing {searchedSubjects.length} of {subjects.length} subjects
              </p>
            )}
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-3 py-2.5 font-semibold">Subject</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Paper 1 (GHS)</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Paper 2 (GHS)</th>
                </tr>
              </thead>
              <tbody>
                {searchedSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      {markingSubjectSearch.trim()
                        ? "No subjects match your search."
                        : "No subjects match this type filter."}
                    </td>
                  </tr>
                ) : (
                  searchedSubjects.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">{s.code || s.name}</span>
                        {s.code && s.name ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{s.name}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{subjectTypeLabel(s.subject_type)}</td>
                      {[1, 2].map((paperNumber) => {
                        const onTimetable = s.paper_numbers.includes(paperNumber);
                        const key = markingCellKey(s.id, paperNumber);
                        return (
                          <td key={paperNumber} className="px-3 py-2">
                            {!onTimetable ? (
                              <span className="block text-right text-muted-foreground">—</span>
                            ) : editing ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={saving}
                                className={rateAmountInputClass}
                                value={markingRates[key] ?? ""}
                                onChange={(e) => onMarkingCellChange(s.id, paperNumber, e.target.value)}
                                aria-invalid={Boolean(cellErrors[key])}
                                aria-label={`${s.code || s.name} paper ${paperNumber} rate`}
                              />
                            ) : (
                              <span className="block text-right tabular-nums">
                                {formatGhsAmount(markingRates[key] || null)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
