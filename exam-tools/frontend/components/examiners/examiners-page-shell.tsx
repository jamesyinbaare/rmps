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
import { ExaminersGroupsPanel } from "@/components/examiners/examiners-groups-panel";
import { ExaminersInvitationsPanel } from "@/components/examiners/examiners-invitations-panel";
import { ExaminersRegionalQuotasPanel } from "@/components/examiners/examiners-regional-quotas-panel";
import { ExaminersRosterPanel } from "@/components/examiners/examiners-roster-panel";
import { SubjectMarkingGroupsPanel } from "@/components/subject-officer/subject-marking-groups-panel";
import type { ExaminersSummaryCounts, ExaminersTab } from "@/components/examiners/types";
import { useExaminersUrl } from "@/components/examiners/use-examiners-url";
import { SubjectOfficerExamSelector } from "@/components/subject-officer/subject-officer-exam-bar";
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
  showSubjectBadges: showSubjectBadgesProp,
  showQuotaAssessment: showQuotaAssessmentProp,
}: Props) {
  const isSubjectOfficerShell = subjectOfficerAssignments != null;
  const showSubjectBadges = showSubjectBadgesProp ?? isSubjectOfficerShell;
  const showQuotaAssessment = showQuotaAssessmentProp ?? isSubjectOfficerShell;
  const canManageExaminers = !isSubjectOfficerShell;
  const useScrollShell = true;
  const [examTimetableSubjects, setExamTimetableSubjects] = useState<Subject[]>([]);
  const resolvedMarkingGroupsMode: MarkingGroupsMode =
    markingGroupsMode ?? (hideGroups ? "hidden" : "admin-allocation");

  const { examId, activeTab, setExamId, setActiveTab } = useExaminersUrl({
    exams,
    singleExamMode,
    requireExamSelection,
  });

  const scopedSubjects = useMemo(() => {
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
    subjects,
  ]);

  useEffect(() => {
    if (!showSubjectBadges || isSubjectOfficerShell || examId == null) {
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
  }, [examId, isSubjectOfficerShell, showSubjectBadges]);

  const commandBarSubjects = isSubjectOfficerShell ? scopedSubjects : examTimetableSubjects;

  const examScopedSubjects = useMemo(() => {
    if (isSubjectOfficerShell) return scopedSubjects;
    if (showSubjectBadges && examTimetableSubjects.length > 0) return examTimetableSubjects;
    return subjects;
  }, [examTimetableSubjects, isSubjectOfficerShell, scopedSubjects, showSubjectBadges, subjects]);

  const baseTabs = useMemo((): { key: ExaminersTab; label: string }[] => {
    let tabs: { key: ExaminersTab; label: string }[] =
      resolvedMarkingGroupsMode === "hidden"
        ? EXAMINERS_TABS.filter((t) => t.key !== "groups")
        : [...EXAMINERS_TABS];
    if (showSubjectCohortsTab) {
      tabs = [
        ...tabs,
        { key: "appointment-letters", label: "Appointment letters" },
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
    <div className={officialAccountsCommandBarRowClass}>
      {isSubjectOfficerShell ? (
        <SubjectOfficerExamSelector
          assignments={subjectOfficerAssignments}
          examId={examId}
          onExamChange={setExamId}
          loading={assignmentsLoading}
          compact
        />
      ) : (
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
      )}
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
      {!showSubjectBadges && !isSubjectOfficerShell && contextTrailing ? (
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
          ) : (
            <>
              {activeTab === "roster" ? (
                <ExaminersRosterPanel
                  examId={examId}
                  subjects={scopedSubjects}
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
                />
              ) : null}
              {activeTab === "invitations" ? (
                <ExaminersInvitationsPanel
                  examId={examId}
                  subjects={scopedSubjects}
                  lockedSubjectIds={lockedSubjectIds}
                  embedded
                  pageScroll={useScrollShell}
                  readOnly={!canManageExaminers}
                  onInvitationCountsChange={onInvitationCountsChange}
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
                />
              ) : null}
              {activeTab === "quotas" && showSubjectCohortsTab ? (
                <ExaminersRegionalQuotasPanel
                  examId={examId}
                  subjects={examScopedSubjects}
                  embedded
                  pageScroll={useScrollShell}
                />
              ) : null}
              {activeTab === "cohorts" && showSubjectCohortsTab ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={examScopedSubjects}
                  canManageDefaultCohort
                  embedded
                  pageScroll={useScrollShell}
                />
              ) : null}
              {activeTab === "appointment-letters" && showSubjectCohortsTab ? (
                <ExaminersAppointmentLettersPanel examId={examId} />
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
