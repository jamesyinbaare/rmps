"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Download, Loader2 } from "lucide-react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { SubjectOfficerWorkspaceStrip } from "@/components/subject-officer/subject-officer-workspace-strip";
import { Button } from "@/components/ui/button";
import {
  downloadAdminLunchCouponsPdf,
  downloadSubjectOfficerLunchCouponsPdf,
  listAllSubjects,
  listSubjectMarkingGroups,
  type Subject,
  type SubjectMarkingGroupRow,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import {
  DEFAULT_LUNCH_COUPON_BRAND_COLOR,
  LUNCH_COUPON_BRAND_COLORS,
  type LunchCouponBrandColorKey,
} from "@/lib/lunch-coupon-brand-colors";
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

const ALL_COHORTS_VALUE = "";

type Props = {
  assignments: SubjectOfficerMeExamAssignment[];
  assignmentsLoading?: boolean;
  /** When true, subject list is limited to the officer's assigned subjects per examination. */
  officerMode?: boolean;
  workspaceExamId?: number;
  workspaceSubjectId?: number;
  workspaceLabel?: string | null;
};

export function LunchCouponsPrintPanel({
  assignments,
  assignmentsLoading = false,
  officerMode = false,
  workspaceExamId,
  workspaceSubjectId,
  workspaceLabel,
}: Props) {
  const workspaceLocked = workspaceExamId != null && workspaceSubjectId != null;
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(!officerMode);
  const [examId, setExamId] = useState<number | null>(
    workspaceExamId ?? (assignments.length > 0 ? assignments[0]!.examination_id : null),
  );
  const [subjectId, setSubjectId] = useState<number | null>(workspaceSubjectId ?? null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [cohorts, setCohorts] = useState<SubjectMarkingGroupRow[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(false);
  const [cohortId, setCohortId] = useState(ALL_COHORTS_VALUE);
  const [brandColor, setBrandColor] = useState<LunchCouponBrandColorKey>(DEFAULT_LUNCH_COUPON_BRAND_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceLocked) {
      setExamId(workspaceExamId!);
      setSubjectId(workspaceSubjectId!);
      return;
    }
    if (assignments.length > 0 && examId == null) {
      setExamId(assignments[0]!.examination_id);
    }
  }, [assignments, examId, workspaceExamId, workspaceLocked, workspaceSubjectId]);

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

  const loadCohorts = useCallback(async () => {
    if (examId == null || subjectId == null) {
      setCohorts([]);
      return;
    }
    setCohortsLoading(true);
    try {
      const rows = await listSubjectMarkingGroups(examId, subjectId);
      setCohorts(rows);
    } catch {
      setCohorts([]);
    } finally {
      setCohortsLoading(false);
    }
  }, [examId, subjectId]);

  useEffect(() => {
    void loadCohorts();
  }, [loadCohorts]);

  useEffect(() => {
    setCohortId(ALL_COHORTS_VALUE);
  }, [examId, subjectId]);

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
    if (workspaceLocked) return;
    setSubjectId(null);
  }, [examId, subjectTypeFilter, officerMode, workspaceLocked]);

  useEffect(() => {
    if (subjectId == null || workspaceLocked) return;
    if (officerMode) {
      if (!officerSubjects.some((s) => s.subject_id === subjectId)) {
        setSubjectId(null);
      }
      return;
    }
    if (!adminFilteredSubjects.some((s) => s.id === subjectId)) {
      setSubjectId(null);
    }
  }, [adminFilteredSubjects, officerMode, officerSubjects, subjectId, workspaceLocked]);

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
      const params = {
        examination_id: examId,
        subject_id: subjectId,
        group_id: cohortId || undefined,
        color: brandColor,
      };
      if (officerMode) {
        await downloadSubjectOfficerLunchCouponsPdf(params);
      } else {
        await downloadAdminLunchCouponsPdf(params);
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
          Choose an examination and subject to print lunch coupons. Optionally filter by cohort and pick a brand color.
          Each page holds ten coupons in two columns — one per examiner, with their name, QR code, and reference code.
          Cut along the dashed lines before handing them out.
          {officerMode ? " You can only print for subjects assigned to you." : null}
        </p>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 sm:px-5">
        {workspaceLocked ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <SubjectOfficerWorkspaceStrip workspaceLabel={workspaceLabel} workspace={null} />
          </div>
        ) : (
          <>
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
          </>
        )}
        <CommandBarBorderField label="Cohort" htmlFor="lunch-print-cohort" className="min-w-0 sm:col-span-2 lg:col-span-1">
          <select
            id="lunch-print-cohort"
            className={filterSelectClass}
            value={cohortId}
            disabled={examId == null || subjectId == null || cohortsLoading}
            onChange={(e) => {
              setCohortId(e.target.value);
              setError(null);
            }}
          >
            <option value={ALL_COHORTS_VALUE}>
              {cohortsLoading ? "Loading cohorts…" : "All examiners on subject"}
            </option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </CommandBarBorderField>
        <div className="sm:col-span-2 lg:col-span-2">
          <p className="mb-2 text-xs font-medium text-foreground">Brand color</p>
          <div className="flex flex-wrap gap-2">
            {LUNCH_COUPON_BRAND_COLORS.map((option) => {
              const selected = brandColor === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={option.label}
                  disabled={disabled && !selected}
                  onClick={() => {
                    setBrandColor(option.key);
                    setError(null);
                  }}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    selected
                      ? "border-foreground/30 bg-muted/50 text-foreground ring-2 ring-ring/30"
                      : "border-border/70 bg-background text-muted-foreground hover:bg-muted/30",
                  )}
                >
                  <span
                    className="size-4 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: option.hex }}
                    aria-hidden
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
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
