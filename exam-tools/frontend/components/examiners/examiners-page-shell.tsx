"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import {
  EXAMINERS_PAGE_LAYOUT_CLASS,
  EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS,
  EXAMINERS_PANEL_FILL_CLASS,
  EXAMINERS_PANEL_SCROLL_CLASS,
  EXAMINERS_TAB_PANEL_CLASS,
  EXAMINERS_TAB_PANEL_SCROLL_CLASS,
  EXAMINERS_TABS,
} from "@/components/examiners/constants";
import { ExaminersContextBar } from "@/components/examiners/examiners-context-bar";
import { ExaminersGroupsPanel } from "@/components/examiners/examiners-groups-panel";
import { ExaminersInvitationsPanel } from "@/components/examiners/examiners-invitations-panel";
import { ExaminersRosterPanel } from "@/components/examiners/examiners-roster-panel";
import { SubjectMarkingGroupsPanel } from "@/components/subject-officer/subject-marking-groups-panel";
import type { ExaminersSummaryCounts, ExaminersTab } from "@/components/examiners/types";
import { useExaminersUrl } from "@/components/examiners/use-examiners-url";
import { SubjectOfficerExamSelector } from "@/components/subject-officer/subject-officer-exam-bar";
import { Badge } from "@/components/ui/badge";
import type { InvitationStatusCounts } from "@/components/examiner-invitations/types";
import { OfficialAccountsRoleTabs } from "@/components/official-accounts-role-tabs";
import type { Examination, Subject, SubjectOfficerMeExamAssignment } from "@/lib/api";
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
}: Props) {
  const isSubjectOfficerShell = subjectOfficerAssignments != null;
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

  const baseTabs = useMemo((): { key: ExaminersTab; label: string }[] => {
    let tabs: { key: ExaminersTab; label: string }[] =
      resolvedMarkingGroupsMode === "hidden"
        ? EXAMINERS_TABS.filter((t) => t.key !== "groups")
        : [...EXAMINERS_TABS];
    if (showSubjectCohortsTab) {
      tabs = [...tabs, { key: "cohorts", label: "Cohorts" }];
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

  const subjectOfficerCommandBar = isSubjectOfficerShell ? (
    <div className={officialAccountsCommandBarRowClass}>
      <SubjectOfficerExamSelector
        assignments={subjectOfficerAssignments}
        examId={examId}
        onExamChange={setExamId}
        loading={assignmentsLoading}
        compact
      />
      {scopedSubjects.length > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Subjects</span>
          {scopedSubjects.map((s) => (
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
    </div>
  ) : null;

  const showContextBar =
    !isSubjectOfficerShell || examId != null || contextTrailing != null;

  return (
    <div
      className={cn(
        isSubjectOfficerShell ? EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS : EXAMINERS_PAGE_LAYOUT_CLASS,
        "p-3 md:p-4",
      )}
    >
      <section className={isSubjectOfficerShell ? EXAMINERS_PANEL_SCROLL_CLASS : EXAMINERS_PANEL_FILL_CLASS}>
        <div className="relative z-20 shrink-0 rounded-t-2xl border-b border-border/80 bg-linear-to-b from-muted/35 to-muted/10">
          {subjectOfficerCommandBar ? (
            <div className={officialAccountsCommandBarClass}>{subjectOfficerCommandBar}</div>
          ) : null}
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
              hideExamSelector={requireExamSelection && !isSubjectOfficerShell}
              hideExamDisplay={isSubjectOfficerShell}
              trailingContent={contextTrailing}
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
          className={isSubjectOfficerShell ? EXAMINERS_TAB_PANEL_SCROLL_CLASS : EXAMINERS_TAB_PANEL_CLASS}
        >
          <p className="sr-only">{tabAnnouncement}</p>
          {examId == null ? (
            <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Select an examination</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Choose an examination using the{" "}
                <label
                  htmlFor={isSubjectOfficerShell ? "so-exam-select" : "examiners-exam"}
                  className="font-medium text-foreground"
                >
                  Examination
                </label>{" "}
                control above to view roster, invitations, and cohorts.
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
                  pageScroll={isSubjectOfficerShell}
                  loadExaminerGroups={resolvedMarkingGroupsMode === "admin-allocation"}
                  onRosterCountChange={onRosterCountChange}
                />
              ) : null}
              {activeTab === "invitations" ? (
                <ExaminersInvitationsPanel
                  examId={examId}
                  subjects={scopedSubjects}
                  lockedSubjectIds={lockedSubjectIds}
                  embedded
                  pageScroll={isSubjectOfficerShell}
                  onInvitationCountsChange={onInvitationCountsChange}
                />
              ) : null}
              {activeTab === "groups" && resolvedMarkingGroupsMode === "admin-allocation" ? (
                <ExaminersGroupsPanel
                  examId={examId}
                  embedded
                  pageScroll={isSubjectOfficerShell}
                />
              ) : null}
              {activeTab === "groups" && resolvedMarkingGroupsMode === "subject-officer" ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={scopedSubjects}
                  embedded
                  pageScroll={isSubjectOfficerShell}
                />
              ) : null}
              {activeTab === "cohorts" && showSubjectCohortsTab ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={subjects}
                  canManageDefaultCohort
                  embedded
                  pageScroll={isSubjectOfficerShell}
                />
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
