export type WorkforceKind = "script-checker" | "data-entry-clerk";

export type WorkforceKindConfig = {
  kind: WorkforceKind;
  label: string;
  labelPlural: string;
  publicInvitePath: string;
  publicPathPrefix: string;
  adminRosterPath: string;
  adminAssignmentsPath: string;
  adminRatesPath: string;
  adminPayoutsPath: string;
  subjectOfficerAssignmentsPath: string;
  assignmentApiSegment: string;
  rosterApiSegment: string;
  ratesApiSegment: string;
  payoutsApiSegment: string;
};

export const SCRIPT_CHECKER_CONFIG: WorkforceKindConfig = {
  kind: "script-checker",
  label: "Script checker",
  labelPlural: "Script checkers",
  publicInvitePath: "/sc",
  publicPathPrefix: "/public/script-checkers",
  adminRosterPath: "/dashboard/admin/script-checkers",
  adminAssignmentsPath: "/dashboard/admin/script-checker-assignments",
  adminRatesPath: "/dashboard/admin/script-checker-rates",
  adminPayoutsPath: "/dashboard/admin/script-checker-payouts",
  subjectOfficerAssignmentsPath: "/dashboard/subject-officer/script-checker-assignments",
  assignmentApiSegment: "script-checker-assignments",
  rosterApiSegment: "script-checkers",
  ratesApiSegment: "script-checker-rates",
  payoutsApiSegment: "script-checker-payouts",
};

export const DATA_ENTRY_CLERK_CONFIG: WorkforceKindConfig = {
  kind: "data-entry-clerk",
  label: "Data entry clerk",
  labelPlural: "Data entry clerks",
  publicInvitePath: "/de",
  publicPathPrefix: "/public/data-entry-clerks",
  adminRosterPath: "/dashboard/admin/data-entry-clerks",
  adminAssignmentsPath: "/dashboard/admin/data-entry-clerk-assignments",
  adminRatesPath: "/dashboard/admin/data-entry-clerk-rates",
  adminPayoutsPath: "/dashboard/admin/data-entry-clerk-payouts",
  subjectOfficerAssignmentsPath: "/dashboard/subject-officer/data-entry-clerk-assignments",
  assignmentApiSegment: "data-entry-clerk-assignments",
  rosterApiSegment: "data-entry-clerks",
  ratesApiSegment: "data-entry-clerk-rates",
  payoutsApiSegment: "data-entry-clerk-payouts",
};

export function workforceConfig(kind: WorkforceKind): WorkforceKindConfig {
  return kind === "script-checker" ? SCRIPT_CHECKER_CONFIG : DATA_ENTRY_CLERK_CONFIG;
}
