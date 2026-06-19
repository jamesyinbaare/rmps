"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarDays, ClipboardList, MapPin, Sparkles } from "lucide-react";

import {
  buildExaminerPortalSchedule,
  examinerPortalScheduleHasContent,
  nextUpcomingScheduleLine,
  type ScheduleLine,
  type SchedulePhase,
} from "@/components/examiner-invitation/examiner-portal-schedule";
import { Badge } from "@/components/ui/badge";
import type { ExaminerMarkingCohortPublic } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  cohorts: ExaminerMarkingCohortPublic[];
  className?: string;
};

type PhaseConfig = {
  title: string;
  icon: LucideIcon;
  tone: {
    card: string;
    title: string;
    icon: string;
    bar: string;
    row: string;
    badge: string;
  };
};

const PHASE_CONFIG: Record<SchedulePhase, PhaseConfig> = {
  coordination: {
    title: "Coordination",
    icon: MapPin,
    tone: {
      card: "border-violet-500/25 bg-gradient-to-br from-violet-500/[0.08] to-card",
      title: "text-violet-700 dark:text-violet-300",
      icon: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
      bar: "bg-violet-500",
      row: "border-violet-500/15 bg-violet-500/[0.04]",
      badge: "border-violet-500/20 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    },
  },
  marking: {
    title: "Marking",
    icon: CalendarDays,
    tone: {
      card: "border-primary/25 bg-gradient-to-br from-primary/[0.06] to-card",
      title: "text-primary",
      icon: "text-primary bg-primary/10",
      bar: "bg-primary",
      row: "border-primary/15 bg-primary/[0.04]",
      badge: "border-primary/20 bg-primary/10 text-primary",
    },
  },
  submission: {
    title: "Script submission",
    icon: ClipboardList,
    tone: {
      card: "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] to-card",
      title: "text-amber-700 dark:text-amber-300",
      icon: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
      bar: "bg-amber-500",
      row: "border-amber-500/20 bg-amber-500/[0.05]",
      badge: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    },
  },
};

function formatSortKeyDate(sortKey: string): string {
  try {
    return new Date(`${sortKey}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return sortKey;
  }
}

function ScheduleTimelineRow({
  line,
  tone,
  highlighted,
}: {
  line: ScheduleLine;
  tone: PhaseConfig["tone"];
  highlighted?: boolean;
}) {
  return (
    <li
      className={cn(
        "relative flex gap-3 rounded-xl border px-3 py-3 sm:px-3.5",
        tone.row,
        highlighted && "ring-2 ring-primary/25",
      )}
    >
      <span
        className={cn("mt-1 w-1 shrink-0 self-stretch rounded-full", tone.bar)}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {line.eventLabel}
          </p>
          {highlighted ? (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
              Next up
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className={cn("ml-auto max-w-[12rem] truncate text-[10px] font-normal", tone.badge)}
            title={line.cohortName}
          >
            {line.cohortName}
          </Badge>
        </div>
        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{line.dateLabel}</p>
        <p className="text-xs text-muted-foreground">{formatSortKeyDate(line.sortKey)}</p>
        {line.detail ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{line.detail}</p>
        ) : null}
      </div>
    </li>
  );
}

function PhaseScheduleCard({
  phase,
  lines,
  nextLineKey,
}: {
  phase: SchedulePhase;
  lines: ScheduleLine[];
  nextLineKey: string | null;
}) {
  if (lines.length === 0) return null;

  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;

  return (
    <section
      className={cn("rounded-2xl border p-4 shadow-sm sm:p-5", config.tone.card)}
      aria-labelledby={`schedule-phase-${phase}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
            config.tone.icon,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id={`schedule-phase-${phase}`} className={cn("text-sm font-semibold", config.tone.title)}>
            {config.title}
          </h3>
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {lines.map((line) => {
          const lineKey = `${line.phase}-${line.sortKey}-${line.cohortName}-${line.eventLabel}`;
          return (
            <ScheduleTimelineRow
              key={lineKey}
              line={line}
              tone={config.tone}
              highlighted={nextLineKey === lineKey}
            />
          );
        })}
      </ol>
    </section>
  );
}

function NextUpcomingBanner({ line }: { line: ScheduleLine }) {
  const config = PHASE_CONFIG[line.phase];
  const Icon = config.icon;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-card px-4 py-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Coming up next</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {line.eventLabel} · {line.dateLabel}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
              {line.cohortName}
            </span>
            <span aria-hidden>·</span>
            <span>{formatSortKeyDate(line.sortKey)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function lineIdentity(line: ScheduleLine): string {
  return `${line.phase}-${line.sortKey}-${line.cohortName}-${line.eventLabel}`;
}

export function ExaminerMarkingScheduleSection({ cohorts, className }: Props) {
  const schedule = buildExaminerPortalSchedule(cohorts);
  if (!examinerPortalScheduleHasContent(schedule)) return null;

  const nextLine = nextUpcomingScheduleLine(schedule);
  const nextLineKey = nextLine ? lineIdentity(nextLine) : null;

  const phases: { phase: SchedulePhase; lines: ScheduleLine[] }[] = [
    { phase: "coordination", lines: schedule.coordination },
    { phase: "marking", lines: schedule.marking },
    { phase: "submission", lines: schedule.submission },
  ];

  return (
    <section className={cn("mt-6 space-y-4", className)} aria-labelledby="marking-schedule-heading">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" aria-hidden />
        <h2 id="marking-schedule-heading" className="text-sm font-semibold text-foreground">
          Marking schedule
        </h2>
      </div>

      {nextLine ? <NextUpcomingBanner line={nextLine} /> : null}

      <div className="space-y-3">
        {phases.map(({ phase, lines }) => (
          <PhaseScheduleCard
            key={phase}
            phase={phase}
            lines={lines}
            nextLineKey={nextLineKey}
          />
        ))}
      </div>
    </section>
  );
}
