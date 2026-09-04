"use client";

import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { cn } from "@/lib/utils";

export function ExaminerRatesFormulaCallout({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const contentId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.04] text-sm leading-relaxed text-muted-foreground">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
      >
        <Info className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 font-medium text-foreground">How examiner payouts are calculated</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={contentId} className="border-t border-primary/10 px-3.5 pb-3 pt-2">
          <p>
            Each examiner&apos;s net payout is the sum of role allowances, sitting allowance (daily rate × days, after
            10% tax), marking (after 10% tax), vetting (after 10% tax), internal commuting, and T&amp;T — where enabled
            for their roster source and allowance groups. Marking, vetting, and sitting are taxed at 10%.
          </p>
          <p className="mt-2">
            Finance can view three payout batches on the payouts screen:{" "}
            <strong className="font-medium text-foreground">T&amp;T &amp; commuting</strong>,{" "}
            <strong className="font-medium text-foreground">Allowances &amp; marking</strong>, or{" "}
            <strong className="font-medium text-foreground">All together</strong>. Each batch can also be exported
            separately for BoG payment.
          </p>
        </div>
      ) : null}
    </div>
  );
}
