"use client";

import { useState } from "react";
import { Check, Copy, UtensilsCrossed } from "lucide-react";

import { ExaminerReferenceCodeQrCell } from "@/components/examiners/examiner-reference-code-qr-cell";
import { cn } from "@/lib/utils";

type Props = {
  examinationId: number;
  referenceCode: string;
  examinerName: string;
  className?: string;
};

export function ExaminerLunchIdCard({ examinationId, referenceCode, examinerName, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      id="profile-lunch"
      className={cn(
        "scroll-mt-4 overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.1] via-card to-card shadow-sm",
        className,
      )}
      aria-labelledby="profile-lunch-title"
    >
      <div className="border-b border-amber-500/20 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <UtensilsCrossed className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="profile-lunch-title" className="text-base font-semibold text-foreground">
              Lunch pass
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Present this code or QR at the lunch station for verification.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center px-4 py-6 sm:px-5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Your lunch ID
        </p>
        <div className="mt-2 flex items-center gap-2">
          <p className="font-mono text-2xl font-bold tracking-wider text-foreground sm:text-3xl">
            {referenceCode}
          </p>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label={copied ? "Copied" : `Copy lunch ID ${referenceCode}`}
          >
            {copied ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
          </button>
        </div>
        {copied ? (
          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400" role="status">
            Copied to clipboard
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Tap the QR to enlarge for scanning</p>
        )}

        <div className="mt-5 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
          <ExaminerReferenceCodeQrCell
            examinationId={examinationId}
            referenceCode={referenceCode}
            examinerName={examinerName}
            previewSize={140}
            modalSize={240}
            showCodeLabel={false}
          />
        </div>
      </div>
    </section>
  );
}
