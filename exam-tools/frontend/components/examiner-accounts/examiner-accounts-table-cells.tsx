"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { EXAMINER_TYPE_ABBREVIATIONS, EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { AdminExaminerAllowanceRow, ExaminerTypeApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export function isBankAccountIncomplete(row: AdminExaminerAllowanceRow): boolean {
  return !row.bank_name?.trim() || !row.branch_name?.trim() || !row.account_number?.trim();
}

function examinerSubline(row: AdminExaminerAllowanceRow, showRegion: boolean): string {
  const parts: string[] = [];
  if (showRegion && row.region?.trim()) parts.push(row.region.trim());
  if (row.phone_number?.trim()) parts.push(row.phone_number.trim());
  return parts.join(" · ");
}

type IdentityProps = {
  row: AdminExaminerAllowanceRow;
  showRole: boolean;
  showRegion: boolean;
  rowIndex?: number;
};

export function ExaminerIdentityCell({ row, showRole, showRegion, rowIndex }: IdentityProps) {
  const roleAbbrev = EXAMINER_TYPE_ABBREVIATIONS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const roleFull = EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
  const subline = examinerSubline(row, showRegion);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        {rowIndex != null ? (
          <span className="mt-0.5 shrink-0 tabular-nums text-xs text-muted-foreground">{rowIndex}</span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-medium text-foreground">{row.full_name}</span>
            {showRole ? (
              <span
                className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={roleFull}
              >
                {roleAbbrev}
              </span>
            ) : null}
          </div>
          {subline ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subline}</p> : null}
        </div>
      </div>
    </div>
  );
}

type BankProps = {
  row: AdminExaminerAllowanceRow;
};

export function ExaminerBankAccountCell({ row }: BankProps) {
  const [copied, setCopied] = useState(false);
  const incomplete = isBankAccountIncomplete(row);

  if (incomplete) {
    return (
      <span className="inline-flex rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
        Incomplete
      </span>
    );
  }

  const account = row.account_number!.trim();

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-sm tabular-nums text-foreground">{account}</span>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          onClick={() => void copyAccount()}
          aria-label={copied ? "Copied account number" : "Copy account number"}
        >
          {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
      </div>
      {row.bank_name?.trim() ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={row.bank_name}>
          {row.bank_name}
        </p>
      ) : null}
    </div>
  );
}

type ScriptsProps = {
  scriptCount: number;
};

export function ExaminerScriptsCell({ scriptCount }: ScriptsProps) {
  return (
    <div className="text-right tabular-nums">
      <span>{scriptCount.toLocaleString()}</span>
    </div>
  );
}

export function examinerRowIncompleteClass(row: AdminExaminerAllowanceRow): string {
  return isBankAccountIncomplete(row) ? "border-l-2 border-l-amber-500/50" : "";
}
