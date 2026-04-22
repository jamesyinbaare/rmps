/** Shared Tailwind classes for CTVET-themed forms */
export const formInputClass =
  "mt-1.5 block w-full min-h-11 rounded-lg border border-input-border bg-input px-3 text-base text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export const formLabelClass = "block text-sm font-medium text-foreground";

export const primaryButtonClass =
  "mt-2 min-h-11 w-full rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60";

/** Action row for timetable PDF / preview (admin examination timetable + staff panel). */
export const timetableActionRowClass = "mt-4 flex flex-wrap items-center gap-3";

/** Single visual style for all timetable toolbar actions. */
export const timetableActionButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
