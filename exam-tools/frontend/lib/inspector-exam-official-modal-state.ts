import type { ExamOfficialDesignation } from "@/lib/api";

export type AccountFormSnapshot = {
  fullName: string;
  designation: ExamOfficialDesignation;
  telephone: string;
  accountNumber: string;
  accountConfirm: string;
  numDays: string;
  numDaysConfirm: string;
  selectedBankName: string;
  selectedBranchId: string;
  editBankOpen: boolean;
  editAccountOpen: boolean;
  editDaysOpen: boolean;
};

export function snapshotAccountForm(state: AccountFormSnapshot): AccountFormSnapshot {
  return { ...state };
}

export function accountFormIsDirty(
  current: AccountFormSnapshot,
  baseline: AccountFormSnapshot | null,
): boolean {
  if (!baseline) return false;
  return (Object.keys(baseline) as (keyof AccountFormSnapshot)[]).some(
    (key) => current[key] !== baseline[key],
  );
}

export type ImportModalSnapshot = {
  selectedIdsKey: string;
  numDaysById: Record<string, string>;
};

export function snapshotImportModal(
  selectedIds: Set<string>,
  numDaysById: Record<string, string>,
): ImportModalSnapshot {
  return {
    selectedIdsKey: [...selectedIds].sort().join(","),
    numDaysById: { ...numDaysById },
  };
}

export function importModalIsDirty(
  selectedIds: Set<string>,
  numDaysById: Record<string, string>,
  baseline: ImportModalSnapshot | null,
): boolean {
  if (!baseline) return false;
  const currentKey = [...selectedIds].sort().join(",");
  if (currentKey !== baseline.selectedIdsKey) return true;
  const ids = new Set([...selectedIds, ...baseline.selectedIdsKey.split(",").filter(Boolean)]);
  for (const id of ids) {
    if ((numDaysById[id] ?? "") !== (baseline.numDaysById[id] ?? "")) return true;
  }
  return false;
}

export function importSelectionSummary(
  selectedIds: Set<string>,
  numDaysById: Record<string, string>,
  parseDays: (value: string) => number | null,
): { officialCount: number; totalDays: number; allDaysValid: boolean } {
  let totalDays = 0;
  let allDaysValid = selectedIds.size > 0;
  for (const id of selectedIds) {
    const days = parseDays(numDaysById[id] ?? "");
    if (days === null) {
      allDaysValid = false;
    } else {
      totalDays += days;
    }
  }
  if (selectedIds.size === 0) allDaysValid = false;
  return { officialCount: selectedIds.size, totalDays, allDaysValid };
}

export function importDisabledHint(
  selectedCount: number,
  allDaysValid: boolean,
): string | null {
  if (selectedCount === 0) {
    return "Select at least one official to continue.";
  }
  if (!allDaysValid) {
    return "Enter at least 1 day for each selected official.";
  }
  return null;
}
