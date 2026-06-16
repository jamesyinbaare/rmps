"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EXAMINERS_PAGE_LAYOUT_CLASS,
  EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS,
  EXAMINERS_PANEL_FILL_CLASS,
  EXAMINERS_PANEL_SCROLL_CLASS,
  EXAMINERS_TAB_PANEL_CLASS,
  EXAMINERS_TAB_PANEL_SCROLL_CLASS,
  EXAMINERS_TABS,
} from "@/components/examiners/constants";
import { ExaminersAppointmentLettersPanel } from "@/components/examiners/examiners-appointment-letters-panel";
import { ExaminersContextBar } from "@/components/examiners/examiners-context-bar";
import { ExaminersExamSelector } from "@/components/examiners/examiners-exam-selector";
import { ExaminersPageSubjectFilter } from "@/components/examiners/examiners-page-subject-filter";
import { ExaminersGroupsPanel } from "@/components/examiners/examiners-groups-panel";
import { ExaminersInvitationsPanel } from "@/components/examiners/examiners-invitations-panel";
import { ExaminersRegionalQuotasPanel } from "@/components/examiners/examiners-regional-quotas-panel";
import { ExaminersRosterPanel } from "@/components/examiners/examiners-roster-panel";
import { SubjectMarkingGroupsPanel } from "@/components/subject-officer/subject-marking-groups-panel";
import type { ExaminersSummaryCounts, ExaminersTab } from "@/components/examiners/types";
import { useExaminersUrl } from "@/components/examiners/use-examiners-url";
import { SubjectOfficerWorkspaceStrip } from "@/components/subject-officer/subject-officer-workspace-strip";
import { Badge } from "@/components/ui/badge";
import type { InvitationStatusCounts } from "@/components/examiner-invitations/types";
import { OfficialAccountsRoleTabs } from "@/components/official-accounts-role-tabs";
import {
  getExaminationScriptSeriesConfig,
  type Examination,
  type Subject,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarRowClass,
} from "@/lib/official-accounts-zone";
import { subjectDisplayLabel } from "@/lib/subject-display";
import {
  subjectIdsForExam,
  subjectsForExam,
} from "@/lib/subject-officer-exams";
import { cn } from "@/lib/utils";

type MarkingGroupsMode = "admin-allocation" | "subject-officer" | "hidden";

type Props = {
  exams: Examination[];
  subjects: Subject[];
  isSuperAdmin: boolean;
  lockedSubjectIds?: number[];
  /** @deprecated Use markingGroupsMode instead */
  hideGroups?: boolean;
  markingGroupsMode?: MarkingGroupsMode;
  showScriptsAllocationLink?: boolean;
  loadingExams?: boolean;
  singleExamMode?: boolean;
  requireExamSelection?: boolean;
  examLabelFn?: (ex: Examination) => string;
  showCreateExamsLink?: boolean;
  /** Super Admin / Test Admin Officer: subject marking cohorts tab with default cohort management. */
  showSubjectCohortsTab?: boolean;
  /** Subject officer: inline exam command bar (matches allocations/overview). */
  subjectOfficerAssignments?: SubjectOfficerMeExamAssignment[];
  assignmentsLoading?: boolean;
  /** Subject officer: fixed workspace from JWT (exam + subject). */
  subjectOfficerWorkspace?: {
    examId: number;
    subjectId: number;
    label: string | null;
    subjects: Subject[];
  };
  /** Show subject badges in the exam command bar (subject-officer layout). */
  showSubjectBadges?: boolean;
  /** Roster: show regional quota self-test (subject-officer layout). */
  showQuotaAssessment?: boolean;
};

const EMPTY_SUMMARY: ExaminersSummaryCounts = {
  roster: 0,
  invitationsPending: 0,
  invitationsAccepted: 0,
};

