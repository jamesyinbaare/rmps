"use client";

import { useEffect, useId } from "react";
import { AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";

import { humanizeRegion } from "@/components/examiners/utils";
import type { LunchCouponVerifyResult } from "@/lib/api";
import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  result: LunchCouponVerifyResult;
  onDismiss: () => void;
};

function formatVerifiedAt(value: string | null | undefined): string {
  if (!value) return "earlier";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LunchVerificationRepeatModal({ result, onDismiss }: Props) {
  const titleId = useId();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={onDismiss}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
                Already verified today
              </h2>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm sm:px-5">
          <p className="text-foreground">
            <span className="font-semibold">{result.name}</span>{" "}
            <span className="font-mono text-muted-foreground">({result.reference_code})</span> was verified{" "}
            {formatVerifiedAt(result.verified_at)}
            {result.verified_by_name ? (
              <>
                {" "}
                by <span className="font-medium">{result.verified_by_name}</span>
              </>
            ) : null}
            .
          </p>
          {result.message ? (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-foreground">
              {result.message}
            </p>
          ) : null}
          <dl className="rounded-xl border border-border/70 bg-muted/30 px-3 py-3">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium text-foreground">{result.examiner_type_label}</dd>
            </div>
            {result.region ? (
              <div className="mt-2 flex justify-between gap-3">
                <dt className="text-muted-foreground">Region</dt>
                <dd className="font-medium text-foreground">{humanizeRegion(result.region)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="border-t border-border px-4 py-4 sm:px-5">
          <button
            type="button"
            className={cn(officialAccountsBtnSecondary, "w-full sm:ml-auto sm:w-auto")}
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
