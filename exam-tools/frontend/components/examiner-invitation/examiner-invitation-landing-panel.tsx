"use client";

import { useEffect, useId, useState } from "react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  UserCircle,
  XCircle,
} from "lucide-react";

import { ExaminerAcceptanceStatement } from "@/components/examiner-invitation/examiner-acceptance-statement";
import {
  ExaminerInvitationDetailTile,
  formatResponseDeadlineForExaminer,
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

const EXAMINER_TNT_PAYMENT_NOTE =
  "Your travel and transport (T&T) allowance will not be paid on the last day of coordination. It will be processed and paid after the coordination exercise.";

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
  const [declineReason, setDeclineReason] = useState("");
  const [considerFutureExaminations, setConsiderFutureExaminations] = useState<boolean | null>(null);
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
  const hasCoordinationDetails = Boolean(
    invitation.coordination_start_date ||
      invitation.coordination_end_date ||
      invitation.coordination_venue,
  );
  const showConfirmationDeadlineCallout =
    canRespond && Boolean(invitation.response_deadline);

  const introText =
    invitation.status === "declined"
      ? "You declined this invitation."
      : isRosterPortal
        ? "You're all set. Your assignment and marking schedule are below — when you need them, you'll find bank details, script allocations, and your appointment letter under Profile."
        : invitation.status === "accepted"
          ? "Thanks for confirming. Your assignment is below — bank details, script allocations, and your appointment letter are in Profile whenever you need them."
          : isWaitlisted
            ? showWaitlistNote
              ? null
              : "Thank you for responding. The regional quota is full for now — see the note below for what happens next."
            : canRespond
              ? "You've been invited to serve as an examiner. Review your assignment below, then confirm or decline before the confirmation deadline."
              : "This invitation is no longer open for a response.";

  function openConfirm(action: ConfirmAction) {
    setConfirmAction(action);
    setConfirmText("");
    setDeclineReason("");
    setConsiderFutureExaminations(null);
    onActionMessage(null);
  }

  function closeConfirm() {
    if (busy) return;
    setConfirmAction(null);
    setConfirmText("");
    setDeclineReason("");
    setConsiderFutureExaminations(null);
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
      const res = await declinePublicExaminerInvitation(token, {
        reason: declineReason.trim() || null,
        consider_future_examinations: considerFutureExaminations,
      });
      onActionMessage(res.message);
      setConfirmAction(null);
      setConfirmText("");
      setDeclineReason("");
      setConsiderFutureExaminations(null);
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

          {showConfirmationDeadlineCallout ? (
            <div
              className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-4"
              role="note"
              aria-label="Confirmation deadline"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Clock className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-foreground">Confirmation deadline</h2>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">
                    Please tap <strong>Confirm availability</strong> or <strong>Decline invitation</strong>{" "}
                    before{" "}
                    <strong>
                      {formatResponseDeadlineForExaminer(invitation.response_deadline!)}
                    </strong>
                    .
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    This deadline is only for accepting or declining the invitation — not the
                    coordination exercise dates.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <h2 className="mt-5 text-sm font-semibold text-foreground">Your assignment</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-3.5">
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
          </div>

          {hasCoordinationDetails ? (
            <section className="mt-5" aria-label="Coordination exercise">
              <h2 className="text-sm font-semibold text-foreground">Coordination exercise</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                If you accept, you will attend coordination on these dates.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-3.5">
                {invitation.coordination_start_date || invitation.coordination_end_date ? (
                  <ExaminerInvitationDetailTile
                    icon={CalendarDays}
                    label="Dates"
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
                    icon={MapPin}
                    label="Venue"
                    value={invitation.coordination_venue}
                    className="col-span-2"
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          <ExaminerMarkingScheduleSection cohorts={markingCohorts} />

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
              <>
                <ExaminerAcceptanceStatement
                  invitation={invitation}
                  heading="Acceptance statement"
                  className="mt-4 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3.5"
                />
                <div
                  className="mt-4 flex items-start gap-3 rounded-xl border-2 border-amber-500/40 bg-amber-500/15 px-3.5 py-3.5"
                  role="note"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400">
                    <Info className="size-4" aria-hidden />
                  </span>
                  <p className="text-sm font-medium leading-relaxed text-foreground">
                    {EXAMINER_TNT_PAYMENT_NOTE}
                  </p>
                </div>
              </>
            ) : null}
            {confirmAction === "decline" ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label className={formLabelClass} htmlFor={`${confirmInputId}-reason`}>
                    Reason for declining (optional)
                  </label>
                  <textarea
                    id={`${confirmInputId}-reason`}
                    className={cn(formInputClass, "min-h-24 resize-y")}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    disabled={busy}
                    placeholder="Let us know why you cannot take this role, if you wish."
                  />
                </div>
                <fieldset>
                  <legend className={formLabelClass}>
                    Would you like to be considered for future examinations? (optional)
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name={`${confirmInputId}-future`}
                        checked={considerFutureExaminations === true}
                        disabled={busy}
                        onChange={() => setConsiderFutureExaminations(true)}
                      />
                      Yes
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name={`${confirmInputId}-future`}
                        checked={considerFutureExaminations === false}
                        disabled={busy}
                        onChange={() => setConsiderFutureExaminations(false)}
                      />
                      No
                    </label>
                  </div>
                </fieldset>
              </div>
            ) : null}
            <div className="mt-4">
              <label className={formLabelClass} htmlFor={confirmInputId}>
                {confirmAction === "accept" ? "To confirm, type " : "To decline, type "}
                <span
                  className={cn(
                    "mx-0.5 rounded-md px-1.5 py-0.5 font-mono text-sm font-semibold",
                    confirmAction === "accept"
                      ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                      : "text-foreground",
                  )}
                >
                  {confirmAction}
                </span>{" "}
                below
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
