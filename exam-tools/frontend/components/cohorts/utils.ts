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

export function selectedRuleValues(draft: Record<string, boolean>): string[] {
  return Object.entries(draft)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

export function computeMembersFromRules(
  regionsDraft: Record<string, boolean>,
  rolesDraft: Record<string, boolean>,
  examiners: { id: string; region: string; examiner_type: string }[],
): Set<string> {
  const selectedRegions = selectedRuleValues(regionsDraft);
  const selectedRoles = selectedRuleValues(rolesDraft);
  if (selectedRegions.length === 0 && selectedRoles.length === 0) {
    return new Set();
  }

  const regionSet = new Set(selectedRegions);
  const roleSet = new Set(selectedRoles);

  let regionMatched: Set<string> | null = null;
  if (selectedRegions.length > 0) {
    regionMatched = new Set(
      examiners.filter((ex) => regionSet.has(ex.region)).map((ex) => ex.id),
    );
  }

  let roleMatched: Set<string> | null = null;
  if (selectedRoles.length > 0) {
    roleMatched = new Set(
      examiners.filter((ex) => roleSet.has(ex.examiner_type)).map((ex) => ex.id),
    );
  }

  if (regionMatched !== null && roleMatched !== null) {
    return new Set([...regionMatched].filter((id) => roleMatched!.has(id)));
  }
  if (regionMatched !== null) {
    return regionMatched;
  }
  if (roleMatched !== null) {
    return roleMatched;
  }
  return new Set();
}

export function mergeRuleAndManualMembers(
  regionsDraft: Record<string, boolean>,
  rolesDraft: Record<string, boolean>,
  manualMembersDraft: Record<string, boolean>,
  examiners: { id: string; region: string; examiner_type: string }[],
): Record<string, boolean> {
  const ruleIds = computeMembersFromRules(regionsDraft, rolesDraft, examiners);
  const next: Record<string, boolean> = {};
  for (const ex of examiners) {
    next[ex.id] = ruleIds.has(ex.id) || Boolean(manualMembersDraft[ex.id]);
  }
  return next;
}

export function deriveManualMembersDraft(
  memberIds: string[],
  regionsDraft: Record<string, boolean>,
  rolesDraft: Record<string, boolean>,
  examiners: { id: string; region: string; examiner_type: string }[],
): Record<string, boolean> {
  const ruleIds = computeMembersFromRules(regionsDraft, rolesDraft, examiners);
  const manual: Record<string, boolean> = {};
  for (const id of memberIds) {
    if (!ruleIds.has(id)) {
      manual[id] = true;
    }
  }
  return manual;
}
