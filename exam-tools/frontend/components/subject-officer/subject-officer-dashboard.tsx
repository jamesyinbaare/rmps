"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  Users,
  X,
} from "lucide-react";
import { formatDateOnly } from "@/components/examiner-invitations/utils";
import { formatTimeLabel } from "@/components/cohorts/cohort-schedule-utils";
import {
  MarkingCalendarDayButton,
  MarkingCalendarEventsProvider,
} from "@/components/subject-officer/marking-calendar-day-button";
import { SubjectOfficerExamSelector } from "@/components/subject-officer/subject-officer-exam-bar";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSubjectOfficerDashboard } from "@/hooks/use-subject-officer-dashboard";
import type { SubjectOfficerMeExamAssignment } from "@/lib/api";
import { officialAccountsCommandBarRowClass } from "@/lib/official-accounts-zone";
import {
  calendarModifiers,
  calendarNavContext,
  clampCalendarMonth,
  eventsInNextDays,
  eventsOnDate,
  formatCalendarMonthLabel,
  groupEventsByDate,
  isSameCalendarMonth,
  MARKING_EVENT_KIND_LABELS,
  markingRangeDates,
  relativeDateLabel,
  toDateInput,
  upcomingEvents,
  type MarkingCalendarEvent,
  type MarkingEventKind,
} from "@/lib/subject-officer-marking-events";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

const panelHeightClass = "lg:h-[min(72vh,720px)]";
const calendarGridClass =
  "grid grid-cols-1 gap-4 lg:min-h-[420px] lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,380px)]";

/** Desktop shell CSS scales table rows; mobile uses full-width table layout. */
const MARKING_CALENDAR_CLASS_NAMES = {
  root: "w-full min-w-0 flex-1 flex-col lg:flex lg:min-h-0 lg:h-full",
  months: "min-h-0 flex-1 flex-col lg:flex",
  month: "relative min-h-0 w-full flex-1 flex-col lg:flex",
  month_grid: "w-full min-w-0 min-h-0 flex-1 table-fixed border-collapse",
  weekdays: "",
  weekday:
    "min-w-0 py-1 text-center text-[0.625rem] font-medium text-muted-foreground sm:text-xs",
  week: "",
  day: "relative h-10 min-h-9 min-w-0 p-0.5 align-middle sm:h-11 lg:h-auto lg:min-h-0 lg:p-1",
  month_caption: "relative flex h-8 w-full shrink-0 min-w-0 items-center justify-center px-10 lg:h-9",
  caption_label: "text-sm font-semibold lg:text-base",
} as const;

const EMPTY_SUBJECTS: SubjectOfficerMeExamAssignment["subjects"] = [];

const EVENT_KIND_STYLE: Record<
  MarkingEventKind,
  { dot: string; label: string; surface: string; border: string }
> = {
  coordination: {
    dot: "bg-violet-500",
    label: "text-violet-700 dark:text-violet-300",
    surface: "from-violet-500/[0.07]",
    border: "border-violet-500/20 hover:border-violet-500/35",
  },
  marking_start: {
    dot: "bg-primary",
    label: "text-primary",
    surface: "from-primary/[0.06]",
    border: "border-primary/20 hover:border-primary/35",
  },
  marking_end: {
    dot: "bg-primary/70",
    label: "text-primary/80",
    surface: "from-primary/[0.04]",
    border: "border-primary/15 hover:border-primary/30",
  },
  submission_deadline: {
    dot: "bg-amber-500",
    label: "text-amber-700 dark:text-amber-300",
    surface: "from-amber-500/[0.08]",
    border: "border-amber-500/25 hover:border-amber-500/40",
  },
};

