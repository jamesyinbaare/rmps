import type { CohortCoverage, CohortListItem, ClaimedRule } from "@/components/cohorts/types";

export function computeCoverage(
  examiners: { id: string }[],
  cohorts: CohortListItem[],
): CohortCoverage {
  const assigned = new Set<string>();
  for (const c of cohorts) {
    if (c.is_default) continue;
    for (const id of c.examiner_ids) {
      assigned.add(id);
    }
  }
  const unassignedIds = new Set(
    examiners.filter((e) => !assigned.has(e.id)).map((e) => e.id),
  );
  return {
    totalCount: examiners.length,
    assignedCount: assigned.size,
    unassignedCount: unassignedIds.size,
    unassignedIds,
  };
}

export function computeClaimedRegions(
  cohorts: CohortListItem[],
  excludeCohortId: string | null,
): Map<string, ClaimedRule> {
  const map = new Map<string, ClaimedRule>();
  for (const c of cohorts) {
    if (c.id === excludeCohortId) continue;
    for (const region of c.source_regions) {
      map.set(region, { cohortName: c.name });
    }
  }
  return map;
}

export function computeClaimedRoles(
  cohorts: CohortListItem[],
  excludeCohortId: string | null,
): Map<string, ClaimedRule> {
  const map = new Map<string, ClaimedRule>();
  for (const c of cohorts) {
    if (c.id === excludeCohortId) continue;
    for (const role of c.source_roles ?? []) {
      map.set(role, { cohortName: c.name });
    }
  }
  return map;
}

export function selectedMemberCount(membersDraft: Record<string, boolean>): number {
  return Object.values(membersDraft).filter(Boolean).length;
}
