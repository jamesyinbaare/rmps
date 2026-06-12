"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getExaminerPortalSettings,
  notifyEligibleAppointmentLetters,
  putExaminerPortalSettings,
  type ExaminerPortalSettings,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  examId: number;
  className?: string;
};

export function ExaminersAppointmentLetterReleasePanel({ examId, className }: Props) {
  const [settings, setSettings] = useState<ExaminerPortalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await getExaminerPortalSettings(examId);
      setSettings(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load portal settings");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const row = await putExaminerPortalSettings(examId, enabled);
      setSettings(row);
      setMessage(enabled ? "Appointment letter release enabled." : "Appointment letter release disabled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update settings");
    } finally {
      setBusy(false);
    }
  }

  async function handleNotify() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await notifyEligibleAppointmentLetters(examId);
      await load();
      setMessage(
        `SMS sent to ${result.sms_sent_count} examiner(s).` +
          (result.sms_failed_count ? ` ${result.sms_failed_count} failed.` : "") +
          (result.skipped_count ? ` ${result.skipped_count} skipped.` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send notifications");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/90 px-4 py-4 sm:px-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Appointment letter release</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Examiners can upload bank details and download appointment letters after their coordination
            period ends, once release is enabled.
          </p>
          {settings ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
              <div>
                <dt className="font-medium text-foreground">Rostered</dt>
                <dd>{settings.rostered_examiner_count}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">With coordination end</dt>
                <dd>{settings.with_coordination_end_count}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Eligible now</dt>
                <dd>{settings.eligible_now_count}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Notified</dt>
                <dd>{settings.notified_count}</dd>
              </div>
            </dl>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={settings?.appointment_letters_release_enabled ?? false}
              disabled={loading || busy || settings == null}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
            Enable release
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || busy || !settings?.appointment_letters_release_enabled}
            onClick={() => void handleNotify()}
          >
            {busy ? "Working…" : "Notify eligible examiners"}
          </Button>
        </div>
      </div>
      {loading ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : null}
      {error ? (
        <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
