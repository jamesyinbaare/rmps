"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Lock,
  Upload,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  downloadCompletionDeclaration,
  getSchoolExamCompletion,
  uploadCompletionDeclaration,
  withdrawCompletionConfirmation,
} from "@/lib/api";
import type { SchoolCompletionStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  fee_paying: "Fee-paying",
  free_tvet: "Free TVET",
  referral: "Referral",
};

interface CompletionConfirmationPanelProps {
  examId: number;
  enabled: boolean;
  onLockedChange?: (locked: boolean) => void;
  className?: string;
}

export function CompletionConfirmationPanel({
  examId,
  enabled,
  onLockedChange,
  className,
}: CompletionConfirmationPanelProps) {
  const [data, setData] = useState<SchoolCompletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      onLockedChange?.(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getSchoolExamCompletion(examId);
      setData(result);
      onLockedChange?.(result.is_locked);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load completion status"
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, examId, onLockedChange]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) return null;

  const counts = data?.live_counts;
  const typeEntries = ["fee_paying", "free_tvet", "referral"].map((key) => ({
    key,
    label: TYPE_LABELS[key] || key,
    count: counts?.counts_by_type?.[key] ?? 0,
  }));

  const handleDownload = async () => {
    setBusy(true);
    try {
      await downloadCompletionDeclaration(examId);
      toast.success("Declaration downloaded");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download completion form"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const result = await uploadCompletionDeclaration(examId, file);
      setData(result);
      onLockedChange?.(result.is_locked);
      toast.success("Registration confirmed");
      if (result.notify_email_error || result.notify_sms_error) {
        const parts = [
          result.principal_email_sent ? "email sent" : result.notify_email_error,
          result.principal_sms_sent ? "SMS sent" : result.notify_sms_error,
        ].filter(Boolean);
        toast.message("Principal notification", {
          description: parts.join(" · "),
        });
      } else if (result.principal_email_sent || result.principal_sms_sent) {
        toast.success("Summary sent to the principal");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to confirm registration"
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleWithdraw = async () => {
    if (
      !window.confirm(
        "Withdraw confirmation? You will be able to edit registrations again until you re-confirm."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await withdrawCompletionConfirmation(examId);
      setData(result);
      onLockedChange?.(result.is_locked);
      toast.success("Confirmation withdrawn — registration unlocked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to withdraw confirmation"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-4 space-y-4",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Confirm registration completion
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            When you are finished registering candidates, download the completion
            form for the head to sign, then upload the signed form. This locks edits
            until you withdraw confirmation.
          </p>
        </div>
        {data?.is_confirmed && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Confirmed
          </span>
        )}
      </div>

      {data?.is_locked && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Registration locked</AlertTitle>
          <AlertDescription>
            Completion has been confirmed. Withdraw confirmation to add or edit
            candidates while the registration window is open.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading status…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-semibold">
                {counts?.total_candidates ?? 0}
              </div>
            </div>
            {typeEntries.map((t) => (
              <div key={t.key} className="rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">{t.label}</div>
                <div className="text-lg font-semibold">{t.count}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !data?.can_download}
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download completion form
            </Button>
            <Button
              type="button"
              disabled={busy || !data?.can_upload}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload signed form
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            {data?.can_withdraw && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={handleWithdraw}
              >
                <Unlock className="mr-2 h-4 w-4" />
                Withdraw confirmation
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
