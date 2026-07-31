import type { WorkforceKind } from "@/lib/workforce-kind";

function dutyPhrase(kind: WorkforceKind): string {
  if (kind === "data-entry-clerk") {
    return "data entry of the examination papers";
  }
  return "checking of the examination papers";
}

/**
 * Formal CTVET acceptance statement shown before confirming availability.
 * Matches the paper acceptance wording used for script checkers / data entry clerks.
 */
export function buildWorkforceAcceptanceStatement(
  profile: {
    name: string;
    role_label: string;
    examination_label: string;
  },
  kind: WorkforceKind,
): string {
  const role = profile.role_label.trim().toUpperCase();
  const examLabel = profile.examination_label.trim();
  const examClause = /examinations?$/i.test(examLabel) ? examLabel : `${examLabel} Examinations`;

  return (
    `I, ${profile.name}, accept my appointment as a ${role} for the ${examClause}.\n\n` +
    `I will follow strictly all the instructions governing the ${dutyPhrase(kind)} as indicated in my appointment letter.\n\n` +
    `Thank you.`
  );
}
