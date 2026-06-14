import type { ExaminerInvitationStatusApi } from "@/lib/api";
import { STATUS_LABELS } from "@/components/examiner-invitations/constants";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ExaminerInvitationStatusApi, string> = {
  pending:
    "border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  accepted:
    "border-emerald-300/60 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
  declined:
    "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
  expired: "border-border bg-muted/60 text-muted-foreground",
  quota_waitlisted:
    "border-orange-300/60 bg-orange-50 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100",
};

type Props = {
  status: ExaminerInvitationStatusApi;
  className?: string;
};

export function InvitationStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_TONE[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
