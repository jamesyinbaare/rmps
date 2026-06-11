import type { ExaminerRow } from "@/lib/api";

export type ExaminersTab = "roster" | "invitations" | "groups" | "cohorts";

export type RosterTableRow = ExaminerRow & {
  subjectLabel: string;
  groupLabel: string | null;
};

export type ExaminersSummaryCounts = {
  roster: number;
  invitationsPending: number;
  invitationsAccepted: number;
};
