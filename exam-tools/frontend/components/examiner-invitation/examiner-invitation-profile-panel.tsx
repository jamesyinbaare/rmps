"use client";

import { useCallback, useEffect, useState } from "react";

import { ExaminerAppointmentLetterSection } from "@/components/examiner-invitation/examiner-appointment-letter-section";
import { ExaminerBankAccountForm } from "@/components/examiner-invitation/examiner-bank-account-form";
import { ExaminerLunchIdCard } from "@/components/examiner-invitation/examiner-lunch-id-card";
import { ExaminerProfileDetailsForm } from "@/components/examiner-invitation/examiner-profile-details-form";
import {
  ExaminerProfileReadinessStrip,
  type ProfileReadinessItem,
} from "@/components/examiner-invitation/examiner-profile-readiness-strip";
import { ExaminerScriptsAllocationSection } from "@/components/examiner-invitation/examiner-scripts-allocation-section";
import {
  getPublicExaminerBackgroundSurvey,
  getPublicExaminerBankAccount,
  getPublicExaminerLocation,
  getPublicExaminerScriptsAllocation,
  type ExaminerInvitationPublic,
} from "@/lib/api";

type Props = {
  token: string;
  invitation: ExaminerInvitationPublic;
};

export function ExaminerInvitationProfilePanel({ token, invitation }: Props) {
  const [hasProfileDetails, setHasProfileDetails] = useState<boolean | null>(null);
  const [hasBankAccount, setHasBankAccount] = useState<boolean | null>(null);
  const [hasScriptAllocations, setHasScriptAllocations] = useState<boolean | null>(null);

  const lettersAvailable = invitation.appointment_letters_available === true;
  const letterPendingMessage = invitation.appointment_letters_pending_message;
  const bankDetailsAvailable = invitation.bank_details_available === true;
  const bankPendingMessage = invitation.bank_details_pending_message;
  const scriptsAllocationAvailable = invitation.scripts_allocation_available === true;
  const scriptsPendingMessage = invitation.scripts_allocation_pending_message;

  const loadReadiness = useCallback(async () => {
    const [locationResult, backgroundResult, bankResult, scriptsResult] = await Promise.allSettled([
      getPublicExaminerLocation(token),
      getPublicExaminerBackgroundSurvey(token),
      getPublicExaminerBankAccount(token),
      getPublicExaminerScriptsAllocation(token),
    ]);

    const hasLocation = locationResult.status === "fulfilled" && locationResult.value !== null;
    const hasBackground =
      backgroundResult.status === "fulfilled" && backgroundResult.value !== null;
    setHasProfileDetails(hasLocation && hasBackground);
    setHasBankAccount(bankResult.status === "fulfilled" && bankResult.value !== null);
    setHasScriptAllocations(
      scriptsResult.status === "fulfilled" && scriptsResult.value.blocks.length > 0,
    );
  }, [token, scriptsAllocationAvailable]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  const readinessItems: ProfileReadinessItem[] = [
    {
      id: "lunch",
      label: "Lunch pass",
      detail: invitation.reference_code
        ? `Your lunch ID ${invitation.reference_code} is ready to scan`
        : "Available once you have confirmed",
      complete: Boolean(invitation.reference_code),
      hidden: !invitation.reference_code,
    },
    {
      id: "about-you",
      label: "About you",
      detail:
        hasProfileDetails === null
          ? "Checking what we have on file…"
          : hasProfileDetails
            ? "Your location and work background are complete"
            : "Add where you are based and what you do",
      complete: hasProfileDetails === true,
    },
    {
      id: "bank",
      label: "Bank details",
      detail:
        hasBankAccount === null
          ? "Checking your bank details…"
          : hasBankAccount
            ? "Your allowance payment account is on file"
            : bankPendingMessage && !bankDetailsAvailable
              ? bankPendingMessage
              : bankDetailsAvailable
                ? "Add the account where you would like to be paid"
                : "Bank details will appear here when the exam office opens them",
      complete: hasBankAccount === true,
      pending: hasBankAccount === false && Boolean(bankPendingMessage) && !bankDetailsAvailable,
    },
    {
      id: "scripts",
      label: "Script allocations",
      detail:
        hasScriptAllocations === null
          ? "Loading your assignments…"
          : hasScriptAllocations
            ? "Your schools and booklet counts are ready to view"
            : scriptsPendingMessage ??
              "Your assignments will appear here once the exam office publishes them",
      complete: hasScriptAllocations === true,
      pending: !scriptsAllocationAvailable && Boolean(scriptsPendingMessage),
    },
    {
      id: "letter",
      label: "Appointment letter",
      detail: lettersAvailable
        ? "Ready for you to download"
        : letterPendingMessage ?? "Available when the exam office releases it",
      complete: lettersAvailable,
      pending: !lettersAvailable && Boolean(letterPendingMessage),
    },
  ];

  return (
    <article className="flex flex-1 flex-col space-y-5 pb-2">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Profile</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Complete your personal details, bank information, script allocations, and appointment letter.
          Your assignment overview is on the Overview tab.
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

      <div id="profile-about-you" className="scroll-mt-4">
        <ExaminerProfileDetailsForm token={token} className="mt-0" onSaved={() => void loadReadiness()} />
      </div>

      <div id="profile-bank" className="scroll-mt-4">
        <ExaminerBankAccountForm
          token={token}
          invitation={invitation}
          className="mt-0"
          onSaved={() => void loadReadiness()}
        />
      </div>

      <div id="profile-scripts" className="scroll-mt-4">
        <ExaminerScriptsAllocationSection
          token={token}
          pendingMessage={!scriptsAllocationAvailable ? scriptsPendingMessage : null}
        />
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
