export type ExaminerInvitationTab = "landing" | "profile";

export function parseExaminerInvitationTab(raw: string | null): ExaminerInvitationTab {
  if (raw === "profile") return "profile";
  return "landing";
}
