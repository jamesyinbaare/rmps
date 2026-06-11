import type { ExaminerInvitationStatusApi } from "@/lib/api";
import type { ScriptControlSubjectTypeFilter } from "@/lib/script-control-subjects";

export type ResendUiState = "sending" | "success" | "error";

export type InvitationStatusFilter = ExaminerInvitationStatusApi | "all";

export type InvitationFiltersState = {
  subjectTypeFilter: ScriptControlSubjectTypeFilter;
  subjectFilter: string[];
  roleFilter: string[];
  regionFilter: string[];
  statusFilter: InvitationStatusFilter;
  searchQuery: string;
};

export type InvitationStatusCounts = {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
};
