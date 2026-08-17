import type { WorkforcePayoutRow } from "@/lib/api";

export type WorkforcePayoutSortKey =
  | "full_name"
  | "completed_scripts"
  | "paper1_script_count"
  | "paper2_script_count"
  | "num_days"
  | "payable_ghs";
export type WorkforcePayoutSortDir = "asc" | "desc";

export type WorkforcePayoutBankFilter = "all" | "missing-bank";

export function matchesWorkforcePayoutSearch(row: WorkforcePayoutRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.full_name,
    row.reference_code,
    row.phone_number,
    row.bank_name,
    row.branch_name,
    row.account_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function workforcePayoutMissingBank(row: WorkforcePayoutRow): boolean {
  return !row.has_bank_account || !row.account_number?.trim() || !row.bank_code?.trim();
}

export function paperScriptCount(row: WorkforcePayoutRow, paper: 1 | 2): number {
  if (paper === 1) return row.paper1_script_count ?? 0;
  return row.paper2_script_count ?? 0;
}

function numericSortValue(row: WorkforcePayoutRow, sortKey: WorkforcePayoutSortKey): number {
  if (sortKey === "completed_scripts") return row.completed_scripts;
  if (sortKey === "paper1_script_count") return paperScriptCount(row, 1);
  if (sortKey === "paper2_script_count") return paperScriptCount(row, 2);
  if (sortKey === "num_days") return row.num_days;
  return Number.parseFloat(row.payable_ghs || "0");
}

export function sortWorkforcePayoutRows(
  rows: WorkforcePayoutRow[],
  sortKey: WorkforcePayoutSortKey,
  sortDir: WorkforcePayoutSortDir,
): WorkforcePayoutRow[] {
  const mult = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === "full_name") {
      return mult * a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
    }
    return mult * (numericSortValue(a, sortKey) - numericSortValue(b, sortKey));
  });
}

export function workforcePayoutsWithWork(items: WorkforcePayoutRow[]): WorkforcePayoutRow[] {
  return items.filter(
    (row) => row.completed_scripts > 0 || Number.parseFloat(row.payable_ghs || "0") > 0,
  );
}

export function sumWorkforcePayableGhs(rows: WorkforcePayoutRow[]): number {
  return rows.reduce((acc, row) => acc + Number.parseFloat(row.payable_ghs || "0"), 0);
}
