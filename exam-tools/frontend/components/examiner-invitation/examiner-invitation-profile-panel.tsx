"use client";

import { BookOpen, UtensilsCrossed } from "lucide-react";

import { ExaminerReferenceCodeQrCell } from "@/components/examiners/examiner-reference-code-qr-cell";
import { ExaminerAppointmentLetterSection } from "@/components/examiner-invitation/examiner-appointment-letter-section";
import { ExaminerBankAccountForm } from "@/components/examiner-invitation/examiner-bank-account-form";
import { ExaminerScriptsAllocationSection } from "@/components/examiner-invitation/examiner-scripts-allocation-section";
import { formatDateTime } from "@/components/examiner-invitations/utils";
import type { ExaminerInvitationPublic } from "@/lib/api";

type Props = {
  token: string;
  invitation: ExaminerInvitationPublic;
};

export function ExaminerInvitationProfilePanel({ token, invitation }: Props) {
  const lettersAvailable = invitation.appointment_letters_available === true;
  const letterPendingMessage = invitation.appointment_letters_pending_message;

  return (
    <div className="flex flex-1 flex-col space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card/90 px-4 py-3.5 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">Your profile</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Manage your bank details, view script allocations, and download your appointment letter.
            </p>
          </div>
        </div>
      </div>

      {invitation.reference_code ? (
        <div className="rounded-2xl border border-border/70 bg-card/90 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UtensilsCrossed className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">Lunch ID</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Show this QR at lunch for verification.
                </p>
              </div>
            </div>
            <ExaminerReferenceCodeQrCell
              examinationId={invitation.examination_id}
              referenceCode={invitation.reference_code}
              examinerName={invitation.invitee_name}
              previewSize={128}
              modalSize={220}
            />
          </div>
        </div>
      ) : null}

      {!lettersAvailable && letterPendingMessage ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-foreground">
          {letterPendingMessage}
          {invitation.coordination_end_at ? (
            <> Coordination ends {formatDateTime(invitation.coordination_end_at)}.</>
          ) : null}
        </div>
      ) : null}

      <ExaminerBankAccountForm token={token} invitation={invitation} className="mt-0" />
      <ExaminerScriptsAllocationSection token={token} />
      <ExaminerAppointmentLetterSection
        token={token}
        inviteeName={invitation.invitee_name}
        invitation={invitation}
      />
    </div>
  );
}
