"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ExaminerInvitationLandingPanel } from "@/components/examiner-invitation/examiner-invitation-landing-panel";
import {
  ExaminerInvitationLoadingState,
  ExaminerInvitationPageShell,
} from "@/components/examiner-invitation/examiner-invitation-page-shell";
import { ExaminerInvitationProfilePanel } from "@/components/examiner-invitation/examiner-invitation-profile-panel";
import { ExaminerInvitationTabs } from "@/components/examiner-invitation/examiner-invitation-tabs";
import { useExaminerInvitationTab } from "@/components/examiner-invitation/use-examiner-invitation-tab";
import { getPublicExaminerInvitation, type ExaminerInvitationPublic } from "@/lib/api";

export default function ExaminerInvitationPublicPage() {
  const params = useParams();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<ExaminerInvitationPublic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isRosterPortal = invitation?.portal_mode === "roster";
  const isAccepted = invitation?.status === "accepted" || isRosterPortal;
  const { activeTab, setActiveTab } = useExaminerInvitationTab({ isAccepted: isAccepted === true });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setInvitation(await getPublicExaminerInvitation(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Invitation not found");
      setInvitation(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccepted = useCallback(async () => {
    try {
      const inv = await getPublicExaminerInvitation(token);
      setInvitation(inv);
      if (inv.status === "accepted") {
        setActiveTab("profile");
      }
    } catch {
      await load();
    }
  }, [load, setActiveTab, token]);

  if (loading) {
    return <ExaminerInvitationLoadingState />;
  }

  if (loadError || !invitation) {
    return (
      <ExaminerInvitationPageShell>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="relative mb-5 h-16 w-16 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <Image src="/logo-crest-only.png" alt="" fill sizes="64px" className="object-cover opacity-60" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Invitation unavailable</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {loadError ??
              "This link may have expired or is no longer valid. Please contact the exam office if you need help."}
          </p>
        </div>
      </ExaminerInvitationPageShell>
    );
  }

  return (
    <ExaminerInvitationPageShell>
      <ExaminerInvitationTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showProfile={isAccepted === true}
      />

      {activeTab === "profile" && isAccepted ? (
        <ExaminerInvitationProfilePanel token={token} invitation={invitation} />
      ) : (
        <ExaminerInvitationLandingPanel
          token={token}
          invitation={invitation}
          actionMessage={actionMessage}
          onActionMessage={setActionMessage}
          onAccepted={() => void handleAccepted()}
        />
      )}
    </ExaminerInvitationPageShell>
  );
}
