import type { VisibilityState } from "@tanstack/react-table";

import {
  officialAccountsPageLayoutClass,
  officialAccountsPanelClass,
  officialAccountsPanelFillClass,
  officialAccountsTabPanelClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

export const EXAMINERS_PAGE_LAYOUT_CLASS = officialAccountsPageLayoutClass;

/** Subject-officer: content height drives scroll on dashboard main (no flex fill trap). */
export const EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS = "flex flex-col";

export const EXAMINERS_PANEL_FILL_CLASS = cn(
  officialAccountsPanelFillClass,
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary/65 before:content-['']",
  "dark:before:bg-primary/45",
);

export const EXAMINERS_TAB_PANEL_CLASS = officialAccountsTabPanelClass;

/** Subject-officer embedded shell: grows with content; page scrolls (no inner table y-scroll). */
export const EXAMINERS_PANEL_SCROLL_CLASS = cn(officialAccountsPanelClass, "flex flex-col");

export const EXAMINERS_TAB_PANEL_SCROLL_CLASS = cn(
  "official-accounts-tab-panel flex flex-col",
);

/** Horizontal scroll only — vertical scroll is the page/shell. */
export const EXAMINERS_TABLE_SCROLL_CONTAINER_CLASS = cn(
  "scrollbar-hide overflow-x-auto",
  "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
  "[&_th]:bg-card [&_th]:shadow-[0_1px_0_0_hsl(var(--border))]",
);

/** Admin fill layout: table body scrolls inside the panel. */
export const EXAMINERS_TABLE_INNER_SCROLL_CLASS = cn(
  officialAccountsTableScrollClass,
  "overflow-x-auto",
  "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
  "[&_th]:bg-card [&_th]:shadow-[0_1px_0_0_hsl(var(--border))]",
);

export const EXAMINERS_PANEL_CLASS = cn(
  "relative overflow-x-hidden overflow-y-visible rounded-2xl border border-primary/15 bg-card shadow-sm",
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary/65 before:content-['']",
  "dark:border-border dark:before:bg-primary/45",
);

export const EXAMINERS_COMMAND_BAR_CLASS = cn(
  "sticky top-0 z-10 flex shrink-0 flex-col gap-2 border-b border-primary/10 bg-primary/[0.045] px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3",
  "dark:border-border dark:bg-muted/20",
);

/** Fixed toolbar inside a flex panel — no sticky (avoids nested scroll with table header). */
export const EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS = cn(
  "flex shrink-0 flex-col gap-2 border-b border-border bg-muted/20 px-3 py-2.5 sm:px-4 sm:py-3",
);

/** Subject-officer mobile: single horizontal gutter, lighter command bar padding. */
export const SO_MOBILE_MAIN_CLASS = "max-md:px-0 max-md:py-3 sm:px-6";
export const SO_MOBILE_CONTENT_GUTTER = "max-md:px-3";
export const SO_MOBILE_COMMAND_BAR = "max-md:px-3 max-md:py-2.5";
export const SO_MOBILE_CONTENT_PADDING = "max-md:px-3 max-md:py-3 md:p-3";
export const SO_MOBILE_PANEL_BLEED = "max-md:rounded-none max-md:border-x-0";
export const SO_MOBILE_MASTER_DETAIL_CLASS = "max-md:rounded-none max-md:border-x-0";

/** Page wrapper for master-detail SO routes — fills main column below header. */
export const SO_MASTER_DETAIL_PAGE_CLASS = "flex min-h-0 w-full flex-1 flex-col";

/** Desktop: stretch to viewport; list scrolls inside left pane when long. Mobile: content height. */
export const SO_MASTER_DETAIL_GRID_CLASS = cn(
  "grid min-h-0 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm",
  SO_MOBILE_MASTER_DETAIL_CLASS,
  "max-md:overflow-visible",
  "lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(260px,300px)_1fr]",
);

export const SO_MASTER_DETAIL_MASTER_CLASS =
  "hidden min-h-0 flex-col overflow-hidden border-b border-border lg:flex lg:h-full lg:min-h-0 lg:border-b-0 lg:border-r";

export const SO_MASTER_DETAIL_DETAIL_CLASS = cn(
  "flex min-w-0 flex-col max-md:overflow-visible lg:min-h-0 lg:h-full lg:overflow-hidden",
);

export const EXAMINERS_EXAM_META_CLASS =
  "inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary";

export const ROSTER_COLUMN_TOGGLE_OPTIONS = [
  { id: "reference_code", label: "Code", defaultVisible: true },
  { id: "name", label: "Name", defaultVisible: true },
  { id: "phone_number", label: "Phone", defaultVisible: true },
  { id: "subject", label: "Subject", defaultVisible: true },
  { id: "examiner_type", label: "Role", defaultVisible: true },
  { id: "region", label: "Region", defaultVisible: true },
  { id: "town", label: "Town", defaultVisible: false },
  { id: "ghanapost_gps_address", label: "GhanaPost GPS", defaultVisible: false },
  { id: "gender", label: "Gender", defaultVisible: false },
  { id: "source", label: "Source", defaultVisible: false },
  { id: "group", label: "Group", defaultVisible: false },
] as const;

export const ROSTER_DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  ROSTER_COLUMN_TOGGLE_OPTIONS.map((c) => [c.id, c.defaultVisible]),
);

export const ROSTER_SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "invitation", label: "Invitation" },
] as const;

export const ROSTER_SOURCE_LABELS: Record<(typeof ROSTER_SOURCE_OPTIONS)[number]["value"], string> = {
  manual: "Manual",
  invitation: "Invitation",
};

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
