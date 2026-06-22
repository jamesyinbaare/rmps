import type { SubjectMarkingGroupRow } from "@/lib/api";

export type ScriptsAllocationReleaseDraft = {
  enabled: boolean;
  releaseAt: string;
};

export function emptyScriptsAllocationReleaseDraft(): ScriptsAllocationReleaseDraft {
  return { enabled: false, releaseAt: "" };
}

export function scriptsAllocationReleaseFromRow(
  row: Pick<SubjectMarkingGroupRow, "scripts_allocation_release_enabled" | "scripts_allocation_release_at">,
): ScriptsAllocationReleaseDraft {
  return {
    enabled: row.scripts_allocation_release_enabled === true,
    releaseAt: isoToDatetimeLocal(row.scripts_allocation_release_at),
  };
}

export function scriptsAllocationReleaseToPayload(draft: ScriptsAllocationReleaseDraft): {
  scripts_allocation_release_enabled: boolean;
  scripts_allocation_release_at: string | null;
} {
  return {
    scripts_allocation_release_enabled: draft.enabled,
    scripts_allocation_release_at: draft.enabled ? datetimeLocalToIso(draft.releaseAt) : null,
  };
}

export function scriptsAllocationReleaseDraftEqual(
  a: ScriptsAllocationReleaseDraft,
  b: ScriptsAllocationReleaseDraft,
): boolean {
  return a.enabled === b.enabled && a.releaseAt === b.releaseAt;
}

export type ScriptsAllocationReleaseStatus = "not_released" | "scheduled" | "released";

export function scriptsAllocationReleaseStatus(
  row: Pick<SubjectMarkingGroupRow, "scripts_allocation_release_enabled" | "scripts_allocation_release_at">,
): ScriptsAllocationReleaseStatus {
  if (!row.scripts_allocation_release_enabled) {
    return "not_released";
  }
  if (row.scripts_allocation_release_at) {
    const at = new Date(row.scripts_allocation_release_at);
    if (!Number.isNaN(at.getTime()) && at.getTime() > Date.now()) {
      return "scheduled";
    }
  }
  return "released";
}

export function scriptsAllocationReleaseStatusLabel(status: ScriptsAllocationReleaseStatus): string {
  switch (status) {
    case "not_released":
      return "Not released";
    case "scheduled":
      return "Scheduled";
    case "released":
      return "Released";
  }
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
