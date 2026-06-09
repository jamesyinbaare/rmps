import type { ExaminerTypeApi } from "@/lib/api";

export type CohortListItem = {
  id: string;
  name: string;
  examiner_ids: string[];
  source_regions: string[];
  source_roles?: string[];
  coordinationDate?: string | null;
  coordinationStartTime?: string | null;
  coordinationEndTime?: string | null;
  markingStartDate?: string | null;
  markingEndDate?: string | null;
  markedScriptSubmissionDeadline?: string | null;
};

export type MembershipExaminer = {
  id: string;
  name: string;
  region: string;
  examiner_type: ExaminerTypeApi;
};

export type MembershipTab = "regions" | "roles" | "people";

export type RuleOption = {
  value: string;
  label: string;
  count: number;
};

export type ClaimedRule = {
  cohortName: string;
};

export type CohortCoverage = {
  totalCount: number;
  assignedCount: number;
  unassignedCount: number;
  unassignedIds: Set<string>;
};

export type MembershipPayload = {
  source_regions: string[];
  source_roles: string[];
  examiner_ids: string[];
};
