"use client";

import { useCallback, useEffect, useState } from "react";

import { ExaminerAppointmentLetterSection } from "@/components/examiner-invitation/examiner-appointment-letter-section";
import { ExaminerBankAccountForm } from "@/components/examiner-invitation/examiner-bank-account-form";
import { ExaminerLunchIdCard } from "@/components/examiner-invitation/examiner-lunch-id-card";
import {
  ExaminerProfileReadinessStrip,
  type ProfileReadinessItem,
} from "@/components/examiner-invitation/examiner-profile-readiness-strip";
import { ExaminerScriptsAllocationSection } from "@/components/examiner-invitation/examiner-scripts-allocation-section";
import {
  getPublicExaminerBankAccount,
  getPublicExaminerScriptsAllocation,
  type ExaminerInvitationPublic,
} from "@/lib/api";

type Props = {
  token: string;
  invitation: ExaminerInvitationPublic;
};

export function ExaminerInvitationProfilePanel({ token, invitation }: Props) {
  const [hasBankAccount, setHasBankAccount] = useState<boolean | null>(null);
  const [hasScriptAllocations, setHasScriptAllocations] = useState<boolean | null>(null);

  const lettersAvailable = invitation.appointment_letters_available === true;
  const letterPendingMessage = invitation.appointment_letters_pending_message;
  const bankDetailsAvailable = invitation.bank_details_available === true;
  const bankPendingMessage = invitation.bank_details_pending_message;

  const loadReadiness = useCallback(async () => {
    const [bankResult, scriptsResult] = await Promise.allSettled([
      getPublicExaminerBankAccount(token),
      getPublicExaminerScriptsAllocation(token),
    ]);

    setHasBankAccount(bankResult.status === "fulfilled");
    setHasScriptAllocations(
      scriptsResult.status === "fulfilled" && scriptsResult.value.blocks.length > 0,
    );
  }, [token]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  const readinessItems: ProfileReadinessItem[] = [
    {
      id: "lunch",
      label: "Lunch pass",
      detail: invitation.reference_code
        ? `ID ${invitation.reference_code} ready to scan`
        : "Available after confirmation",
      complete: Boolean(invitation.reference_code),
      hidden: !invitation.reference_code,
    },
    {
      id: "bank",
      label: "Bank details",
      detail:
        hasBankAccount === null
          ? "Checking your saved details…"
          : hasBankAccount
            ? "Account on file for allowance payment"
            : bankPendingMessage && !bankDetailsAvailable
              ? bankPendingMessage
              : bankDetailsAvailable
                ? "Add your account for allowance payment"
                : "Bank details will open when released",
      complete: hasBankAccount === true,
      pending: hasBankAccount === false && Boolean(bankPendingMessage) && !bankDetailsAvailable,
    },
    {
      id: "scripts",
      label: "Script allocations",
      detail:
        hasScriptAllocations === null
          ? "Loading assignments…"
          : hasScriptAllocations
            ? "Schools and booklet counts assigned"
            : "Published when the exam office assigns scripts",
      complete: hasScriptAllocations === true,
    },
    {
      id: "letter",
      label: "Appointment letter",
      detail: lettersAvailable
        ? "Ready to download"
        : letterPendingMessage ?? "Available when released by the exam office",
      complete: lettersAvailable,
      pending: !lettersAvailable && Boolean(letterPendingMessage),
    },
  ];

  return (
    <article className="flex flex-1 flex-col space-y-5 pb-2">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Profile</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Bank details, lunch pass, script allocations, and your appointment letter. Assignment details
          are on the Overview tab.
        </p>
      </header>

      <ExaminerProfileReadinessStrip items={readinessItems} />

      {invitation.reference_code ? (
        <ExaminerLunchIdCard
          examinationId={invitation.examination_id}
          referenceCode={invitation.reference_code}
          examinerName={invitation.invitee_name}
        />
      ) : null}

      <div id="profile-bank" className="scroll-mt-4">
        <ExaminerBankAccountForm
          token={token}
          invitation={invitation}
          className="mt-0"
          onSaved={() => void loadReadiness()}
        />
      </div>

      <div id="profile-scripts" className="scroll-mt-4">
        <ExaminerScriptsAllocationSection token={token} />
      </div>

      <div id="profile-letter" className="scroll-mt-4">
        <ExaminerAppointmentLetterSection
          token={token}
          inviteeName={invitation.invitee_name}
          invitation={invitation}
          pendingMessage={!lettersAvailable ? letterPendingMessage : null}
        />
      </div>
    </article>
  );
}
