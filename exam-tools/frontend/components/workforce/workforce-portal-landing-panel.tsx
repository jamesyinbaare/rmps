"use client";

import { useEffect, useId, useState } from "react";
import { CalendarClock, CheckCircle2, MapPin, UserCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  acceptPublicWorkforceAvailability,
  declinePublicWorkforceAvailability,
  type WorkforcePublicPortal,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  formatInvitationDeadline,
  WorkforcePortalTile,
} from "@/components/workforce/workforce-portal-shell";
import { buildWorkforceAcceptanceStatement } from "@/lib/workforce-acceptance-statement";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type ConfirmAction = "accept" | "decline";

type Props = {
  config: WorkforceKindConfig;
  token: string;
  profile: WorkforcePublicPortal;
  onConfirmed: () => void;
};

function isConfirmationValid(action: ConfirmAction, value: string): boolean {
  return value.trim().toLowerCase() === action;
}

function statusMeta(status: WorkforcePublicPortal["availability_status"]) {
  if (status === "confirmed") {
    return {
      label: "Availability confirmed",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }
  if (status === "declined") {
    return {
      label: "Declined",
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }
  return {
    label: "Awaiting response",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  };
}

export function WorkforcePortalLandingPanel({ config, token, profile, onConfirmed }: Props) {
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const confirmInputId = useId();
  const confirmTitleId = useId();

  const canRespond = profile.can_respond;
  const status = statusMeta(profile.availability_status);
  const StatusIcon =
    profile.availability_status === "confirmed"
      ? CheckCircle2
      : profile.availability_status === "declined"
        ? XCircle
        : CalendarClock;
  const statement = buildWorkforceAcceptanceStatement(profile);

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
    setActionMessage(null);
    try {
      const res = await acceptPublicWorkforceAvailability(config.kind, token);
      setActionMessage(res.message);
      setConfirmAction(null);
      setConfirmText("");
      onConfirmed();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Could not confirm availability");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    setActionMessage(null);
    try {
      const res = await declinePublicWorkforceAvailability(config.kind, token);
      setActionMessage(res.message);
      setConfirmAction(null);
      setConfirmText("");
      onConfirmed();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Could not record decline");
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
              <p className="text-sm font-medium text-primary">Hello, {profile.name.split(" ")[0]}</p>
              <h1 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                {profile.examination_label}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{config.label} invitation</p>
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

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {profile.availability_status === "declined"
              ? "You declined this assignment. Please contact the exam office if your plans change."
              : profile.availability_status === "confirmed"
                ? "Thank you for confirming. Your portal is ready — batches and bank details are below."
                : canRespond
                  ? `You've been invited as a ${config.label.toLowerCase()}. Review the details below, then confirm or decline before the deadline.`
                  : "This invitation is no longer open for a response. Please contact the exam office if you have questions."}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <WorkforcePortalTile icon={UserCircle} label="Name" value={profile.name} className="col-span-2" />
            <WorkforcePortalTile icon={UserCircle} label="Role" value={profile.role_label} />
            {profile.region ? (
              <WorkforcePortalTile icon={MapPin} label="Region" value={profile.region} />
            ) : null}
            {profile.availability_deadline ? (
              <WorkforcePortalTile
                icon={CalendarClock}
                label="Respond by"
                value={formatInvitationDeadline(profile.availability_deadline)}
                className="col-span-2"
              />
            ) : null}
          </div>

          {canRespond ? (
            <section className="mt-5 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4" aria-label="Acceptance statement">
              <h2 className="text-sm font-semibold text-foreground">Acceptance statement</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{statement}</p>
            </section>
          ) : null}

          {actionMessage ? (
            <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground" role="status">
              {actionMessage}
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
                onClick={() => {
                  setConfirmAction("accept");
                  setConfirmText("");
                  setActionMessage(null);
                }}
              >
                Confirm availability
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                size="lg"
                className="min-h-12 w-full text-base"
                onClick={() => {
                  setConfirmAction("decline");
                  setConfirmText("");
                  setActionMessage(null);
                }}
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
            <h2 id={confirmTitleId} className="text-lg font-semibold text-foreground">
              {confirmAction === "accept" ? "Confirm availability" : "Decline invitation"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {confirmAction === "accept"
                ? "Please read the acceptance statement, then type accept to confirm."
                : "Type decline to record that you cannot take this role."}
            </p>
            {confirmAction === "accept" ? (
              <p className="mt-4 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3.5 text-sm leading-relaxed text-foreground">
                {statement}
              </p>
            ) : null}
            <div className="mt-4">
              <label className={formLabelClass} htmlFor={confirmInputId}>
                Type <span className="font-mono font-semibold text-foreground">{confirmAction}</span> below
              </label>
              <input
                id={confirmInputId}
                className={formInputClass}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                type="button"
                disabled={busy || !isConfirmationValid(confirmAction, confirmText)}
                className="min-h-11 w-full sm:w-auto"
                onClick={() => void (confirmAction === "accept" ? handleAccept() : handleDecline())}
              >
                {busy ? "Saving…" : confirmAction === "accept" ? "Confirm" : "Decline"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} className="min-h-11 w-full sm:w-auto" onClick={closeConfirm}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
