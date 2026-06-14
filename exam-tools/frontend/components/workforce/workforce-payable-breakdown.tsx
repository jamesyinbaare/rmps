"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorkforcePayoutCompletedBatchLine, WorkforcePayoutRow } from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import { cn } from "@/lib/utils";

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium text-foreground">{value}</dd>
    </div>
  );
}

function batchLabel(line: WorkforcePayoutCompletedBatchLine): string {
  const subject = line.subject_name ?? line.subject_code ?? `Subject #${line.subject_id}`;
  return `${subject} · P${line.paper_number} · batch ${line.batch_sequence}`;
}

type Props = {
  row: WorkforcePayoutRow;
  personName?: string;
  unitLabel: string;
  ratesHref: string;
  className?: string;
};

/** Net payable with popover breakdown (scripts × rate − tax + daily allowances). */
export function WorkforcePayableBreakdownCell({
  row,
  personName,
  unitLabel,
  ratesHref,
  className,
}: Props) {
  const hasPayable = row.payable_ghs != null && row.payable_ghs !== "" && Number(row.payable_ghs) > 0;
  const triggerText = hasPayable ? formatGhsAmount(row.payable_ghs) : row.has_rate ? formatGhsAmount("0") : "Not set";

  const ariaLabel = personName
    ? `Payable for ${personName}: ${triggerText}. Open breakdown.`
    : `Payable ${triggerText}. Open breakdown.`;

  const unitSingular = unitLabel === "entries" ? "entry" : "script";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left tabular-nums",
            "underline decoration-dotted underline-offset-2 hover:bg-muted/80",
            "focus:outline-none focus:ring-2 focus:ring-ring/40",
            hasPayable ? "font-medium text-foreground" : "font-normal text-muted-foreground",
            className,
          )}
          aria-label={ariaLabel}
        >
          <span>{triggerText}</span>
          <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[18rem] max-w-sm p-3 text-sm" align="end" side="left">
        <p className="font-medium text-foreground">Payable breakdown</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Exam total — all completed {unitLabel} across subjects and papers
        </p>

        {!row.has_rate ? (
          <p className="mt-3 text-muted-foreground">
            Rates for this examination are not configured yet.
          </p>
        ) : (
          <dl className="mt-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {unitSingular.charAt(0).toUpperCase() + unitSingular.slice(1)} earnings
            </p>
            <BreakdownRow
              label={unitLabel === "entries" ? "Rate per entry" : "Rate per script"}
              value={formatGhsAmount(row.rate_per_script_ghs)}
            />
            <BreakdownRow label={`Completed ${unitLabel}`} value={row.completed_scripts.toLocaleString()} />
            <BreakdownRow
              label={`${row.completed_scripts.toLocaleString()} × ${formatGhsAmount(row.rate_per_script_ghs)}`}
              value={formatGhsAmount(row.script_gross_ghs)}
            />
            <BreakdownRow
              label={`Withholding tax (${row.withholding_tax_percent}%)`}
              value={`−${formatGhsAmount(row.withholding_tax_ghs)}`}
            />
            <BreakdownRow label="Net script earnings" value={formatGhsAmount(row.script_net_ghs)} />

            <div className="border-t border-border pt-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Daily allowances
              </p>
              <BreakdownRow label="Work days" value={row.num_days.toLocaleString()} />
              <BreakdownRow
                label={`Commute (${formatGhsAmount(row.commuting_allowance_ghs)}/day)`}
                value={formatGhsAmount(row.commuting_payable_ghs)}
              />
              <BreakdownRow
                label={`Lunch (${formatGhsAmount(row.lunch_allowance_ghs)}/day)`}
                value={formatGhsAmount(row.lunch_payable_ghs)}
              />
            </div>

            {row.completed_batch_lines.length > 0 ? (
              <div className="border-t border-border pt-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Completed batches
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {row.completed_batch_lines.map((line) => (
                    <li key={`${line.subject_id}-${line.paper_number}-${line.batch_sequence}`} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{batchLabel(line)}</span>
                      <span className="shrink-0 tabular-nums text-foreground">{line.script_count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex justify-between gap-6 border-t border-border pt-2">
              <dt className="font-medium text-foreground">Net payable</dt>
              <dd className="tabular-nums text-base font-semibold text-foreground">
                {formatGhsAmount(row.payable_ghs)}
              </dd>
            </div>
          </dl>
        )}

        <Link href={ratesHref} className="mt-3 block text-xs font-medium text-primary hover:underline">
          View or edit exam rates
        </Link>
      </PopoverContent>
    </Popover>
  );
}
