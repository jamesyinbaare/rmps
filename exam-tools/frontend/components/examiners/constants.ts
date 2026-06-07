import type { VisibilityState } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

export const EXAMINERS_PANEL_CLASS = cn(
  "relative overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-sm",
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary/65 before:content-['']",
  "dark:border-border dark:before:bg-primary/45",
);

export const EXAMINERS_COMMAND_BAR_CLASS = cn(
  "flex shrink-0 flex-col gap-3 border-b border-primary/10 bg-primary/[0.045] px-4 py-3.5 sm:px-5 sm:py-4",
  "dark:border-border dark:bg-muted/20",
);

export const EXAMINERS_EXAM_META_CLASS =
  "inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary";

export const ROSTER_COLUMN_TOGGLE_OPTIONS = [
  { id: "name", label: "Name", defaultVisible: true },
  { id: "phone_number", label: "Phone", defaultVisible: true },
  { id: "subject", label: "Subject", defaultVisible: true },
  { id: "examiner_type", label: "Role", defaultVisible: true },
  { id: "region", label: "Region", defaultVisible: true },
  { id: "group", label: "Group", defaultVisible: false },
] as const;

export const ROSTER_DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  ROSTER_COLUMN_TOGGLE_OPTIONS.map((c) => [c.id, c.defaultVisible]),
);

export const PAGE_SIZE_PRESETS = [50, 100, 200, 500] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_CUSTOM_PAGE_SIZE = 5000;

export const INPUT_FOCUS_RING =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export const EXAMINERS_TABS = [
  { key: "roster" as const, label: "Roster" },
  { key: "invitations" as const, label: "Invitations" },
  { key: "groups" as const, label: "Marking groups" },
];
