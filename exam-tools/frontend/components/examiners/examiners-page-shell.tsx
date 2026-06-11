"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import {
  EXAMINERS_PAGE_LAYOUT_CLASS,
  EXAMINERS_PANEL_FILL_CLASS,
  EXAMINERS_TAB_PANEL_CLASS,
  EXAMINERS_TABS,
} from "@/components/examiners/constants";
import { ExaminersContextBar } from "@/components/examiners/examiners-context-bar";
import { ExaminersGroupsPanel } from "@/components/examiners/examiners-groups-panel";
import { ExaminersInvitationsPanel } from "@/components/examiners/examiners-invitations-panel";
import { ExaminersRosterPanel } from "@/components/examiners/examiners-roster-panel";
import { SubjectMarkingGroupsPanel } from "@/components/subject-officer/subject-marking-groups-panel";
import type { ExaminersSummaryCounts } from "@/components/examiners/types";
import { useExaminersUrl } from "@/components/examiners/use-examiners-url";
import type { InvitationStatusCounts } from "@/components/examiner-invitations/types";
import { OfficialAccountsRoleTabs } from "@/components/official-accounts-role-tabs";
import type { Examination, Subject } from "@/lib/api";
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
}: Props) {
  const resolvedMarkingGroupsMode: MarkingGroupsMode =
    markingGroupsMode ?? (hideGroups ? "hidden" : "admin-allocation");

  const scopedSubjects = useMemo(() => {
    if (!lockedSubjectIds?.length) return subjects;
    const allowed = new Set(lockedSubjectIds);
    return subjects.filter((s) => allowed.has(s.id));
  }, [lockedSubjectIds, subjects]);

  const baseTabs = useMemo(() => {
    let tabs =
      resolvedMarkingGroupsMode === "hidden"
        ? EXAMINERS_TABS.filter((t) => t.key !== "groups")
        : [...EXAMINERS_TABS];
    if (showSubjectCohortsTab) {
      tabs = [...tabs, { key: "cohorts" as const, label: "Cohorts" }];
    }
    return tabs;
  }, [resolvedMarkingGroupsMode, showSubjectCohortsTab]);
  const { examId, activeTab, setExamId, setActiveTab } = useExaminersUrl({
    exams,
    singleExamMode,
    requireExamSelection,
  });
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

  return (
    <div className={cn(EXAMINERS_PAGE_LAYOUT_CLASS, "p-3 md:p-4")}>
      <section className={EXAMINERS_PANEL_FILL_CLASS}>
        <div className="relative z-20 shrink-0 rounded-t-2xl border-b border-border/80 bg-linear-to-b from-muted/35 to-muted/10">
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
            hideExamSelector={requireExamSelection}
            trailingContent={contextTrailing}
          />
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
          className={EXAMINERS_TAB_PANEL_CLASS}
        >
          <p className="sr-only">{tabAnnouncement}</p>
          {examId == null ? (
            <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Select an examination</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Choose an examination using the{" "}
                <label htmlFor="examiners-exam" className="font-medium text-foreground">
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
                  onInvitationCountsChange={onInvitationCountsChange}
                />
              ) : null}
              {activeTab === "groups" && resolvedMarkingGroupsMode === "admin-allocation" ? (
                <ExaminersGroupsPanel examId={examId} embedded />
              ) : null}
              {activeTab === "groups" && resolvedMarkingGroupsMode === "subject-officer" ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={scopedSubjects}
                  embedded
                />
              ) : null}
              {activeTab === "cohorts" && showSubjectCohortsTab ? (
                <SubjectMarkingGroupsPanel
                  examId={examId}
                  subjects={subjects}
                  canManageDefaultCohort
                  embedded
                />
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
