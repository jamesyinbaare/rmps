"use client";

import { Info } from "lucide-react";

export function ExaminerRatesFormulaCallout() {
  return (
    <div className="flex gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.04] px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div>
        <p className="font-medium text-foreground">How examiner totals are calculated</p>
        <p className="mt-1">
          Each examiner&apos;s payout is the sum of three parts:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 pl-0.5">
          <li>
            <strong className="font-medium text-foreground">Role allowances</strong> — five flat amounts for their
            role, counted once.
          </li>
          <li>
            <strong className="font-medium text-foreground">Marking</strong> — for each subject and paper:{" "}
            <span className="text-foreground">rate per script × allocated scripts</span>.
          </li>
          <li>
            <strong className="font-medium text-foreground">T &amp; T</strong> — from their home region:{" "}
            <span className="text-foreground">regional amount × role factor for their T&amp;T zone</span> (factor is 1
            when left blank).
          </li>
        </ul>
      </div>
    </div>
  );
}
