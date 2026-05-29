"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatGhsAmount } from "@/lib/format-ghs";
import { cn } from "@/lib/utils";

function parseAmount(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

type BreakdownInput = {
  daily_rate_ghs?: string | null;
  commuting_allowance_ghs?: string | null;
  airtime_ghs?: string | null;
  total_payable_ghs?: string | null;
  num_days: number;
};

function buildBreakdown(row: BreakdownInput) {
  const daily = parseAmount(row.daily_rate_ghs);
  const commutingPerDay = parseAmount(row.commuting_allowance_ghs) ?? 0;
  const airtime = parseAmount(row.airtime_ghs) ?? 0;
  const days = row.num_days;

  if (daily === null) {
    return { ratesMissing: true as const, days };
  }

  const dailyPay = daily * days;
  const commutingPay = commutingPerDay * days;
  const totalFromApi = parseAmount(row.total_payable_ghs);
  const total = totalFromApi ?? dailyPay + commutingPay + airtime;

  return {
    ratesMissing: false as const,
    days,
    dailyRate: row.daily_rate_ghs,
    commutingPerDay: row.commuting_allowance_ghs,
    airtimeRate: row.airtime_ghs,
    dailyPay,
    commutingPay,
    airtimePay: airtime,
    total,
  };
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium text-foreground">{value}</dd>
    </div>
  );
}

type Props = {
  row: BreakdownInput & { designation?: string };
  examinationId?: number | null;
  officialName?: string;
  className?: string;
};

/** Total allowance with popover breakdown (rates × days + airtime). */
export function OfficialAllowanceBreakdownCell({ row, examinationId, officialName, className }: Props) {
  const breakdown = buildBreakdown(row);
  const totalLabel = formatGhsAmount(row.total_payable_ghs);
  const hasTotal = row.total_payable_ghs != null && row.total_payable_ghs !== "";
  const triggerText = hasTotal ? totalLabel : breakdown.ratesMissing ? "Not set" : totalLabel;

  const ariaLabel = officialName
    ? `Allowance for ${officialName}: ${triggerText}. Open breakdown.`
    : `Allowance ${triggerText}. Open breakdown.`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left tabular-nums",
            "underline decoration-dotted underline-offset-2 hover:bg-muted/80",
            "focus:outline-none focus:ring-2 focus:ring-ring/40",
            hasTotal ? "font-medium text-foreground" : "font-normal text-muted-foreground",
            className,
          )}
          aria-label={ariaLabel}
        >
          <span>{triggerText}</span>
          <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[17rem] p-3 text-sm" align="end" side="left">
        <p className="font-medium text-foreground">Allowance breakdown</p>
        {row.designation ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{row.designation}</p>
        ) : null}

        {breakdown.ratesMissing ? (
          <p className="mt-3 text-muted-foreground">
            Allowance rates for this role are not set for the selected examination.
          </p>
        ) : (
          <dl className="mt-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rates</p>
            <BreakdownRow label="Daily rate" value={formatGhsAmount(breakdown.dailyRate)} />
            <BreakdownRow label="Commuting (per day)" value={formatGhsAmount(breakdown.commutingPerDay)} />
            <BreakdownRow label="Airtime" value={formatGhsAmount(breakdown.airtimeRate)} />
            <BreakdownRow label="Days at centre" value={String(breakdown.days)} />

            <div className="border-t border-border pt-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Calculation
              </p>
              <BreakdownRow
                label={`Daily pay × ${breakdown.days}`}
                value={breakdown.dailyPay.toFixed(2)}
              />
              <BreakdownRow
                label={`Commuting × ${breakdown.days}`}
                value={breakdown.commutingPay.toFixed(2)}
              />
              <BreakdownRow label="Airtime" value={breakdown.airtimePay.toFixed(2)} />
            </div>

            <div className="flex justify-between gap-6 border-t border-border pt-2">
              <dt className="font-medium text-foreground">Total</dt>
              <dd className="tabular-nums text-base font-semibold text-foreground">
                {breakdown.total.toFixed(2)}
              </dd>
            </div>
          </dl>
        )}

        {examinationId != null ? (
          <Link
            href={`/dashboard/admin/official-rates?exam=${examinationId}`}
            className="mt-3 block text-xs font-medium text-primary hover:underline"
          >
            View or edit exam allowance rates
          </Link>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
