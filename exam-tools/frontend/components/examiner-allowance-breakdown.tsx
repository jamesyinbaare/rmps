"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScriptSourceIndicator } from "@/components/examiner-accounts/script-source-indicator";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { AdminExaminerAllowanceRow, ExaminerTypeApi, SubjectMarkingBreakdownRow } from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  payoutAmountForView,
  type ExaminerPayoutView,
} from "@/lib/examiner-payout-view";
import { cn } from "@/lib/utils";

function BreakdownRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-6", highlight && "font-medium text-foreground")}>
      <dt className={highlight ? "text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums font-medium text-foreground">{value}</dd>
    </div>
  );
}

type Props = {
  row: AdminExaminerAllowanceRow;
  examinerName?: string;
  className?: string;
  payoutView?: ExaminerPayoutView;
  displayAmount?: string;
};

function applicableMarkingBreakdowns(breakdowns: SubjectMarkingBreakdownRow[]): SubjectMarkingBreakdownRow[] {
  return breakdowns.filter((sub) => sub.allocated_booklets > 0);
}

export function ExaminerAllowanceBreakdownCell({
  row,
  examinerName,
  className,
  payoutView = "all",
  displayAmount,
}: Props) {
  const cellAmount = displayAmount ?? payoutAmountForView(row, payoutView);
  const totalLabel = formatGhsAmount(cellAmount);
  const markingBreakdowns = applicableMarkingBreakdowns(row.subject_breakdowns);
  const roleLabel = EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const ariaLabel = examinerName
    ? `Allowance for ${examinerName}: ${totalLabel}. Open breakdown.`
    : `Allowance ${totalLabel}. Open breakdown.`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-right tabular-nums underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-ring/30",
            className,
          )}
          aria-label={ariaLabel}
        >
          <span className="font-semibold">{totalLabel}</span>
          <Info
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">{examinerName ?? row.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {roleLabel} · {row.region}
          </p>
        </div>
        <dl className="space-y-2 px-3 py-3 text-sm">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
            <p className="font-medium text-foreground">Role allowances (once)</p>
            <div className="mt-2 space-y-1">
              <BreakdownRow label="Responsibility" value={formatGhsAmount(row.responsibility_allowance_ghs)} />
              <BreakdownRow label="Inconvenience" value={formatGhsAmount(row.inconvenience_allowance_ghs)} />
              <BreakdownRow
                label="Chief Examiner's Report"
                value={formatGhsAmount(row.chief_examiners_report_ghs)}
              />
              <BreakdownRow label="Vetting of Scripts (gross)" value={formatGhsAmount(row.vetting_of_scripts_ghs)} />
              <BreakdownRow label="Vetting tax (10%)" value={formatGhsAmount(row.vetting_withholding_tax_ghs)} />
              <BreakdownRow label="Vetting net" value={formatGhsAmount(row.vetting_net_ghs)} />
              <BreakdownRow label="Internal Commuting" value={formatGhsAmount(row.internal_commuting_ghs)} />
            </div>
          </div>
          {markingBreakdowns.map((sub) => (
            <div
              key={`${sub.subject_id}-${sub.paper_number}`}
              className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2"
            >
              <p className="font-medium text-foreground">
                {sub.subject_code || sub.subject_name}
                {sub.subject_code && sub.subject_name ? (
                  <span className="font-normal text-muted-foreground"> — {sub.subject_name}</span>
                ) : null}
                <span className="font-normal text-muted-foreground"> · Paper {sub.paper_number}</span>
              </p>
              <p className="mt-1">
                <ScriptSourceIndicator source={sub.script_source === "manual" ? "manual" : "allocation"} />
              </p>
              <div className="mt-2 space-y-1">
                <BreakdownRow
                  label={sub.script_source === "manual" ? "Manual scripts" : "Automatic scripts"}
                  value={String(sub.allocated_booklets)}
                />
                <BreakdownRow
                  label="Rate per script"
                  value={formatGhsAmount(sub.rate_per_script_ghs ?? null)}
                />
                <BreakdownRow label="Marking (gross)" value={formatGhsAmount(sub.marking_allowance_ghs ?? null)} />
              </div>
            </div>
          ))}
          {markingBreakdowns.length > 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
              <p className="font-medium text-foreground">Marking (total)</p>
              <div className="mt-2 space-y-1">
                <BreakdownRow label="Marking (gross)" value={formatGhsAmount(row.marking_allowance_ghs)} />
                <BreakdownRow label="Marking tax (10%)" value={formatGhsAmount(row.marking_withholding_tax_ghs)} />
                <BreakdownRow label="Marking net" value={formatGhsAmount(row.marking_net_ghs)} />
              </div>
            </div>
          ) : null}
          {Number(row.travel_role_factor) !== 1 ? (
            <>
              {row.travel_zone_name ? (
                <BreakdownRow label="T & T zone" value={row.travel_zone_name} />
              ) : null}
              <BreakdownRow label="Base T & T" value={formatGhsAmount(row.travel_base_ghs)} />
              <BreakdownRow label="Role factor" value={row.travel_role_factor} />
              <BreakdownRow label="T & T payable" value={formatGhsAmount(row.travel_and_transport_ghs)} />
            </>
          ) : (
            <BreakdownRow label="T & T" value={formatGhsAmount(row.travel_and_transport_ghs)} />
          )}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
            <p className="font-medium text-foreground">Payout batches</p>
            <div className="mt-2 space-y-1">
              <BreakdownRow
                label="T&T & commuting"
                value={formatGhsAmount(row.payout_travel_commuting_ghs)}
                highlight={payoutView === "travel_commuting"}
              />
              <BreakdownRow
                label="Allowances & marking"
                value={formatGhsAmount(row.payout_allowances_marking_ghs)}
                highlight={payoutView === "allowances_marking"}
              />
              <BreakdownRow
                label="All together (net)"
                value={formatGhsAmount(row.total_payable_ghs)}
                highlight={payoutView === "all"}
              />
            </div>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
