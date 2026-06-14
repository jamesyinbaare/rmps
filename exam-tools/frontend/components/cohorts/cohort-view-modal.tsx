"use client";

import { useEffect, useMemo, useState } from "react";

import { CalendarDays, Copy, MessageSquare, Users } from "lucide-react";

import {
  copyTextToClipboard,
  formatPhoneList,
  formatRosterTsv,
  formatScheduleBrief,
  membersWithPhoneCount,
} from "@/components/cohorts/cohort-communication-utils";
import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { CohortRosterTable } from "@/components/cohorts/cohort-roster-table";
import { CohortScheduleDisplay } from "@/components/cohorts/cohort-schedule-display";
import { cohortScheduleFromRow } from "@/components/cohorts/cohort-schedule-utils";
import type { CohortRosterMember } from "@/components/cohorts/types";
import {
  CustomSmsModal,
  type CustomSmsBulkResult,
} from "@/components/examiner-invitations/invitations-modals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 shadow-sm ring-1 ring-border/60", iconClass)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex items-center gap-2">
        <span className={cn("h-4 w-0.5 rounded-full", barClass)} aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
    </div>
  );
}

export function CohortViewModal({ open, onClose, cohort, rosterMembers, examId }: Props) {
  const [busy, setBusy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyAction>(null);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [customSmsMessage, setCustomSmsMessage] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsResult, setSmsResult] = useState<CustomSmsBulkResult | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCopyFeedback(null);
      setSmsModalOpen(false);
      setCustomSmsMessage("");
      setSmsError(null);
      setSmsResult(null);
      setActionMessage(null);
    }
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
    setCustomSmsMessage("");
    setSmsError(null);
    setSmsResult(null);
  }

  async function handleBulkSms() {
    if (examId == null || !customSmsMessage.trim()) {
      setSmsError("Enter a message.");
      return;
    }
    if (members.length === 0) {
      setSmsError("This cohort has no members to message.");
      return;
    }
    setBusy(true);
    setSmsError(null);
    setSmsResult(null);
    try {
      const res = await bulkSendExaminerRosterCustomSms(examId, {
        examiner_ids: members.map((m) => m.id),
        message: customSmsMessage.trim(),
      });
      setSmsResult(res);
      if (res.sent_count > 0) {
        setActionMessage(
          `Custom SMS sent to ${res.sent_count} examiner${res.sent_count === 1 ? "" : "s"}.`,
        );
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

  return (
    <>
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
        <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto">
          {cohort.is_default ? (
            <Badge variant="secondary" className="w-fit border-primary/20 bg-primary/10 text-[10px] font-normal uppercase tracking-wide text-primary">
              Default cohort
            </Badge>
          ) : null}
          {actionMessage ? (
            <p className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
              {actionMessage}
            </p>
          ) : null}

          <section>
            <SectionHeading icon={CalendarDays} title="Schedule" />
            <div className="mt-3">
              <CohortScheduleDisplay schedule={schedule} colored />
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.05] via-card to-primary/[0.03] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeading icon={Users} title="Members" tone="emerald" />
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
                  onClick={() => {
                    setSmsError(null);
                    setSmsResult(null);
                    setCustomSmsMessage("");
                    setSmsModalOpen(true);
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  Send SMS
                </Button>
              </div>
            </div>
            <div className="mt-3 min-h-0 flex-1">
              <CohortRosterTable members={members} tinted />
            </div>
          </section>
        </div>
      </CohortModalShell>

      <CustomSmsModal
        open={smsModalOpen}
        busy={busy}
        error={smsError}
        result={smsResult}
        message={customSmsMessage}
        recipientCount={members.length}
        recipientLabel="cohort members"
        recipientNoun="examiner"
        onClose={closeSmsModal}
        onSubmit={() => void handleBulkSms()}
        onMessageChange={setCustomSmsMessage}
      />
    </>
  );
}
