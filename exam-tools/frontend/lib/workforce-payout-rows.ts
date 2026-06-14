import type { WorkforcePayoutRow } from "@/lib/api";

export type WorkforcePayoutSortKey = "full_name" | "completed_scripts" | "payable_ghs";
export type WorkforcePayoutSortDir = "asc" | "desc";

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
    if (sortKey === "completed_scripts") {
      return mult * (a.completed_scripts - b.completed_scripts);
    }
    const pa = Number.parseFloat(a.payable_ghs || "0");
    const pb = Number.parseFloat(b.payable_ghs || "0");
    return mult * (pa - pb);
  });
}

export function workforcePayoutsWithWork(items: WorkforcePayoutRow[]): WorkforcePayoutRow[] {
  return items.filter(
    (row) => row.completed_scripts > 0 || Number.parseFloat(row.payable_ghs || "0") > 0,
  );
}
