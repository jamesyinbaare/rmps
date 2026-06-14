"use client";

import type { ExaminerInvitationPublic } from "@/lib/api";
import { buildExaminerAcceptanceStatement } from "@/lib/examiner-acceptance-statement";

type Props = {
  invitation: Pick<
    ExaminerInvitationPublic,
    "invitee_name" | "examiner_type" | "examiner_type_label" | "subject_name" | "examination_name"
  >;
  className?: string;
  /** Shown above the statement when the invitee must read it before confirming. */
  heading?: string;
};

export function ExaminerAcceptanceStatement({ invitation, className, heading }: Props) {
  const statement = buildExaminerAcceptanceStatement(invitation);

  return (
    <section className={className} aria-label="Acceptance statement">
      {heading ? (
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      ) : null}
      <p
        className={
          heading
            ? "mt-2 text-sm leading-relaxed text-foreground"
            : "text-sm leading-relaxed text-foreground"
        }
      >
        {statement}
      </p>
    </section>
  );
}
