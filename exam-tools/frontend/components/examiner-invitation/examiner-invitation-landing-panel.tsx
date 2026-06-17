"use client";

import { useEffect, useId, useState } from "react";
import { BookOpen, CalendarClock, CheckCircle2, MapPin, UserCircle, XCircle } from "lucide-react";

import { ExaminerAcceptanceStatement } from "@/components/examiner-invitation/examiner-acceptance-statement";
import {
  ExaminerInvitationDetailTile,
  formatInvitationDeadline,
  invitationStatusMeta,
} from "@/components/examiner-invitation/examiner-invitation-page-shell";
import { formatCoordinationRange } from "@/components/examiner-invitations/utils";
import { ExaminerMarkingScheduleSection } from "@/components/examiner-invitation/examiner-marking-schedule-section";
import { Button } from "@/components/ui/button";
import {
  acceptPublicExaminerInvitation,
  declinePublicExaminerInvitation,
  type ExaminerInvitationPublic,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { displaySubjectCode } from "@/lib/script-control-completion";
import { cn } from "@/lib/utils";

type ConfirmAction = "accept" | "decline";

type Props = {
  token: string;
  invitation: ExaminerInvitationPublic;
  actionMessage: string | null;
  onActionMessage: (message: string | null) => void;
  onAccepted: () => void;
};

function isConfirmationValid(action: ConfirmAction, value: string): boolean {
  return value.trim().toLowerCase() === action;
}

export function ExaminerInvitationLandingPanel({
  token,
  invitation,
  actionMessage,
  onActionMessage,
  onAccepted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const confirmInputId = useId();
  const confirmTitleId = useId();

  const canRespond = invitation.can_respond === true;
  const isRosterPortal = invitation.portal_mode === "roster";
  const isWaitlisted = invitation.status === "quota_waitlisted";
  const status = isRosterPortal
    ? {
        label: "Roster portal",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      }
    : invitationStatusMeta(invitation.status);
  const StatusIcon =
    invitation.status === "accepted" || isRosterPortal
      ? CheckCircle2
      : invitation.status === "declined"
        ? XCircle
        : CalendarClock;
  const markingCohorts = invitation.marking_cohorts ?? [];
  const subjectCodeLabel = displaySubjectCode(invitation);
  const waitlistNote = isWaitlisted ? invitation.quota_waitlist_message?.trim() : null;
  const showWaitlistNote = Boolean(waitlistNote);
  const showActionMessage =
    Boolean(actionMessage) &&
    !(showWaitlistNote && actionMessage === waitlistNote);

  const introText =
    invitation.status === "declined"
      ? "You declined this invitation."
      : isRosterPortal
        ? "Welcome to your examiner portal. Review your assignment and marking schedule below, then open Profile for bank details, script allocations, and your appointment letter."
        : invitation.status === "accepted"
          ? "Your assignment details are below. Open the Profile tab for bank details, script allocations, and your appointment letter."
          : isWaitlisted
            ? showWaitlistNote
              ? null
              : "Thank you for responding. The regional quota is full for now — see the note below for what happens next."
            : canRespond
              ? "You've been invited to serve as an examiner. Review the details below, then confirm or decline before the deadline."
              : "This invitation is no longer open for a response.";

  function openConfirm(action: ConfirmAction) {
    setConfirmAction(action);
    setConfirmText("");
    onActionMessage(null);
  }

  function closeConfirm() {
    if (busy) return;
    setConfirmAction(null);
    setConfirmText("");
  }

  useEffect(() => {
    if (confirmAction == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        closeConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmAction, busy]);

  async function handleAccept() {
    setBusy(true);
    onActionMessage(null);
    try {
      const res = await acceptPublicExaminerInvitation(token);
      if (res.status !== "quota_waitlisted") {
        onActionMessage(res.message);
      }
      setConfirmAction(null);
      setConfirmText("");
      onAccepted();
    } catch (e) {
      onActionMessage(e instanceof Error ? e.message : "Could not confirm availability");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    onActionMessage(null);
    try {
      const res = await declinePublicExaminerInvitation(token);
      onActionMessage(res.message);
      setConfirmAction(null);
      setConfirmText("");
    } catch (e) {
      onActionMessage(e instanceof Error ? e.message : "Could not record decline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <article className="flex flex-1 flex-col">
        <div className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">
                Hello, {invitation.invitee_name.split(" ")[0]}
              </p>
              <h1 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                {invitation.examination_name}
              </h1>
              {invitation.examination_description ? (
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {invitation.examination_description}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                status.className,
              )}
            >
              <StatusIcon className="size-3.5" aria-hidden />
              {status.label}
            </span>
          </div>

          {introText ? (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{introText}</p>
          ) : null}

          {showWaitlistNote ? (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-foreground">
              {waitlistNote}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-3.5">
            <ExaminerInvitationDetailTile
              icon={UserCircle}
              label="Name"
              value={invitation.invitee_name}
              className="col-span-2"
            />
            <ExaminerInvitationDetailTile
              icon={BookOpen}
              label="Subject"
              value={`${subjectCodeLabel} — ${invitation.subject_name}`}
              className="col-span-2"
            />
            <ExaminerInvitationDetailTile icon={UserCircle} label="Role" value={invitation.examiner_type_label} />
            <ExaminerInvitationDetailTile icon={MapPin} label="Region" value={invitation.region} />
            {invitation.response_deadline ? (
              <ExaminerInvitationDetailTile
                icon={CalendarClock}
                label="Respond by"
                value={formatInvitationDeadline(invitation.response_deadline)}
                className="col-span-2"
              />
            ) : null}
            {invitation.coordination_start_date || invitation.coordination_end_date ? (
              <ExaminerInvitationDetailTile
                icon={CalendarClock}
                label="Coordination"
                value={formatCoordinationRange(
                  invitation.coordination_start_date,
                  invitation.coordination_start_time,
                  invitation.coordination_end_date,
                  invitation.coordination_end_time,
                )}
                className="col-span-2"
              />
            ) : null}
            {invitation.coordination_venue ? (
              <ExaminerInvitationDetailTile
                icon={CalendarClock}
                label="Venue"
                value={invitation.coordination_venue}
                className="col-span-2"
              />
            ) : null}
          </div>

          <ExaminerMarkingScheduleSection cohorts={markingCohorts} />

          {canRespond ? (
            <ExaminerAcceptanceStatement
              invitation={invitation}
              heading="Acceptance statement"
              className="mt-5 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4"
            />
          ) : null}

          {showActionMessage ? (
            <div
              className={cn(
                "mt-5 rounded-2xl border px-4 py-3 text-sm leading-relaxed text-foreground",
                isWaitlisted ? "border-amber-500/30 bg-amber-500/10" : "border-primary/20 bg-primary/5",
              )}
              role="status"
            >
              {actionMessage}
            </div>
          ) : null}

          {!canRespond && invitation.status !== "declined" && !isRosterPortal ? (
            <div className="mt-6 rounded-2xl border border-border/70 bg-muted/30 px-4 py-4 text-center text-sm leading-relaxed text-muted-foreground">
              {invitation.status === "accepted"
                ? "Thank you for confirming your availability."
                : "This invitation is no longer active. Please contact the exam office if you have questions."}
            </div>
          ) : null}
        </div>

        {canRespond ? (
          <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-border/60 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="flex flex-col gap-2.5 sm:mt-6">
              <Button
                type="button"
                disabled={busy}
                size="lg"
                className="min-h-12 w-full text-base shadow-sm"
                onClick={() => openConfirm("accept")}
              >
                {isWaitlisted ? "Try confirming again" : "Confirm availability"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                size="lg"
                className="min-h-12 w-full text-base"
                onClick={() => openConfirm("decline")}
              >
                Decline invitation
              </Button>
            </div>
          </div>
        ) : null}
      </article>

      {confirmAction != null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
            onClick={closeConfirm}
            disabled={busy}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="relative z-10 w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            <h2 id={confirmTitleId} className="text-lg font-semibold text-foreground">
              {confirmAction === "accept" ? "Confirm availability" : "Decline invitation"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {confirmAction === "accept"
                ? "Please read the acceptance statement below, then type accept to confirm you are taking on this role."
                : "We're sorry you can't take this role. Once you decline, you won't be able to change your answer on this page—please contact the exam office if your plans change."}
            </p>
            {confirmAction === "accept" ? (
              <ExaminerAcceptanceStatement
                invitation={invitation}
                className="mt-4 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3.5"
              />
            ) : null}
            <div className="mt-4">
              <label className={formLabelClass} htmlFor={confirmInputId}>
                {confirmAction === "accept" ? "To confirm, type " : "To decline, type "}
                <span className="font-mono font-semibold text-foreground">{confirmAction}</span> below
              </label>
              <input
                id={confirmInputId}
                className={formInputClass}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmAction}
                disabled={busy}
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                type="button"
                variant={confirmAction === "decline" ? "destructive" : "default"}
                size="lg"
                className="min-h-12 w-full"
                disabled={busy || !isConfirmationValid(confirmAction, confirmText)}
                onClick={() => void (confirmAction === "accept" ? handleAccept() : handleDecline())}
              >
                {busy
                  ? "Submitting…"
                  : confirmAction === "accept"
                    ? "Confirm availability"
                    : "Decline invitation"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-12 w-full"
                disabled={busy}
                onClick={closeConfirm}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
