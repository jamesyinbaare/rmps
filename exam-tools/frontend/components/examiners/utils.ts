import { DEFAULT_PAGE_SIZE, MAX_CUSTOM_PAGE_SIZE } from "@/components/examiners/constants";
import type { ExaminersTab } from "@/components/examiners/types";

export function parseExaminersTab(raw: string | null): ExaminersTab {
  if (
    raw === "invitations" ||
    raw === "groups" ||
    raw === "cohorts" ||
    raw === "quotas" ||
    raw === "appointment-letters"
  ) {
    return raw;
  }
  return "roster";
}

export function clampPageSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_CUSTOM_PAGE_SIZE);
}

export function matchesRosterSearch(
  name: string,
  phone: string | null | undefined,
  q: string,
  referenceCode?: string | null,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (name.toLowerCase().includes(needle)) return true;
  if (phone?.toLowerCase().includes(needle)) return true;
  if (referenceCode?.toLowerCase().includes(needle)) return true;
  return false;
}

export { humanizeRegion } from "@/components/examiner-invitations/utils";
