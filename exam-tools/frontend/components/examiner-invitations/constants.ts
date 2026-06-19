import type { VisibilityState } from "@tanstack/react-table";

import type { ExaminerInvitationStatusApi, ExaminerTypeApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const EXAMINER_TYPE_OPTIONS: { value: ExaminerTypeApi; label: string }[] = [
  { value: "chief_examiner", label: "Chief examiner" },
  { value: "assistant_chief_examiner", label: "Assistant chief examiner" },
  { value: "assistant_examiner", label: "Assistant examiner" },
  { value: "team_leader", label: "Team leader" },
];

export const EXAMINER_TYPE_LABELS: Record<ExaminerTypeApi, string> = {
  chief_examiner: "Chief examiner",
  assistant_chief_examiner: "Assistant chief examiner",
  assistant_examiner: "Assistant examiner",
  team_leader: "Team leader",
};

export const EXAMINER_TYPE_ABBREVIATIONS: Record<ExaminerTypeApi, string> = {
  chief_examiner: "CE",
  assistant_chief_examiner: "ACE",
  assistant_examiner: "AE",
  team_leader: "TL",
};

export const STATUS_LABELS: Record<ExaminerInvitationStatusApi, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  quota_waitlisted: "Quota waitlist",
};

export const STATUS_FILTER_OPTIONS: { value: ExaminerInvitationStatusApi | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: STATUS_LABELS.pending },
  { value: "accepted", label: STATUS_LABELS.accepted },
  { value: "declined", label: STATUS_LABELS.declined },
  { value: "expired", label: STATUS_LABELS.expired },
  { value: "quota_waitlisted", label: STATUS_LABELS.quota_waitlisted },
];

export const SMS_PLACEHOLDER_TOKENS = [
  "{name}",
  "{link}",
  "{subject}",
  "{exam}",
  "{role}",
  "{region}",
  "{response_deadline}",
  "{coordination_date}",
] as const;

export const COLUMN_TOGGLE_OPTIONS = [
  { id: "name", label: "Name", defaultVisible: true },
  { id: "phone_number", label: "Phone", defaultVisible: false },
  { id: "subject", label: "Subject", defaultVisible: true },
  { id: "subject_type", label: "Subject type", defaultVisible: true },
  { id: "examiner_type", label: "Role", defaultVisible: true },
  { id: "region", label: "Region", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "response_deadline", label: "Respond by", defaultVisible: true },
  { id: "coordination", label: "Coordination", defaultVisible: false },
  { id: "sms", label: "SMS", defaultVisible: true },
] as const;

export const DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  COLUMN_TOGGLE_OPTIONS.map((c) => [c.id, c.defaultVisible]),
);

export const PAGE_SIZE_PRESETS = [50, 100, 200, 500] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_CUSTOM_PAGE_SIZE = 5000;

export const INPUT_FOCUS_RING =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export const INVITATIONS_PANEL_CLASS = cn(
  "relative overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-sm",
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary/65 before:content-['']",
  "dark:border-border dark:before:bg-primary/45",
);

export const INVITATIONS_COMMAND_BAR_CLASS = cn(
  "sticky top-0 z-10 flex shrink-0 flex-col gap-2 border-b border-primary/10 bg-primary/[0.045] px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3",
  "dark:border-border dark:bg-muted/20",
);

export const INVITATIONS_TOOLBAR_CLASS = INVITATIONS_COMMAND_BAR_CLASS;

export const INVITATIONS_EXAM_META_CLASS = cn(
  "inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-xs",
  "dark:border-border dark:bg-muted/30",
);

export const INVITATIONS_FOOTER_NOTE_CLASS = cn(
  "flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.04] px-3.5 py-3 text-xs leading-relaxed text-muted-foreground shadow-sm",
  "dark:border-border/70 dark:bg-card",
);