export function ExaminersPageShell({
  exams,
  subjects,
  isSuperAdmin,
  lockedSubjectIds,
  hideGroups = false,
  markingGroupsMode,
  showScriptsAllocationLink = true,
  loadingExams = false,
  singleExamMode = false,
  requireExamSelection = false,
  examLabelFn,
  showCreateExamsLink = true,
  showSubjectCohortsTab = false,
  subjectOfficerAssignments,
  assignmentsLoading = false,
  subjectOfficerWorkspace,
  showSubjectBadges: showSubjectBadgesProp,
  showQuotaAssessment: showQuotaAssessmentProp,
}: Props) {
  const isSubjectOfficerShell = subjectOfficerAssignments != null;
  const showSubjectBadges =
    subjectOfficerWorkspace != null ? false : (showSubjectBadgesProp ?? isSubjectOfficerShell);
  const showQuotaAssessment = showQuotaAssessmentProp ?? isSubjectOfficerShell;
  const canManageExaminers = !isSubjectOfficerShell;
  const useScrollShell = true;
  const [examTimetableSubjects, setExamTimetableSubjects] = useState<Subject[]>([]);
  const resolvedMarkingGroupsMode: MarkingGroupsMode =
    markingGroupsMode ?? (hideGroups ? "hidden" : "admin-allocation");

  const {
    examId: urlExamId,
    activeTab,
    subjectTypeFilter,
    subjectId,
    setExamId,
    setActiveTab,
    setSubjectTypeFilter,
    setSubjectId,
  } = useExaminersUrl({
    exams,
    singleExamMode,
    requireExamSelection: isSubjectOfficerShell ? false : requireExamSelection,
    syncSubjectInUrl: showSubjectCohortsTab,
  });

  const examId = subjectOfficerWorkspace?.examId ?? urlExamId;

  const scopedSubjects = useMemo(() => {
    if (subjectOfficerWorkspace) return subjectOfficerWorkspace.subjects;
    const baseSubjects = isSubjectOfficerShell
      ? subjectsForExam(subjectOfficerAssignments, examId)
      : subjects;
    if (!lockedSubjectIds?.length && !isSubjectOfficerShell) return baseSubjects;
    const allowed = new Set(
      isSubjectOfficerShell
        ? subjectIdsForExam(subjectOfficerAssignments, examId)
        : (lockedSubjectIds ?? []),
    );
    if (isSubjectOfficerShell && allowed.size === 0) return baseSubjects;
    return baseSubjects.filter((s) => allowed.has(s.id));
  }, [
    examId,
    isSubjectOfficerShell,
    lockedSubjectIds,
    subjectOfficerAssignments,
    subjectOfficerWorkspace,
    subjects,
  ]);

  useEffect(() => {
    if ((!showSubjectBadges && !showSubjectCohortsTab) || isSubjectOfficerShell || examId == null) {
      setExamTimetableSubjects([]);
      return;
    }
    let cancelled = false;
    void getExaminationScriptSeriesConfig(examId)
      .then((res) => {
        if (cancelled) return;
        setExamTimetableSubjects(
          res.items.map((row) => ({
            id: row.subject_id,
            code: row.subject_code,
            original_code: null,
            name: row.subject_name,
            subject_type: row.subject_type,
            created_at: "",
            updated_at: "",
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setExamTimetableSubjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, isSubjectOfficerShell, showSubjectBadges, showSubjectCohortsTab]);

  const commandBarSubjects = isSubjectOfficerShell ? scopedSubjects : examTimetableSubjects;

  const examScopedSubjects = useMemo(() => {
    if (isSubjectOfficerShell) return scopedSubjects;
    if ((showSubjectBadges || showSubjectCohortsTab) && examTimetableSubjects.length > 0) {
      return examTimetableSubjects;
    }
    return subjects;
  }, [examTimetableSubjects, isSubjectOfficerShell, scopedSubjects, showSubjectBadges, showSubjectCohortsTab, subjects]);

  const pageSubjectOptions = useMemo(() => {
    if (!showSubjectCohortsTab) return [];
    return examScopedSubjects
      .filter((s) => subjectTypeFilter === "all" || s.subject_type === subjectTypeFilter)
      .slice()
      .sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b)))
      .map((s) => ({
        value: String(s.id),
        label: subjectDisplayLabel(s),
      }));
  }, [examScopedSubjects, showSubjectCohortsTab, subjectTypeFilter]);

  useEffect(() => {
    if (!showSubjectCohortsTab || examId == null) return;
    if (pageSubjectOptions.length === 0) {
      if (subjectId) setSubjectId("");
      return;
    }
    if (!subjectId || !pageSubjectOptions.some((opt) => opt.value === subjectId)) {
      setSubjectId(pageSubjectOptions[0]!.value);
    }
  }, [examId, pageSubjectOptions, setSubjectId, showSubjectCohortsTab, subjectId]);

  const usePageSubjectScope = showSubjectCohortsTab && examId != null;

  const baseTabs = useMemo((): { key: ExaminersTab; label: string }[] => {
    let tabs: { key: ExaminersTab; label: string }[] =
      resolvedMarkingGroupsMode === "hidden"
        ? EXAMINERS_TABS.filter((t) => t.key !== "groups")
        : [...EXAMINERS_TABS];
    if (showSubjectCohortsTab) {
      tabs = [
        ...tabs,
        { key: "appointment-letters", label: "Appointment letter setup" },
        { key: "quotas", label: "Regional quotas" },
        { key: "cohorts", label: "Cohorts" },
      ];
    }
    return tabs;
  }, [resolvedMarkingGroupsMode, showSubjectCohortsTab]);
  const [summaryByExam, setSummaryByExam] = useState<Record<number, ExaminersSummaryCounts>>({});

  const summary = examId != null ? (summaryByExam[examId] ?? EMPTY_SUMMARY) : EMPTY_SUMMARY;
  const singleExam =
    requireExamSelection || exams.length !== 1 ? null : exams[0] ?? null;

  const tabsWithCounts = useMemo(() => {
    return baseTabs.map((tab) => {
      let label =
        tab.key === "groups" && resolvedMarkingGroupsMode === "subject-officer"
          ? "Cohorts"
          : tab.label;
      if (examId == null) return { ...tab, label };
      if (tab.key === "roster" && summary.roster > 0) {
        label = `${label} (${summary.roster.toLocaleString()})`;
      }
      if (tab.key === "invitations" && summary.invitationsPending > 0) {
        label = `${label} (${summary.invitationsPending.toLocaleString()} pending)`;
      }
      return { ...tab, label };
    });
  }, [baseTabs, examId, resolvedMarkingGroupsMode, summary.invitationsPending, summary.roster]);

  const scriptsAllocationHref =
    examId != null
      ? `/dashboard/admin/scripts-allocation?exam=${examId}`
      : "/dashboard/admin/scripts-allocation";

  const onRosterCountChange = useCallback(
    (count: number) => {
      if (examId == null) return;
      setSummaryByExam((prev) => ({
        ...prev,
        [examId]: { ...(prev[examId] ?? EMPTY_SUMMARY), roster: count },
      }));
    },
    [examId],
  );

  const onInvitationCountsChange = useCallback(
    (counts: InvitationStatusCounts) => {
      if (examId == null) return;
      setSummaryByExam((prev) => ({
        ...prev,
        [examId]: {
          ...(prev[examId] ?? EMPTY_SUMMARY),
          invitationsPending: counts.pending,
          invitationsAccepted: counts.accepted,
        },
      }));
    },
    [examId],
  );

  const tabAnnouncement = useMemo(() => {
    const tabLabel = baseTabs.find((t) => t.key === activeTab)?.label ?? activeTab;
    if (examId == null) return tabLabel;
    return `${tabLabel} — ${summary.roster} on roster, ${summary.invitationsPending} pending invites`;
  }, [activeTab, baseTabs, examId, summary.invitationsPending, summary.roster]);

  const contextTrailing =
    showScriptsAllocationLink && examId != null ? (
      <Link
        href={scriptsAllocationHref}
        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Scripts allocation →
      </Link>
    ) : null;

  const examCommandBar = (
    <div
      className={cn(
        officialAccountsCommandBarRowClass,
        showSubjectCohortsTab && examId != null && "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-end",
      )}
    >
      {subjectOfficerWorkspace ? (
        <SubjectOfficerWorkspaceStrip
          workspaceLabel={subjectOfficerWorkspace.label}
          workspace={null}
        />
      ) : !isSubjectOfficerShell ? (
        <ExaminersExamSelector
          exams={exams}
          examId={examId}
          onExamChange={setExamId}
          loading={loadingExams}
          singleExam={singleExam}
          showCreateExamsLink={showCreateExamsLink}
          examLabelFn={examLabelFn}
          compact
        />
      ) : null}
      {showSubjectCohortsTab && examId != null ? (
        <ExaminersPageSubjectFilter
          sectionId="admin-examiners"
          subjectTypeFilter={subjectTypeFilter}
          onSubjectTypeFilterChange={setSubjectTypeFilter}
          subjectId={subjectId}
          onSubjectChange={setSubjectId}
          subjectOptions={pageSubjectOptions}
          disabled={examTimetableSubjects.length === 0}
          subjectEmptyText={
            examTimetableSubjects.length === 0
              ? "No subjects in this examination."
              : "No subject matches this type."
          }
        />
      ) : null}
      {showSubjectBadges && commandBarSubjects.length > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Subjects</span>
          {commandBarSubjects.map((s) => (
            <Badge
              key={s.id}
              variant="outline"
              className="border-border/80 bg-background/80 font-normal"
            >
              {subjectDisplayLabel(s)}
            </Badge>
          ))}
        </div>
      ) : null}
      {!showSubjectBadges && !showSubjectCohortsTab && !isSubjectOfficerShell && contextTrailing ? (
        <div className="flex shrink-0 items-end pb-0.5">{contextTrailing}</div>
      ) : null}
    </div>
  );

  const showContextBar =
    examId != null &&
    !showSubjectBadges &&
    (isSubjectOfficerShell
      ? contextTrailing != null
      : summary.roster > 0 || summary.invitationsPending > 0);

  return (
    <div className={cn(useScrollShell ? EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS : EXAMINERS_PAGE_LAYOUT_CLASS, "p-3 md:p-4")}>
      <section className={useScrollShell ? EXAMINERS_PANEL_SCROLL_CLASS : EXAMINERS_PANEL_FILL_CLASS}>
        <div className="relative z-20 shrink-0 rounded-t-2xl border-b border-border/80 bg-linear-to-b from-muted/35 to-muted/10">
          <div className={officialAccountsCommandBarClass}>{examCommandBar}</div>
          {showContextBar ? (
            <ExaminersContextBar
              exams={exams}
              examId={examId}
              onExamChange={setExamId}
              loadingExams={loadingExams}
              singleExam={singleExam}
              rosterCount={examId != null ? summary.roster : undefined}
              pendingInvitations={examId != null ? summary.invitationsPending : undefined}
              showCreateExamsLink={showCreateExamsLink}
              examLabelFn={examLabelFn}
              hideExamSelector
              hideExamDisplay
              trailingContent={isSubjectOfficerShell ? contextTrailing : undefined}
            />
          ) : null}
          <OfficialAccountsRoleTabs
            tabs={tabsWithCounts}
            activeKey={activeTab}
            onChange={setActiveTab}
            ariaLabel="Examiners sections"
            variant="compact"
          />
        </div>

        <div
          role="tabpanel"
          id={`admin-eo-panel-${activeTab}`}
          aria-labelledby={`admin-eo-tab-${activeTab}`}
          aria-live="polite"
          className={useScrollShell ? EXAMINERS_TAB_PANEL_SCROLL_CLASS : EXAMINERS_TAB_PANEL_CLASS}
        >
          <p className="sr-only">{tabAnnouncement}</p>
          {examId == null ? (
            <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Select an examination</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Choose an examination using the{" "}
                <label
                  htmlFor={isSubjectOfficerShell ? "so-exam-select" : "examiners-exam-select"}
                  className="font-medium text-foreground"
                >
                  Examination
                </label>{" "}
                control above to view roster, invitations, and related tools.
              </p>
            </div>
          ) : examId != null && usePageSubjectScope && pageSubjectOptions.length === 0 ? (
            <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No subjects for this examination</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add subjects to the examination timetable before managing examiners by subject.
              </p>
            </div>
          ) : (
            <>
              {activeTab === "roster" ? (
                <ExaminersRosterPanel
                  examId={examId}
                  subjects={showSubjectCohortsTab ? examScopedSubjects : scopedSubjects}
                  isSuperAdmin={isSuperAdmin}
                  lockedSubjectIds={lockedSubjectIds}
                  embedded
                  pageScroll={useScrollShell}
                  loadExaminerGroups={resolvedMarkingGroupsMode === "admin-allocation"}
                  showReferenceCodesConfig={showSubjectCohortsTab}
                  showQuotaAssessment={showQuotaAssessment}
                  canManageRoster={canManageExaminers}
                  canEditRoster={canManageExaminers}
                  onRosterCountChange={onRosterCountChange}
                  usePageSubjectScope={usePageSubjectScope}
                  pageSubjectTypeFilter={subjectTypeFilter}
                  pageSubjectId={subjectId}
                  mobileContactLayout={isSubjectOfficerShell}
                />
              ) : null}
              {activeTab === "invitations" ? (
                <ExaminersInvitationsPanel
                  examId={examId}
                  subjects={showSubjectCohortsTab ? examScopedSubjects : scopedSubjects}
                  lockedSubjectIds={lockedSubjectIds}
                  embedded
                  pageScroll={useScrollShell}
                  readOnly={!canManageExaminers}
                  onInvitationCountsChange={onInvitationCountsChange}
                  usePageSubjectScope={usePageSubjectScope}
                  pageSubjectTypeFilter={subjectTypeFilter}
                  pageSubjectId={subjectId}
                  mobileContactLayout={isSubjectOfficerShell}
                />
              ) : null}
              {activeTab === "groups" && resolvedMarkingGroupsMode === "admin-allocation" ? (
                <ExaminersGroupsPanel
                  examId={examId}
                  embedded
                  pageScroll={useScrollShell}
                />
              ) : null}
              {activeTab === "groups" && resolvedMarkingGroupsMode === "subject-officer" ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={scopedSubjects}
                  embedded
                  pageScroll={useScrollShell}
                  canManageCohorts={canManageExaminers}
                  lockedSubjectId={subjectOfficerWorkspace?.subjectId}
                  workspaceLabel={subjectOfficerWorkspace?.label}
                />
              ) : null}
              {activeTab === "quotas" && showSubjectCohortsTab ? (
                <ExaminersRegionalQuotasPanel
                  examId={examId}
                  subjects={examScopedSubjects}
                  embedded
                  pageScroll={useScrollShell}
                  usePageSubjectScope={usePageSubjectScope}
                  pageSubjectTypeFilter={subjectTypeFilter}
                  pageSubjectId={subjectId}
                />
              ) : null}
              {activeTab === "cohorts" && showSubjectCohortsTab ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={examScopedSubjects}
                  canManageDefaultCohort
                  embedded
                  pageScroll={useScrollShell}
                  lockedSubjectId={usePageSubjectScope && subjectId ? Number(subjectId) : undefined}
                />
              ) : null}
              {activeTab === "appointment-letters" && showSubjectCohortsTab ? (
                <ExaminersAppointmentLettersPanel
                  examId={examId}
                  exams={exams}
                  defaultSubjectId={subjectId ? Number(subjectId) : undefined}
                />
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
