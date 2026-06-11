"use client";

import { createContext, forwardRef, useContext, useMemo, type ReactNode } from "react";
import type { DayButtonProps } from "react-day-picker";

import { formatDateOnly } from "@/components/examiner-invitations/utils";
import { formatTimeLabel } from "@/components/cohorts/cohort-schedule-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MARKING_EVENT_KIND_LABELS,
  toDateInput,
  type MarkingCalendarEvent,
  type MarkingEventKind,
} from "@/lib/subject-officer-marking-events";
import { cn } from "@/lib/utils";

const KIND_PRIORITY: MarkingEventKind[] = [
  "coordination",
  "submission_deadline",
  "marking_start",
  "marking_end",
];

const EVENT_KIND_STYLE: Record<
  MarkingEventKind,
  { bar: string; label: string; cell: string; cellHover: string }
> = {
  coordination: {
    bar: "bg-violet-500",
    label: "text-violet-700 dark:text-violet-300",
    cell: "bg-violet-500/12 border-violet-500/25",
    cellHover: "hover:bg-violet-500/20 hover:border-violet-500/40",
  },
  marking_start: {
    bar: "bg-primary",
    label: "text-primary",
    cell: "bg-primary/10 border-primary/20",
    cellHover: "hover:bg-primary/15 hover:border-primary/35",
  },
  marking_end: {
    bar: "bg-primary/70",
    label: "text-primary/80",
    cell: "bg-primary/10 border-primary/15",
    cellHover: "hover:bg-primary/12 hover:border-primary/30",
  },
  submission_deadline: {
    bar: "bg-amber-500",
    label: "text-amber-700 dark:text-amber-300",
    cell: "bg-amber-500/12 border-amber-500/25",
    cellHover: "hover:bg-amber-500/20 hover:border-amber-500/40",
  },
};

type MarkingCalendarEventsContextValue = {
  eventsByDate: Map<string, MarkingCalendarEvent[]>;
};

const MarkingCalendarEventsContext = createContext<MarkingCalendarEventsContextValue>({
  eventsByDate: new Map(),
});

export function MarkingCalendarEventsProvider({
  events,
  children,
}: {
  events: MarkingCalendarEvent[];
  children: ReactNode;
}) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, MarkingCalendarEvent[]>();
    for (const event of events) {
      const bucket = map.get(event.date) ?? [];
      bucket.push(event);
      map.set(event.date, bucket);
    }
    return map;
  }, [events]);

  return (
    <MarkingCalendarEventsContext.Provider value={{ eventsByDate }}>
      {children}
    </MarkingCalendarEventsContext.Provider>
  );
}

function sortKinds(kinds: MarkingEventKind[]): MarkingEventKind[] {
  return KIND_PRIORITY.filter((kind) => kinds.includes(kind));
}

function sortEvents(events: MarkingCalendarEvent[]): MarkingCalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind) ||
      a.cohortName.localeCompare(b.cohortName, undefined, { sensitivity: "base" }),
  );
}

function dominantKind(events: MarkingCalendarEvent[]): MarkingEventKind | null {
  if (events.length === 0) return null;
  const kinds = new Set(events.map((event) => event.kind));
  for (const kind of KIND_PRIORITY) {
    if (kinds.has(kind)) return kind;
  }
  return events[0]!.kind;
}

function formatEventWhen(event: MarkingCalendarEvent): string | null {
  if (event.kind === "coordination" && (event.startTime || event.endTime)) {
    const start = formatTimeLabel(event.startTime);
    const end = formatTimeLabel(event.endTime);
    if (start !== "—" && end !== "—") return `${start} – ${end}`;
    if (start !== "—") return start;
    if (end !== "—") return end;
  }
  return null;
}

