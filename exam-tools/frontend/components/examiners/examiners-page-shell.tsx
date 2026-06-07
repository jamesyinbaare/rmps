"use client";

import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { EXAMINERS_EXAM_META_CLASS, EXAMINERS_TABS } from "@/components/examiners/constants";
import { ExaminersGroupsPanel } from "@/components/examiners/examiners-groups-panel";
import { ExaminersInvitationsPanel } from "@/components/examiners/examiners-invitations-panel";
import { ExaminersRosterPanel } from "@/components/examiners/examiners-roster-panel";
import type { ExaminersSummaryCounts } from "@/components/examiners/types";
import { useExaminersUrl } from "@/components/examiners/use-examiners-url";
import { INVITATIONS_FOOTER_NOTE_CLASS } from "@/components/examiner-invitations/constants";
import type { InvitationStatusCounts } from "@/components/examiner-invitations/types";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { OfficialAccountsRoleTabs } from "@/components/official-accounts-role-tabs";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { formatExamLabel } from "@/lib/official-rates-draft";
import type { Examination, Subject } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  exams: Examination[];
  subjects: Subject[];
  isSuperAdmin: boolean;
};

const EMPTY_SUMMARY: ExaminersSummaryCounts = {
  roster: 0,
  invitationsPending: 0,
  invitationsAccepted: 0,
};

export function ExaminersPageShell({ exams, subjects, isSuperAdmin }: Props) {
  const { examId, activeTab, setExamId, setActiveTab } = useExaminersUrl({ exams });
  const [summaryByExam, setSummaryByExam] = useState<Record<number, ExaminersSummaryCounts>>({});

  const selectedExam = useMemo(
    () => (examId != null ? exams.find((e) => e.id === examId) ?? null : null),
    [examId, exams],
  );

  const summary = examId != null ? (summaryByExam[examId] ?? EMPTY_SUMMARY) : EMPTY_SUMMARY;

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
    const tabLabel = EXAMINERS_TABS.find((t) => t.key === activeTab)?.label ?? activeTab;
    if (examId == null) return tabLabel;
    return `${tabLabel} — ${summary.roster} on roster, ${summary.invitationsPending} pending invites`;
  }, [activeTab, examId, summary.invitationsPending, summary.roster]);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 p-4 md:p-6">
      <OfficialAccountsPageIntro
        description="Maintain the examiner roster (home region required), send SMS invitations, and configure marking groups per examination."
        meta={
          <>
            {selectedExam ? (
              <span className={EXAMINERS_EXAM_META_CLASS}>
                <span className="shrink-0 font-semibold uppercase tracking-wide text-primary/80">Exam</span>
                <span className="min-w-0 truncate font-medium text-foreground">{formatExamLabel(selectedExam)}</span>
              </span>
            ) : null}
            <Link
              href={scriptsAllocationHref}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Scripts allocation →
            </Link>
          </>
        }
        footerNote={
          activeTab === "invitations" ? (
            <p className={INVITATIONS_FOOTER_NOTE_CLASS}>
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>Invitation links are single-use. Resend SMS only for pending or expired invitations.</span>
            </p>
          ) : undefined
        }
      />

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">Examination</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1 sm:min-w-[14rem] sm:flex-1 lg:max-w-md">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="examiners-exam">
              Examination
            </label>
            <SearchableCombobox
              id="examiners-exam"
              options={exams.map((ex) => ({ value: String(ex.id), label: formatExamLabel(ex) }))}
              value={examId != null ? String(examId) : ""}
              onChange={(v) => setExamId(v ? Number(v) : null)}
              placeholder="Select examination…"
              searchPlaceholder="Search exams…"
              widthClass="w-full"
              showAllOption={false}
              truncateTrigger
            />
          </div>
        </div>
        {examId != null ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
              {summary.roster.toLocaleString()} on roster
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
              {summary.invitationsPending.toLocaleString()} pending invites
            </span>
            {summary.invitationsAccepted > 0 ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                {summary.invitationsAccepted.toLocaleString()} accepted
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex min-h-0 flex-1 flex-col">
        <OfficialAccountsRoleTabs
          tabs={EXAMINERS_TABS}
          activeKey={activeTab}
          onChange={setActiveTab}
          ariaLabel="Examiners sections"
          variant="compact"
          integratedPanel
        />

        <div
          role="tabpanel"
          id={`admin-eo-panel-${activeTab}`}
          aria-labelledby={`admin-eo-tab-${activeTab}`}
          aria-live="polite"
          className={cn("flex min-h-0 flex-1 flex-col gap-4", activeTab !== "groups" && "pt-4")}
        >
          <p className="sr-only">{tabAnnouncement}</p>
          {activeTab === "roster" ? (
            <ExaminersRosterPanel
              examId={examId}
              subjects={subjects}
              isSuperAdmin={isSuperAdmin}
              onRosterCountChange={onRosterCountChange}
            />
          ) : null}
          {activeTab === "invitations" ? (
            <ExaminersInvitationsPanel
              examId={examId}
              subjects={subjects}
              onInvitationCountsChange={onInvitationCountsChange}
            />
          ) : null}
          {activeTab === "groups" ? <ExaminersGroupsPanel examId={examId} /> : null}
        </div>
      </div>
    </div>
  );
}