type Props = {
  assignments: SubjectOfficerMeExamAssignment[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  assignmentsLoading?: boolean;
};

function formatEventWhen(event: MarkingCalendarEvent, includeDate = true): string {
  const dateLabel = formatDateOnly(`${event.date}T12:00:00`);
  if (event.kind === "coordination" && (event.startTime || event.endTime)) {
    const start = formatTimeLabel(event.startTime);
    const end = formatTimeLabel(event.endTime);
    const time =
      start !== "—" && end !== "—" ? `${start} – ${end}` : start !== "—" ? start : end !== "—" ? end : "";
    if (time) return includeDate ? `${dateLabel} · ${time}` : time;
  }
  return includeDate ? dateLabel : "";
}

function CalendarMonthNavigator({
  months,
  activeMonth,
  onMonthChange,
}: {
  months: Date[];
  activeMonth: Date;
  onMonthChange: (month: Date) => void;
}) {
  if (months.length <= 1) return null;

  const activeIndex = months.findIndex((month) => isSameCalendarMonth(month, activeMonth));
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const canPrev = resolvedIndex > 0;
  const canNext = resolvedIndex < months.length - 1;

  return (
    <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-x-2 border-b border-border bg-muted/10 px-2 py-2 sm:gap-x-3 sm:px-4 sm:py-2.5">
      <Button
        type="button"
        variant="outline"
        className="size-8 shrink-0 p-0"
        disabled={!canPrev}
        aria-label="Previous month"
        onClick={() => onMonthChange(months[resolvedIndex - 1]!)}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>

      <div className="flex min-w-0 flex-nowrap items-center justify-center gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {months.map((month) => {
          const active = isSameCalendarMonth(month, activeMonth);
          return (
            <button
              key={month.toISOString()}
              type="button"
              onClick={() => onMonthChange(month)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground ring-1 ring-border hover:text-foreground",
              )}
              aria-current={active ? "date" : undefined}
            >
              {formatCalendarMonthLabel(month)}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        className="size-8 shrink-0 p-0"
        disabled={!canNext}
        aria-label="Next month"
        onClick={() => onMonthChange(months[resolvedIndex + 1]!)}
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function CalendarLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-5 rounded-full bg-violet-500" aria-hidden />
        Coordination
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-5 rounded-full bg-primary" aria-hidden />
        Marking
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-5 rounded-full bg-amber-500" aria-hidden />
        Submission deadline
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1 w-5 rounded-full bg-primary/30" aria-hidden />
        Marking window
      </span>
    </div>
  );
}

function EmptyDashboardPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CalendarDays;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="min-h-[7.5rem] animate-pulse rounded-xl border border-border/60 bg-muted/30" />
      ))}
    </div>
  );
}

type KpiAccent = {
  card: string;
  iconWrap: string;
  hover: string;
  action: string;
};

const KPI_ACCENTS = {
  examiners: {
    card: "border-primary/20 bg-gradient-to-br from-primary/[0.07] to-card",
    iconWrap: "bg-primary/12 text-primary ring-1 ring-primary/15",
    hover: "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5",
    action: "text-primary",
  },
  pending: {
    card: "border-border/80 bg-card",
    iconWrap: "bg-muted text-muted-foreground",
    hover: "hover:border-amber-500/35 hover:shadow-md hover:shadow-amber-500/5",
    action: "text-amber-700 dark:text-amber-300",
  },
  pendingActive: {
    card: "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] to-card",
    iconWrap: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300",
    hover: "hover:border-amber-500/45 hover:shadow-md hover:shadow-amber-500/10",
    action: "text-amber-700 dark:text-amber-300",
  },
  accepted: {
    card: "border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-card",
    iconWrap: "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/15 dark:text-emerald-300",
    hover: "hover:border-emerald-500/35 hover:shadow-md hover:shadow-emerald-500/5",
    action: "text-emerald-700 dark:text-emerald-300",
  },
  events: {
    card: "border-border/80 bg-gradient-to-br from-muted/40 to-card",
    iconWrap: "bg-accent/15 text-accent ring-1 ring-accent/20",
    hover: "hover:border-accent/35 hover:shadow-md",
    action: "text-muted-foreground",
  },
} satisfies Record<string, KpiAccent>;

function DashboardSkeleton() {
  return (
    <div className={cn(calendarGridClass, panelHeightClass)}>
      <div className="animate-pulse rounded-xl border border-border bg-muted/30 p-6">
        <div className="h-full min-h-80 w-full rounded-lg bg-muted/60" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    </div>
  );
}

