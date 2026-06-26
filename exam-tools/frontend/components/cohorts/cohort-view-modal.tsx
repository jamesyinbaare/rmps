"use client";

import { useEffect, useMemo, useState } from "react";

import { CalendarDays, Copy, MessageSquare, Users } from "lucide-react";

import { BottomSheet } from "@/components/bottom-sheet";
import {
  copyTextToClipboard,
  formatPhoneList,
  formatRosterTsv,
  formatScheduleBrief,
  membersWithPhoneCount,
} from "@/components/cohorts/cohort-communication-utils";
import { CohortCollapsibleSection } from "@/components/cohorts/cohort-collapsible-section";
import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { CohortRosterMobileList } from "@/components/cohorts/cohort-roster-mobile-list";
import { CohortRosterTable } from "@/components/cohorts/cohort-roster-table";
import { CohortScheduleDisplay } from "@/components/cohorts/cohort-schedule-display";
import { cohortScheduleSummaryParts } from "@/components/cohorts/cohort-schedule-fields";
import { cohortScheduleFromRow } from "@/components/cohorts/cohort-schedule-utils";
import {
  CohortSectionTabs,
  type CohortSectionTabOption,
} from "@/components/cohorts/cohort-section-tabs";
import type { CohortRosterMember } from "@/components/cohorts/types";
import {
  CustomSmsModal,
  type CustomSmsBulkResult,
} from "@/components/examiner-invitations/invitations-modals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMobileViewport } from "@/hooks/use-mobile-viewport";
import { bulkSendExaminerRosterCustomSms, type SubjectMarkingGroupRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  cohort: SubjectMarkingGroupRow | null;
  rosterMembers: CohortRosterMember[];
  examId: number | null;
};

type CopyAction = "schedule" | "phones" | "roster" | null;
type ViewSectionTab = "schedule" | "members";

const VIEW_SECTION_TABS = (memberCount: number): [
  CohortSectionTabOption<ViewSectionTab>,
  CohortSectionTabOption<ViewSectionTab>,
] => [
  { value: "schedule", label: "Schedule" },
  { value: "members", label: `Members (${memberCount})` },
];

function SectionHeading({
  icon: Icon,
  title,
  tone = "primary",
}: {
  icon: typeof CalendarDays;
  title: string;
  tone?: "primary" | "emerald";
}) {
  const iconClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-primary";
  const barClass =
    tone === "emerald"
      ? "bg-emerald-500/70"
      : "bg-primary/70";

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 shadow-sm ring-1 ring-border/60",
          iconClass,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex items-center gap-2">
        <span className={cn("h-4 w-0.5 rounded-full", barClass)} aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
    </div>
  );
}

function CopyActionButton({
  label,
  copied,
  disabled,
  onClick,
}: {
  label: string;
  copied: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-10 flex-1 gap-1.5 text-xs"
      disabled={disabled}
      onClick={onClick}
    >
      <Copy className="size-3.5 shrink-0" aria-hidden />
      {copied ? "Copied!" : label}
    </Button>
  );
}

