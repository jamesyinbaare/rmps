"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadPublicExaminerAppointmentLetterPdf, type ExaminerInvitationPublic } from "@/lib/api";

type Props = {
  token: string;
  inviteeName: string;
  invitation: ExaminerInvitationPublic;
  pendingMessage?: string | null;
};

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "examiner";
}

export function ExaminerAppointmentLetterSection({
  token,
  inviteeName,
  invitation,
  pendingMessage,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = invitation.appointment_letters_available === true;

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const filename = `appointment_letter_${sanitizeFilenamePart(inviteeName)}.pdf`;
      await downloadPublicExaminerAppointmentLetterPdf(token, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download appointment letter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm sm:p-5"
      aria-labelledby="examiner-appointment-letter-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileDown className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="examiner-appointment-letter-title" className="text-base font-semibold text-foreground">
            Appointment letter
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Download your official CTVET appointment letter for your records. Acceptance of your appointment is
            confirmed on this dashboard when you confirm your availability.
          </p>
        </div>
      </div>

      {pendingMessage ? (
        <p
          className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-foreground"
          role="status"
        >
          {pendingMessage}
          {invitation.coordination_end_at ? (
            <>
              {" "}
              Coordination ends{" "}
              {new Date(invitation.coordination_end_at).toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              .
            </>
          ) : null}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className="mt-4 min-h-11 w-full"
        disabled={busy || !available}
        onClick={() => void handleDownload()}
      >
        {busy ? "Preparing PDF…" : available ? "Download appointment letter (PDF)" : "Letter not yet available"}
      </Button>
    </section>
  );
}