function UpcomingEventCard({
  event,
  compactDate = false,
}: {
  event: MarkingCalendarEvent;
  compactDate?: boolean;
}) {
  const style = EVENT_KIND_STYLE[event.kind];
  const whenLabel = formatEventWhen(event, !compactDate);

  return (
    <div
      className={cn(
        "rounded-lg border bg-gradient-to-br to-card p-3.5 shadow-sm transition-colors",
        style.surface,
        style.border,
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn("mt-1.5 size-2 shrink-0 rounded-full ring-2 ring-background", style.dot)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide", style.label)}>
              {MARKING_EVENT_KIND_LABELS[event.kind]}
            </p>
            {whenLabel ? (
              <span className="text-xs tabular-nums leading-relaxed text-muted-foreground sm:text-right">
                {whenLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{event.cohortName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.subjectLabel}</p>
        </div>
      </div>
    </div>
  );
}

function UpcomingDateGroup({
  date,
  events,
  compactDate = false,
}: {
  date: string;
  events: MarkingCalendarEvent[];
  compactDate?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="border-b border-border/60 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {relativeDateLabel(date)}
      </h3>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <UpcomingEventCard event={event} compactDate={compactDate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function KpiCard({
  href,
  onClick,
  icon,
  value,
  label,
  actionLabel,
  accent,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  value: number;
  label: string;
  actionLabel: string;
  accent: KpiAccent;
}) {
  const cardClass = cn(
    "group flex min-h-[7.5rem] flex-col rounded-xl border p-4 shadow-sm transition-all",
    accent.card,
    accent.hover,
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase leading-snug tracking-wider text-muted-foreground">
          {label}
        </p>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            accent.iconWrap,
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      <span className={cn("mt-auto pt-3 text-xs font-medium", accent.action)}>
        <span className="group-hover:underline">{actionLabel}</span>
        <span
          className="ml-0.5 inline-block transition-transform group-hover:translate-x-0.5"
          aria-hidden
        >
          →
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" className={cn(cardClass, "w-full text-left")} onClick={onClick}>
      {body}
    </button>
  );
}

export function SubjectOfficerDashboard({
  assignments,
  examId,
  onExamChange,
  assignmentsLoading = false,
}: Props) {
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [showAllUpcoming, setShowAllUpcoming] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const calendarMonthSeededForExamRef = useRef<number | null>(null);

  const selectedExam = useMemo(
    () => assignments.find((a) => a.examination_id === examId) ?? null,
    [assignments, examId],
  );
  const subjects = selectedExam?.subjects ?? EMPTY_SUBJECTS;

  const { groups, events, stats, loading, error, refetch } = useSubjectOfficerDashboard({
    examId,
    subjects,
  });

  const markingRangeDateSet = useMemo(() => markingRangeDates(groups), [groups]);
  const modifiers = useMemo(
    () => calendarModifiers(events, markingRangeDateSet),
    [events, markingRangeDateSet],
  );

  const upcomingList = useMemo(() => {
    if (!showAllUpcoming && selectedDay) {
      return eventsOnDate(events, toDateInput(selectedDay));
    }
    return upcomingEvents(events, new Date(), 10);
  }, [events, selectedDay, showAllUpcoming]);

  const groupedUpcoming = useMemo(() => groupEventsByDate(upcomingList), [upcomingList]);

  const eventsNext7Days = useMemo(() => eventsInNextDays(events, 7), [events]);
  const nextEvent = useMemo(() => upcomingEvents(events, new Date(), 1)[0] ?? null, [events]);

  const calendarNav = useMemo(
    () => calendarNavContext(groups, events),
    [groups, events],
  );
  const { startMonth: calendarStartMonth, endMonth: calendarEndMonth, navigableMonths } =
    calendarNav;
  const showMonthBar = navigableMonths.length > 1;

  const markingCalendarClassNames = useMemo(
    () => ({
      ...MARKING_CALENDAR_CLASS_NAMES,
      ...(showMonthBar ? { month_caption: "hidden", nav: "hidden" } : {}),
    }),
    [showMonthBar],
  );

  useEffect(() => {
    calendarMonthSeededForExamRef.current = null;
    setCalendarMonth(new Date());
    setSelectedDay(undefined);
    setShowAllUpcoming(true);
  }, [examId]);

  useEffect(() => {
    if (examId == null || loading) return;
    if (calendarMonthSeededForExamRef.current === examId) return;

    calendarMonthSeededForExamRef.current = examId;
    const anchor =
      upcomingEvents(events, new Date(), 1)[0] ??
      (events.length > 0 ? events[events.length - 1] : null);
    if (anchor) {
      setCalendarMonth(
        clampCalendarMonth(
          new Date(`${anchor.date}T12:00:00`),
          calendarStartMonth,
          calendarEndMonth,
        ),
      );
    }
  }, [calendarEndMonth, calendarStartMonth, examId, events, loading]);

  function handleDaySelect(day: Date | undefined) {
    if (!day) {
      setSelectedDay(undefined);
      setShowAllUpcoming(true);
      return;
    }
    if (selectedDay && toDateInput(selectedDay) === toDateInput(day)) {
      setSelectedDay(undefined);
      setShowAllUpcoming(true);
      return;
    }
    setSelectedDay(day);
    setShowAllUpcoming(false);
  }

  function goToToday() {
    const today = new Date();
    setCalendarMonth(clampCalendarMonth(today, calendarStartMonth, calendarEndMonth));
    setSelectedDay(today);
    setShowAllUpcoming(false);
  }

  function handleCalendarMonthChange(month: Date) {
    setCalendarMonth(clampCalendarMonth(month, calendarStartMonth, calendarEndMonth));
  }

  function clearDayFilter() {
    setSelectedDay(undefined);
    setShowAllUpcoming(true);
  }

  const commandBar = (
    <div className={officialAccountsCommandBarRowClass}>
      <SubjectOfficerExamSelector
        assignments={assignments}
        examId={examId}
        onExamChange={onExamChange}
        loading={assignmentsLoading}
        compact
      />
      {subjects.length > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Subjects</span>
          {subjects.map((s) => (
            <Badge
              key={s.subject_id}
              variant="outline"
              className="border-border/80 bg-background/80 font-normal"
            >
              {subjectDisplayLabel(s)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );

  const examinersHref =
    examId != null
      ? `/dashboard/subject-officer/examiners?exam=${examId}&tab=roster`
      : "/dashboard/subject-officer/examiners";
  const invitationsHref =
    examId != null
      ? `/dashboard/subject-officer/examiners?exam=${examId}&tab=invitations`
      : "/dashboard/subject-officer/examiners";
  const cohortsHref =
    examId != null
      ? `/dashboard/subject-officer/examiners?exam=${examId}&tab=groups`
      : "/dashboard/subject-officer/examiners";

  const selectedDayLabel =
    selectedDay != null
      ? formatDateOnly(`${toDateInput(selectedDay)}T12:00:00`)
      : null;

  return (
    <div className="min-w-0 space-y-4">
      <SubjectOfficerPanelShell commandBar={commandBar}>
        {assignments.length === 0 ? (
          <EmptyDashboardPanel
            icon={Users}
            title="No assignments yet"
            description="No examination assignments were found for your account. Contact an administrator if this looks wrong."
          />
        ) : examId == null ? (
          <EmptyDashboardPanel
            icon={CalendarDays}
            title="Select an examination"
            description="Choose an examination above to view marking schedules, roster stats, and invitation status for your subjects."
          />
        ) : error ? (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <p>{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            <KpiSkeleton />
            <DashboardSkeleton />
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            {selectedExam ? (
              <div className="rounded-lg bg-muted/15 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-foreground">{selectedExam.examination_name}</span>
                  <Badge variant="secondary" className="font-normal">
                    {subjects.length} subject{subjects.length === 1 ? "" : "s"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {stats.cohortsWithSchedule} of {groups.length} cohort
                    {groups.length === 1 ? "" : "s"} scheduled
                  </span>
                </div>
                {nextEvent ? (
                  <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                    Next: {MARKING_EVENT_KIND_LABELS[nextEvent.kind]} · {nextEvent.cohortName} ·{" "}
                    {formatEventWhen(nextEvent)}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                href={examinersHref}
                icon={<Users className="size-4" aria-hidden />}
                value={stats.examinerCount}
                label="Examiners"
                actionLabel="View roster"
                accent={KPI_ACCENTS.examiners}
              />
              <KpiCard
                href={invitationsHref}
                icon={<Mail className="size-4" aria-hidden />}
                value={stats.invitationsPending}
                label="Pending invitations"
                actionLabel="Review invitations"
                accent={
                  stats.invitationsPending > 0 ? KPI_ACCENTS.pendingActive : KPI_ACCENTS.pending
                }
              />
              <KpiCard
                href={invitationsHref}
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                value={stats.invitationsAccepted}
                label="Accepted invitations"
                actionLabel="View invitations"
                accent={KPI_ACCENTS.accepted}
              />
              <KpiCard
                icon={<CalendarDays className="size-4" aria-hidden />}
                value={eventsNext7Days.length}
                label="Events next 7 days"
                actionLabel="View calendar"
                accent={KPI_ACCENTS.events}
                onClick={() => {
                  clearDayFilter();
                  document.getElementById("so-marking-calendar")?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>

            <div id="so-marking-calendar" className={cn(calendarGridClass, panelHeightClass, "min-w-0 lg:items-stretch")}>
              <div className="so-marking-calendar-shell flex min-w-0 flex-col overflow-visible rounded-xl border border-border bg-card shadow-sm lg:h-full lg:min-h-0">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 lg:py-2.5">
                  <h2 className="text-sm font-semibold text-foreground">Marking calendar</h2>
                  <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={goToToday}>
                    Today
                  </Button>
                </div>
                <CalendarMonthNavigator
                  months={navigableMonths}
                  activeMonth={calendarMonth}
                  onMonthChange={handleCalendarMonthChange}
                />
                <div className="so-marking-calendar-body min-w-0 p-2 sm:p-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:p-3">
                  <TooltipProvider delayDuration={200} skipDelayDuration={100}>
                    <MarkingCalendarEventsProvider events={events}>
                      <Calendar
                        size="large"
                        mode="single"
                        month={calendarMonth}
                        onMonthChange={handleCalendarMonthChange}
                        startMonth={calendarStartMonth}
                        endMonth={calendarEndMonth}
                        selected={selectedDay}
                        onSelect={handleDaySelect}
                        modifiers={modifiers}
                        hideNavigation={showMonthBar}
                        formatters={{
                          formatWeekdayName: (date) =>
                            date.toLocaleDateString(undefined, { weekday: "narrow" }),
                        }}
                        classNames={markingCalendarClassNames}
                        components={{ DayButton: MarkingCalendarDayButton }}
                        className="flex h-full min-w-0 flex-1 flex-col bg-background p-0"
                      />
                    </MarkingCalendarEventsProvider>
                  </TooltipProvider>
                </div>
                <div className="shrink-0 border-t border-border bg-muted/10 px-4 py-3 lg:py-2">
                  <CalendarLegend />
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-foreground">
                        {showAllUpcoming ? "Upcoming events" : "Events on selected day"}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
                        {upcomingList.length === 0
                          ? "No events to show"
                          : `${upcomingList.length} event${upcomingList.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {!showAllUpcoming ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-xs"
                        onClick={clearDayFilter}
                      >
                        Show all
                      </Button>
                    ) : null}
                  </div>
                  {!showAllUpcoming && selectedDayLabel ? (
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                      <span className="font-medium text-foreground">
                        {selectedDayLabel} · {upcomingList.length} event
                        {upcomingList.length === 1 ? "" : "s"}
                      </span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={clearDayFilter}
                        aria-label="Clear day filter"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-4">
                  {upcomingList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-4 py-10 text-center">
                      <Clock className="size-8 text-muted-foreground/50" aria-hidden />
                      <p className="text-sm text-muted-foreground">
                        {events.length === 0
                          ? "No scheduled marking events yet."
                          : "No upcoming events for this view."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Click a date on the calendar to filter events.
                      </p>
                      {stats.cohortsWithSchedule === 0 ? (
                        <Link
                          href={cohortsHref}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          View cohort schedules in Examiners → Cohorts
                        </Link>
                      ) : null}
                    </div>
                  ) : showAllUpcoming ? (
                    groupedUpcoming.map((group) => (
                      <UpcomingDateGroup
                        key={group.date}
                        date={group.date}
                        events={group.events}
                        compactDate
                      />
                    ))
                  ) : (
                    <ul className="space-y-2">
                      {upcomingList.map((event) => (
                        <li key={event.id}>
                          <UpcomingEventCard event={event} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SubjectOfficerPanelShell>
    </div>
  );
}
