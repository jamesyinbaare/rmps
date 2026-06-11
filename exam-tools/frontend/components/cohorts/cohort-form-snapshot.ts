import type { CohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";
import type { MembershipPayload } from "@/components/cohorts/types";

export type CohortFormSnapshot = {
  name: string;
  schedule: CohortScheduleDraft;
  membership: MembershipPayload;
};

function sortedStrings(values: string[]): string[] {
  return [...values].sort();
}

function membershipEqual(a: MembershipPayload, b: MembershipPayload): boolean {
  return (
    JSON.stringify(sortedStrings(a.source_regions)) ===
      JSON.stringify(sortedStrings(b.source_regions)) &&
    JSON.stringify(sortedStrings(a.source_roles)) === JSON.stringify(sortedStrings(b.source_roles)) &&
    JSON.stringify(sortedStrings(a.examiner_ids)) === JSON.stringify(sortedStrings(b.examiner_ids))
  );
}

export function cohortDetailsEqual(
  a: Pick<CohortFormSnapshot, "name" | "schedule">,
  b: Pick<CohortFormSnapshot, "name" | "schedule">,
): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    JSON.stringify(a.schedule) === JSON.stringify(b.schedule)
  );
}

export function cohortMembershipEqual(a: MembershipPayload, b: MembershipPayload): boolean {
  return membershipEqual(a, b);
}

export function cohortFormSnapshotsEqual(a: CohortFormSnapshot, b: CohortFormSnapshot): boolean {
  return (
    cohortDetailsEqual(a, b) && membershipEqual(a.membership, b.membership)
  );
}

export function buildCohortFormSnapshot(
  name: string,
  schedule: CohortScheduleDraft,
  membership: MembershipPayload,
): CohortFormSnapshot {
  return { name: name.trim(), schedule: { ...schedule }, membership };
}
