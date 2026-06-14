"use client";

import { useEffect, useMemo, useState } from "react";

import { Download, Loader2 } from "lucide-react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  downloadAdminLunchCouponsPdf,
  downloadSubjectOfficerLunchCouponsPdf,
  listAllSubjects,
  type Subject,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import { officialAccountsCommandBarControlClass } from "@/lib/official-accounts-zone";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

const filterTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";

const filterSelectClass = cn(officialAccountsCommandBarControlClass, "h-10 w-full disabled:opacity-60");

type Props = {
  assignments: SubjectOfficerMeExamAssignment[];
  assignmentsLoading?: boolean;
  /** When true, subject list is limited to the officer's assigned subjects per examination. */
  officerMode?: boolean;
};

export function LunchCouponsPrintPanel({
  assignments,
  assignmentsLoading = false,
  officerMode = false,
}: Props) {
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(!officerMode);
  const [examId, setExamId] = useState<number | null>(
    assignments.length > 0 ? assignments[0]!.examination_id : null,
  );
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assignments.length > 0 && examId == null) {
      setExamId(assignments[0]!.examination_id);
    }
  }, [assignments, examId]);

  useEffect(() => {
    if (officerMode) {
      setSubjectsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setSubjectsLoading(true);
      try {
        const list = await listAllSubjects();
        if (!cancelled) setAllSubjects(list);
      } catch {
        if (!cancelled) setAllSubjects([]);
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [officerMode]);

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.examination_id === examId) ?? null,
    [assignments, examId],
  );

  const officerSubjects = useMemo(() => {
    if (!officerMode || !selectedAssignment) return [];
    if (subjectTypeFilter === "all") return selectedAssignment.subjects;
    return selectedAssignment.subjects.filter((s) => s.subject_type === subjectTypeFilter);
  }, [officerMode, selectedAssignment, subjectTypeFilter]);

  const adminFilteredSubjects = useMemo(() => {
    if (officerMode) return [];
    if (subjectTypeFilter === "all") return allSubjects;
    return allSubjects.filter((s) => s.subject_type === subjectTypeFilter);
  }, [allSubjects, officerMode, subjectTypeFilter]);

  const availableSubjectCount = officerMode ? officerSubjects.length : adminFilteredSubjects.length;

  useEffect(() => {
    setSubjectId(null);
  }, [examId, subjectTypeFilter, officerMode]);

  useEffect(() => {
    if (subjectId == null) return;
    if (officerMode) {
      if (!officerSubjects.some((s) => s.subject_id === subjectId)) {
        setSubjectId(null);
      }
      return;
    }
    if (!adminFilteredSubjects.some((s) => s.id === subjectId)) {
      setSubjectId(null);
    }
  }, [adminFilteredSubjects, officerMode, officerSubjects, subjectId]);

  const examOptions = useMemo(
    () =>
      assignments.map((a) => ({
        value: String(a.examination_id),
        label: a.examination_name,
      })),
    [assignments],
  );

  const subjectOptions = useMemo(() => {
    if (officerMode) {
      return officerSubjects.map((s) => ({
        value: String(s.subject_id),
        label: subjectDisplayLabel(s),
      }));
    }
    return adminFilteredSubjects.map((s) => ({
      value: String(s.id),
      label: `${s.code} — ${s.name}`,
    }));
  }, [adminFilteredSubjects, officerMode, officerSubjects]);

  const subjectEmptyText = useMemo(() => {
    if (subjectsLoading) return "Loading subjects…";
    if (officerMode) {
      if (!selectedAssignment) return "Select an examination first.";
      if (officerSubjects.length === 0) {
        return subjectTypeFilter === "all"
          ? "No assigned subjects for this examination."
          : `No assigned ${subjectTypeFilter.toLowerCase()} subjects.`;
      }
      return "No subject found.";
    }
    if (allSubjects.length === 0) return "No subjects loaded.";
    if (adminFilteredSubjects.length === 0) {
      return subjectTypeFilter === "all"
        ? "No subject found."
        : `No ${subjectTypeFilter.toLowerCase()} subjects.`;
    }
    return "No subject found.";
  }, [
    adminFilteredSubjects.length,
    allSubjects.length,
    officerMode,
    officerSubjects.length,
    selectedAssignment,
    subjectTypeFilter,
    subjectsLoading,
  ]);

  async function handleDownload() {
    if (examId == null || subjectId == null) return;
    setBusy(true);
    setError(null);
    try {
      if (officerMode) {
        await downloadSubjectOfficerLunchCouponsPdf({
          examination_id: examId,
          subject_id: subjectId,
        });
      } else {
        await downloadAdminLunchCouponsPdf({
          examination_id: examId,
          subject_id: subjectId,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF.");
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    assignmentsLoading || subjectsLoading || examId == null || subjectId == null || busy || availableSubjectCount === 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm">
      <div className="border-b border-border/70 bg-muted/15 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-foreground">Print lunch coupons</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose an examination and subject to print lunch coupons. Each page holds ten coupons in two columns — one per
          examiner, with their name, QR code, and reference code. Cut along the dashed lines before handing them out.
          {officerMode ? " You can only print for subjects assigned to you." : null}
        </p>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 sm:px-5">
        <CommandBarBorderField label="Examination" htmlFor="lunch-print-exam" className="min-w-0">
          <SearchableCombobox
            id="lunch-print-exam"
            options={examOptions}
            value={examId != null ? String(examId) : ""}
            onChange={(v) => {
              setExamId(v ? Number(v) : null);
              setError(null);
            }}
            placeholder="Select examination…"
            searchPlaceholder="Examination…"
            emptyText={assignments.length ? "No examination found." : "No examinations loaded."}
            widthClass="w-full"
            truncateTrigger
            triggerClassName={filterTriggerClass}
            showAllOption={false}
            disabled={assignmentsLoading || assignments.length === 0}
          />
        </CommandBarBorderField>
        <CommandBarBorderField label="Subject type" htmlFor="lunch-print-subject-type" className="min-w-0">
          <select
            id="lunch-print-subject-type"
            className={filterSelectClass}
            value={subjectTypeFilter}
            disabled={subjectsLoading || examId == null || (officerMode && !selectedAssignment)}
            onChange={(e) => {
              setSubjectTypeFilter(e.target.value as ScriptControlSubjectTypeFilter);
              setError(null);
            }}
          >
            {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </CommandBarBorderField>
        <CommandBarBorderField label="Subject" htmlFor="lunch-print-subject" className="min-w-0 sm:col-span-2 lg:col-span-1">
          <SearchableCombobox
            id="lunch-print-subject"
            options={subjectOptions}
            value={subjectId != null ? String(subjectId) : ""}
            onChange={(v) => {
              setSubjectId(v ? Number(v) : null);
              setError(null);
            }}
            placeholder="Select subject…"
            searchPlaceholder="Subject…"
            emptyText={subjectEmptyText}
            widthClass="w-full"
            truncateTrigger
            triggerClassName={filterTriggerClass}
            showAllOption={false}
            disabled={subjectsLoading || examId == null || availableSubjectCount === 0}
          />
        </CommandBarBorderField>
      </div>
      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-muted-foreground">
          Examiners must have reference codes assigned before printing.
        </p>
        <Button type="button" className="h-10 gap-2 shrink-0" disabled={disabled} onClick={() => void handleDownload()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
          Download PDF
        </Button>
      </div>
      {error ? (
        <p className="border-t border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-5">
          {error}
        </p>
      ) : null}
    </div>
  );
}
