import { INVITATIONS_EXAM_META_CLASS } from "@/components/examiner-invitations/constants";

export function InvitationsExamMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className={INVITATIONS_EXAM_META_CLASS}>
      <span className="shrink-0 font-semibold uppercase tracking-wide text-primary/80">Exam</span>
      <span className="min-w-0 truncate font-medium text-foreground">{children}</span>
    </span>
  );
}
