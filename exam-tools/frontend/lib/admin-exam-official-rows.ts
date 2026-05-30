import type { AdminExamCentreOfficialRow } from "@/lib/api";

export type AdminOfficialSortKey = "center_code" | "full_name" | "total_payable";
export type AdminOfficialSortDir = "asc" | "desc";

function parsePayable(value: string | null | undefined): number {
  if (value == null || value === "") return -1;
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? -1 : n;
}

export function matchesAdminOfficialSearch(row: AdminExamCentreOfficialRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.full_name.toLowerCase().includes(q) ||
    row.center_code.toLowerCase().includes(q) ||
    row.center_name.toLowerCase().includes(q) ||
    row.designation.toLowerCase().includes(q) ||
    row.bank_name.toLowerCase().includes(q) ||
    row.branch_name.toLowerCase().includes(q) ||
    row.bank_code.toLowerCase().includes(q) ||
    row.account_number.toLowerCase().includes(q) ||
    row.telephone_number.toLowerCase().includes(q)
  );
}

export function sortAdminOfficialRows(
  rows: AdminExamCentreOfficialRow[],
  key: AdminOfficialSortKey,
  dir: AdminOfficialSortDir,
): AdminExamCentreOfficialRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "center_code") {
      const code = a.center_code.localeCompare(b.center_code) * mul;
      if (code !== 0) return code;
      return a.full_name.localeCompare(b.full_name) * mul;
    }
    if (key === "total_payable") {
      const diff = (parsePayable(a.total_payable_ghs) - parsePayable(b.total_payable_ghs)) * mul;
      if (diff !== 0) return diff;
      return a.full_name.localeCompare(b.full_name) * mul;
    }
    return a.full_name.localeCompare(b.full_name) * mul;
  });
}

export function countDistinctCentres(rows: AdminExamCentreOfficialRow[]): number {
  return new Set(rows.map((r) => r.center_id)).size;
}

export function groupAdminOfficialRowsByCentre(
  rows: AdminExamCentreOfficialRow[],
): { centerId: string; centerCode: string; centerName: string; rows: AdminExamCentreOfficialRow[] }[] {
  const map = new Map<
    string,
    { centerId: string; centerCode: string; centerName: string; rows: AdminExamCentreOfficialRow[] }
  >();
  for (const row of rows) {
    let group = map.get(row.center_id);
    if (!group) {
      group = {
        centerId: row.center_id,
        centerCode: row.center_code,
        centerName: row.center_name,
        rows: [],
      };
      map.set(row.center_id, group);
    }
    group.rows.push(row);
  }
  return [...map.values()].sort((a, b) => a.centerCode.localeCompare(b.centerCode));
}
