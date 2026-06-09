"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { EXAMINERS_EXAM_META_CLASS } from "@/components/examiners/constants";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { formatExamLabel } from "@/lib/official-rates-draft";
import type { Examination } from "@/lib/api";
import { officialAccountsCommandBarControlClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export const EXAMINERS_COMBOBOX_THRESHOLD = 20;

type Props = {
  exams: Examination[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  loadingExams?: boolean;
  singleExam?: Examination | null;
  rosterCount?: number;
  pendingInvitations?: number;
  showCreateExamsLink?: boolean;
  trailingContent?: ReactNode;
  /** Override display label per examination (e.g. subject officer assignment names). */
  examLabelFn?: (ex: Examination) => string;
  /** When true, examination is chosen in the dashboard bar; show read-only context here. */
  hideExamSelector?: boolean;
};

export function ExaminersContextBar({
  exams,
  examId,
  onExamChange,
  loadingExams = false,
  singleExam = null,
  rosterCount,
  pendingInvitations,
  showCreateExamsLink = true,
  trailingContent,
  examLabelFn,
  hideExamSelector = false,
}: Props) {
  const useCombobox = exams.length > EXAMINERS_COMBOBOX_THRESHOLD;
  const labelFor = (ex: Examination) => (examLabelFn ? examLabelFn(ex) : formatExamLabel(ex));
  const selectedExam = examId != null ? exams.find((e) => e.id === examId) : null;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        {hideExamSelector ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Examination</span>
            {selectedExam ? (
              <span className={EXAMINERS_EXAM_META_CLASS} title={labelFor(selectedExam)}>
                {labelFor(selectedExam)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Select an examination above</span>
            )}
          </div>
        ) : singleExam ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Examination</span>
            <span className={EXAMINERS_EXAM_META_CLASS} title={formatExamLabel(singleExam)}>
              {formatExamLabel(singleExam)}
            </span>
          </div>
        ) : (
          <div className="flex min-w-48 flex-col gap-1.5 sm:w-64">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="examiners-exam">
              Examination
            </label>
            {loadingExams ? (
              <select
                id="examiners-exam"
                className={cn(officialAccountsCommandBarControlClass, "w-full opacity-60")}
                disabled
                aria-busy="true"
              >
                <option>Loading examinations…</option>
              </select>
            ) : exams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No examinations yet.
                {showCreateExamsLink ? (
                  <>
                    {" "}
                    <Link
                      href="/dashboard/admin/examinations"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Create one
                    </Link>
                  </>
                ) : null}
              </p>
            ) : useCombobox ? (
              <SearchableCombobox
                id="examiners-exam"
                options={exams.map((ex) => ({ value: String(ex.id), label: labelFor(ex) }))}
                value={examId != null ? String(examId) : ""}
                onChange={(v) => onExamChange(v ? Number(v) : null)}
                placeholder="Select examination…"
                searchPlaceholder="Search exams…"
                widthClass="w-full sm:w-64"
                popoverWidthClass="w-[min(100vw-2rem,20rem)] sm:w-64"
                showAllOption={false}
                truncateTrigger
              />
            ) : (
              <select
                id="examiners-exam"
                className={cn(officialAccountsCommandBarControlClass, "w-full")}
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
        )}

        {examId != null && (rosterCount != null || pendingInvitations != null) ? (
          <div className="flex flex-wrap items-center gap-2 pb-0.5">
            {rosterCount != null ? (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
                {rosterCount.toLocaleString()} on roster
              </span>
            ) : null}
            {pendingInvitations != null && pendingInvitations > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                {pendingInvitations.toLocaleString()} pending invites
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {trailingContent ? <div className="flex shrink-0 items-center gap-2 pb-0.5">{trailingContent}</div> : null}
    </div>
  );
}
