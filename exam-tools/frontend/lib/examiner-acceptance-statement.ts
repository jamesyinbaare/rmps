import type { ExaminerInvitationPublic, ExaminerTypeApi } from "@/lib/api";

/** Formal role titles as used on the CTVET acceptance form (title case, role-specific). */
export const EXAMINER_ACCEPTANCE_ROLE_DESIGNATION: Record<ExaminerTypeApi, string> = {
  chief_examiner: "Chief Examiner",
  assistant_chief_examiner: "Assistant Chief Examiner",
  assistant_examiner: "Assistant Examiner",
  team_leader: "Team Leader",
};

function resolveAcceptanceRoleDesignation(
  examinerType: string,
  examinerTypeLabel: string,
): string {
  if (examinerType in EXAMINER_ACCEPTANCE_ROLE_DESIGNATION) {
    return EXAMINER_ACCEPTANCE_ROLE_DESIGNATION[examinerType as ExaminerTypeApi];
  }
  return examinerTypeLabel;
}

export function buildExaminerAcceptanceStatement(
  invitation: Pick<
    ExaminerInvitationPublic,
    "invitee_name" | "examiner_type" | "examiner_type_label" | "subject_name" | "examination_name"
  >,
): string {
  const role = resolveAcceptanceRoleDesignation(invitation.examiner_type, invitation.examiner_type_label);

  return (
    `I, ${invitation.invitee_name}, accept my appointment as the ${role} for ${invitation.subject_name} ` +
    `with special responsibility for the marking/vetting of scripts for the Core subjects of the ` +
    `${invitation.examination_name} Examinations. I will follow strictly all the instructions governing ` +
    `the marking of the examination papers as indicated in my appointment letter.`
  );
}
