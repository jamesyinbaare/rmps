"use client";

import { Info } from "lucide-react";

export function ExaminerRatesFormulaCallout() {
  return (
    <div className="flex gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.04] px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="font-medium text-foreground">How examiner totals are calculated</p>
        <p className="mt-1">
          Each examiner&apos;s net payout is the sum of role allowances, marking (after 10% tax), vetting (after 10%
          tax), internal commuting, and T&amp;T. Marking and vetting are taxed at 10%; other lines are paid in full.
        </p>
        <p className="mt-2">
          Finance can view three payout batches on the payouts screen:{" "}
          <strong className="font-medium text-foreground">T&amp;T &amp; commuting</strong>,{" "}
          <strong className="font-medium text-foreground">Allowances &amp; marking</strong>, or{" "}
          <strong className="font-medium text-foreground">All together</strong>. Each batch can also be exported
          separately for BoG payment.
        </p>
      </div>
    </div>
  );
}
