"use client";

import { BookOpen } from "lucide-react";

import { ExaminerAppointmentLetterSection } from "@/components/examiner-invitation/examiner-appointment-letter-section";
import { ExaminerBankAccountForm } from "@/components/examiner-invitation/examiner-bank-account-form";
import { ExaminerScriptsAllocationSection } from "@/components/examiner-invitation/examiner-scripts-allocation-section";
import type { ExaminerInvitationPublic } from "@/lib/api";

type Props = {
  token: string;
  invitation: ExaminerInvitationPublic;
};

export function ExaminerInvitationProfilePanel({ token, invitation }: Props) {
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

      <ExaminerBankAccountForm token={token} invitation={invitation} className="mt-0" />
      <ExaminerScriptsAllocationSection token={token} />
      <ExaminerAppointmentLetterSection token={token} inviteeName={invitation.invitee_name} />
    </div>
  );
}