export function CohortViewModal({ open, onClose, cohort, rosterMembers, examId }: Props) {
  const isMobile = useMobileViewport();
  const [busy, setBusy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyAction>(null);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsSingleTarget, setSmsSingleTarget] = useState<CohortRosterMember | null>(null);
  const [customSmsMessage, setCustomSmsMessage] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsResult, setSmsResult] = useState<CustomSmsBulkResult | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<ViewSectionTab>("members");
  const [scheduleOpen, setScheduleOpen] = useState(true);

  useEffect(() => {
    if (!open) {
      setCopyFeedback(null);
      setSmsModalOpen(false);
      setSmsSingleTarget(null);
      setCustomSmsMessage("");
      setSmsError(null);
      setSmsResult(null);
      setActionMessage(null);
      setSectionTab("members");
      setScheduleOpen(true);
      return;
    }
    setScheduleOpen(true);
  }, [open]);

  useEffect(() => {
    if (copyFeedback == null) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  const members = useMemo(() => {
    if (!cohort) return [];
    const idSet = new Set(cohort.examiner_ids);
    return rosterMembers.filter((m) => idSet.has(m.id));
  }, [cohort, rosterMembers]);

  const schedule = useMemo(
    () => (cohort ? cohortScheduleFromRow(cohort) : null),
    [cohort],
  );

  const phoneCount = membersWithPhoneCount(members);
  const smsTargets = smsSingleTarget ? [smsSingleTarget] : members;

  const scheduleSummary = schedule
    ? cohortScheduleSummaryParts(schedule).join(" · ")
    : undefined;

  async function handleCopy(action: CopyAction, text: string) {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopyFeedback(action);
    } else {
      setActionMessage("Copy failed — clipboard access was denied.");
    }
  }

  function closeSmsModal() {
    if (busy) return;
    setSmsModalOpen(false);
    setSmsSingleTarget(null);
    setCustomSmsMessage("");
    setSmsError(null);
    setSmsResult(null);
  }

  function openBulkSms() {
    setSmsSingleTarget(null);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
    setSmsModalOpen(true);
  }

  function openMemberSms(member: CohortRosterMember) {
    setSmsSingleTarget(member);
    setSmsError(null);
    setSmsResult(null);
    setCustomSmsMessage("");
    setSmsModalOpen(true);
  }

  async function handleBulkSms() {
    if (examId == null || !customSmsMessage.trim()) {
      setSmsError("Enter a message.");
      return;
    }
    if (smsTargets.length === 0) {
      setSmsError("This cohort has no members to message.");
      return;
    }
    setBusy(true);
    setSmsError(null);
    setSmsResult(null);
    try {
      const res = await bulkSendExaminerRosterCustomSms(examId, {
        examiner_ids: smsTargets.map((m) => m.id),
        message: customSmsMessage.trim(),
      });
      setSmsResult(res);
      if (res.sent_count > 0) {
        const label = smsSingleTarget ? smsSingleTarget.name : `${res.sent_count} examiner${res.sent_count === 1 ? "" : "s"}`;
        setActionMessage(`Custom SMS sent to ${label}.`);
      } else if (res.failed_count > 0) {
        setActionMessage(`SMS failed for ${res.failed_count} examiner${res.failed_count === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      setSmsError(e instanceof Error ? e.message : "SMS send failed");
    } finally {
      setBusy(false);
    }
  }

  if (!cohort || !schedule) return null;

  const memberActionButtons = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 border-primary/20 bg-background/80 hover:bg-primary/5"
        disabled={busy}
        onClick={() => void handleCopy("schedule", formatScheduleBrief(cohort.name, schedule))}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        {copyFeedback === "schedule" ? "Copied!" : "Copy schedule"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 border-emerald-500/25 bg-background/80 hover:bg-emerald-500/5"
        disabled={busy || phoneCount === 0}
        onClick={() => void handleCopy("phones", formatPhoneList(members))}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        {copyFeedback === "phones" ? "Copied!" : "Copy phones"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 border-violet-500/20 bg-background/80 hover:bg-violet-500/5"
        disabled={busy || members.length === 0}
        onClick={() => void handleCopy("roster", formatRosterTsv(members))}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        {copyFeedback === "roster" ? "Copied!" : "Copy roster"}
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1.5 shadow-sm shadow-primary/15"
        disabled={busy || members.length === 0 || examId == null}
        onClick={openBulkSms}
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        Send SMS
      </Button>
    </div>
  );

  const membersSection = (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.05] via-card to-primary/[0.03] p-4 shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <SectionHeading icon={Users} title="Members" tone="emerald" />
        {memberActionButtons}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <CohortRosterTable members={members} tinted className="min-h-0 flex-1" />
      </div>
    </section>
  );

  const mobileActionBar = (
    <div className="sticky bottom-0 -mx-4 mt-4 space-y-2 border-t border-border/80 bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
      <Button
        type="button"
        className="h-11 w-full gap-2"
        disabled={busy || members.length === 0 || examId == null}
        onClick={openBulkSms}
      >
        <MessageSquare className="size-4" aria-hidden />
        Message all ({members.length})
      </Button>
      <div className="flex gap-2">
        <CopyActionButton
          label="Schedule"
          copied={copyFeedback === "schedule"}
          disabled={busy}
          onClick={() => void handleCopy("schedule", formatScheduleBrief(cohort.name, schedule))}
        />
        <CopyActionButton
          label="Phones"
          copied={copyFeedback === "phones"}
          disabled={busy || phoneCount === 0}
          onClick={() => void handleCopy("phones", formatPhoneList(members))}
        />
        <CopyActionButton
          label="Roster"
          copied={copyFeedback === "roster"}
          disabled={busy || members.length === 0}
          onClick={() => void handleCopy("roster", formatRosterTsv(members))}
        />
      </div>
    </div>
  );

  const mobileBody = (
    <div className="flex flex-col pb-2">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug text-foreground">{cohort.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Schedules are managed by administrators.
            </p>
          </div>
          {cohort.is_default ? (
            <Badge
              variant="secondary"
              className="shrink-0 border-primary/20 bg-primary/10 text-[10px] font-normal uppercase tracking-wide text-primary"
            >
              Default
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-normal">
            {members.length} member{members.length === 1 ? "" : "s"}
          </Badge>
          {phoneCount > 0 ? (
            <Badge className="border-emerald-500/20 bg-emerald-500/10 font-normal text-emerald-800 dark:text-emerald-300">
              {phoneCount} with phone{phoneCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      </div>

      {actionMessage ? (
        <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {actionMessage}
        </p>
      ) : null}

      <div className="mt-4">
        <CohortSectionTabs
          activeTab={sectionTab}
          onChange={setSectionTab}
          tabs={VIEW_SECTION_TABS(members.length)}
          inset="sheet"
        />
      </div>

      <div className="mt-4 min-h-[12rem]">
        {sectionTab === "schedule" ? (
          <CohortScheduleDisplay schedule={schedule} colored className="grid-cols-1" />
        ) : (
          <CohortRosterMobileList
            members={members}
            disabled={busy}
            onInAppSms={examId != null ? openMemberSms : undefined}
          />
        )}
      </div>

      {mobileActionBar}
    </div>
  );

  const desktopBody = (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      {cohort.is_default ? (
        <Badge
          variant="secondary"
          className="w-fit shrink-0 border-primary/20 bg-primary/10 text-[10px] font-normal uppercase tracking-wide text-primary"
        >
          Default cohort
        </Badge>
      ) : null}
      {actionMessage ? (
        <p className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {actionMessage}
        </p>
      ) : null}

      <div className="shrink-0">
        <CohortCollapsibleSection
          title="Schedule"
          icon={CalendarDays}
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          collapsedSummary={scheduleSummary}
        >
          <CohortScheduleDisplay schedule={schedule} colored />
        </CohortCollapsibleSection>
      </div>

      {membersSection}
    </div>
  );

  return (
    <>
      {isMobile ? (
        <BottomSheet
          open={open}
          onOpenChange={(next) => {
            if (!next && !busy) onClose();
          }}
          title={cohort.name}
          disableAutoFocus
        >
          {mobileBody}
        </BottomSheet>
      ) : (
        <CohortModalShell
          open={open}
          onClose={onClose}
          title={cohort.name}
          description="Schedules are managed by administrators."
          closeDisabled={busy}
          className="max-w-5xl border-primary/20 shadow-2xl shadow-primary/5"
          headerClassName="border-primary/15 bg-gradient-to-r from-primary/[0.08] via-violet-500/[0.05] to-emerald-500/[0.04]"
          bodyClassName="bg-gradient-to-b from-muted/20 to-card"
          footerClassName="border-primary/10 bg-gradient-to-r from-primary/[0.04] to-emerald-500/[0.03]"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {members.length} member{members.length === 1 ? "" : "s"}
              </Badge>
              {phoneCount > 0 ? (
                <Badge className="border-emerald-500/20 bg-emerald-500/10 font-normal text-emerald-800 dark:text-emerald-300">
                  {phoneCount} with phone{phoneCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
          }
        >
          {desktopBody}
        </CohortModalShell>
      )}

      <CustomSmsModal
        open={smsModalOpen}
        busy={busy}
        error={smsError}
        result={smsResult}
        message={customSmsMessage}
        recipientCount={smsTargets.length}
        recipientLabel={smsSingleTarget ? smsSingleTarget.name : "cohort members"}
        recipientNoun="examiner"
        onClose={closeSmsModal}
        onSubmit={() => void handleBulkSms()}
        onMessageChange={setCustomSmsMessage}
      />
    </>
  );
}
