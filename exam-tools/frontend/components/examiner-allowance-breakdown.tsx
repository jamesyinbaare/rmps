"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { AdminExaminerAllowanceRow, ExaminerTypeApi } from "@/lib/api";
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

type Props = {
  row: AdminExaminerAllowanceRow;
  examinerName?: string;
  className?: string;
};

export function ExaminerAllowanceBreakdownCell({ row, examinerName, className }: Props) {
  const totalLabel = formatGhsAmount(row.total_payable_ghs);
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
            "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-right tabular-nums underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-ring/30",
            className,
          )}
          aria-label={ariaLabel}
        >
          <span>{totalLabel}</span>
          <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
              <BreakdownRow label="Vetting of Scripts" value={formatGhsAmount(row.vetting_of_scripts_ghs)} />
              <BreakdownRow label="Internal Commuting" value={formatGhsAmount(row.internal_commuting_ghs)} />
            </div>
          </div>
          {row.subject_breakdowns.map((sub) => (
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
              <div className="mt-2 space-y-1">
                <BreakdownRow label="Allocated scripts" value={String(sub.allocated_booklets)} />
                <BreakdownRow
                  label="Rate per script"
                  value={formatGhsAmount(sub.rate_per_script_ghs ?? null)}
                />
                <BreakdownRow label="Marking" value={formatGhsAmount(sub.marking_allowance_ghs ?? null)} />
              </div>
            </div>
          ))}
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
          <div className="border-t border-border pt-2">
            <BreakdownRow label="Total payable" value={totalLabel} />
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