function MarkingDayTooltipContent({
  dateKey,
  events,
  markingWindowOnly,
}: {
  dateKey: string;
  events: MarkingCalendarEvent[];
  markingWindowOnly?: boolean;
}) {
  const dateLabel = formatDateOnly(`${dateKey}T12:00:00`);

  return (
    <div className="max-w-[16rem] space-y-2 p-3">
      <p className="text-xs font-semibold text-foreground">{dateLabel}</p>
      {markingWindowOnly ? (
        <p className="text-xs leading-relaxed text-muted-foreground">Active marking window</p>
      ) : (
        <ul className="space-y-2.5">
          {sortEvents(events).map((event) => {
            const style = EVENT_KIND_STYLE[event.kind];
            const when = formatEventWhen(event);
            return (
              <li key={event.id} className="flex gap-2.5">
                <span
                  className={cn("mt-1 size-2 shrink-0 rounded-full", style.bar)}
                  aria-hidden
                />
                <div className="min-w-0 space-y-0.5">
                  <p className={cn("text-[10px] font-semibold uppercase tracking-wide", style.label)}>
                    {MARKING_EVENT_KIND_LABELS[event.kind]}
                  </p>
                  <p className="text-xs font-medium leading-snug text-foreground">{event.cohortName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{event.subjectLabel}</p>
                  {when ? (
                    <p className="text-[11px] tabular-nums text-muted-foreground">{when}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const MarkingCalendarDayButton = forwardRef<HTMLButtonElement, DayButtonProps>(
  function MarkingCalendarDayButton({ day, modifiers, className, ...props }, ref) {
    const { eventsByDate } = useContext(MarkingCalendarEventsContext);
    const dateKey = toDateInput(day.date);
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    const hasEvents = dayEvents.length > 0;
    const inMarkingRange = Boolean(modifiers.inMarkingRange);
    const kindsOnDay = useMemo(
      () => sortKinds([...new Set(dayEvents.map((event) => event.kind))]),
      [dayEvents],
    );
    const primaryKind = dominantKind(dayEvents);
    const primaryStyle = primaryKind ? EVENT_KIND_STYLE[primaryKind] : null;

    const ariaLabel = hasEvents
      ? `${dateKey}: ${sortEvents(dayEvents)
          .map((event) => `${MARKING_EVENT_KIND_LABELS[event.kind]}, ${event.cohortName}`)
          .join("; ")}`
      : inMarkingRange
        ? `${dateKey}: marking window`
        : dateKey;

    const dayButton = (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "flex size-full min-h-9 min-w-0 flex-col justify-between rounded-md border p-1 text-left transition-all duration-150 sm:min-h-10 lg:min-h-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          modifiers.outside && "opacity-40",
          modifiers.disabled && "pointer-events-none opacity-30",
          modifiers.selected
            ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary"
            : cn(
                "border-transparent text-foreground",
                hasEvents && primaryStyle
                  ? cn(primaryStyle.cell, primaryStyle.cellHover, "hover:z-10 hover:shadow-sm")
                  : inMarkingRange
                    ? "bg-primary/5 hover:bg-primary/10 hover:border-primary/15"
                    : "hover:z-10 hover:border-border/60 hover:bg-muted/60",
                modifiers.today &&
                  !modifiers.selected &&
                  "font-semibold ring-2 ring-primary/40 ring-offset-1 ring-offset-background",
              ),
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "shrink-0 text-[0.625rem] font-medium tabular-nums leading-none sm:text-xs",
            modifiers.selected && "text-primary-foreground",
            modifiers.today && !modifiers.selected && "text-primary",
          )}
        >
          {day.date.getDate()}
        </span>

        {hasEvents ? (
          <span className="mt-0.5 flex w-full gap-0.5" aria-hidden>
            {kindsOnDay.slice(0, 4).map((kind) => (
              <span
                key={kind}
                className={cn(
                  "h-1 min-w-0 flex-1 rounded-full sm:h-1.5",
                  EVENT_KIND_STYLE[kind].bar,
                  modifiers.selected && "bg-primary-foreground/90",
                )}
              />
            ))}
          </span>
        ) : inMarkingRange ? (
          <span className="mt-0.5 block h-0.5 w-full rounded-full bg-primary/30 sm:h-1" aria-hidden />
        ) : (
          <span className="mt-0.5 block h-1 sm:h-1.5" aria-hidden />
        )}
      </button>
    );

    if (!hasEvents && !inMarkingRange) {
      return dayButton;
    }

    return (
      <Tooltip delayDuration={250}>
        <TooltipTrigger asChild>{dayButton}</TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={6}
          className="z-[300] border-border bg-card p-0 text-foreground shadow-lg"
        >
          <MarkingDayTooltipContent
            dateKey={dateKey}
            events={dayEvents}
            markingWindowOnly={!hasEvents && inMarkingRange}
          />
        </TooltipContent>
      </Tooltip>
    );
  },
);

MarkingCalendarDayButton.displayName = "MarkingCalendarDayButton";
