import type { ExaminerRow } from "@/lib/api";

export type ExaminersTab =
  | "roster"
  | "invitations"
  | "groups"
  | "cohorts"
  | "quotas"
  | "appointment-letters";

export type RosterTableRow = ExaminerRow & {
  subjectLabel: string;
  groupLabel: string | null;
};

export type ExaminersSummaryCounts = {
  roster: number;
  invitationsPending: number;
  invitationsAccepted: number;
};
