"use client";

import type { ReactNode } from "react";

import { CalendarDays, ClipboardList, MapPin } from "lucide-react";

import { formatDateOnly } from "@/components/examiner-invitations/utils";
import type { CohortScheduleDraft } from "@/components/cohorts/cohort-schedule-utils";
import { formatTimeLabel } from "@/components/cohorts/cohort-schedule-utils";
import { cn } from "@/lib/utils";

type Props = {
  schedule: CohortScheduleDraft;
  className?: string;
  /** Tinted cards matching marking-calendar event colors. */
  colored?: boolean;
  /** Tighter cards for narrow side panels. */
  compact?: boolean;
};

function ScheduleField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ScheduleCard({
  title,
  icon: Icon,
  tone,
  compact = false,
  children,
}: {
  title: string;
  icon: typeof CalendarDays;
  tone: "violet" | "primary" | "amber";
  compact?: boolean;
  children: ReactNode;
}) {
  const tones = {
    violet: {
      card: "border-violet-500/25 bg-gradient-to-br from-violet-500/[0.1] to-card",
      title: "text-violet-700 dark:text-violet-300",
      icon: "text-violet-600 dark:text-violet-400",
    },
    primary: {
      card: "border-primary/25 bg-gradient-to-br from-primary/[0.08] to-card",
      title: "text-primary",
      icon: "text-primary",
    },
    amber: {
      card: "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.1] to-card",
      title: "text-amber-700 dark:text-amber-300",
      icon: "text-amber-600 dark:text-amber-400",
    },
  } as const;
  const t = tones[tone];

  return (
    <section className={cn("rounded-xl border shadow-sm", compact ? "p-2.5" : "p-4", t.card)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-lg bg-background/70",
            compact ? "h-6 w-6" : "h-7 w-7",
            t.icon,
          )}
        >
          <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
        </span>
        <h4 className={cn("text-xs font-semibold uppercase tracking-wide", t.title)}>{title}</h4>
      </div>
      <dl className={cn(compact ? "mt-2 space-y-1" : "mt-3 space-y-2")}>{children}</dl>
    </section>
  );
}

function hasCoordination(schedule: CohortScheduleDraft): boolean {
  return Boolean(
    schedule.coordinationStartDate ||
      schedule.coordinationEndDate ||
      schedule.coordinationStartTime ||
      schedule.coordinationEndTime ||
      schedule.coordinationVenue.trim(),
  );
}

function hasMarking(schedule: CohortScheduleDraft): boolean {
  return Boolean(schedule.markingStartDate || schedule.markingEndDate);
}

function hasSubmission(schedule: CohortScheduleDraft): boolean {
  return Boolean(schedule.markedScriptSubmissionDeadline);
}

export function cohortScheduleHasContent(schedule: CohortScheduleDraft): boolean {
  return hasCoordination(schedule) || hasMarking(schedule) || hasSubmission(schedule);
}

export function CohortScheduleDisplay({ schedule, className, colored = false, compact = false }: Props) {
  const hasAny = cohortScheduleHasContent(schedule);

  if (!hasAny) {
    return (
      <p
        className={cn(
          "rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.06] px-4 py-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No schedule set yet — contact your administrator.
      </p>
    );
  }

  const coordStart = schedule.coordinationStartDate
    ? formatDateOnly(schedule.coordinationStartDate)
    : null;
  const coordEnd = schedule.coordinationEndDate
    ? formatDateOnly(schedule.coordinationEndDate)
    : null;
  const coordStartTime = schedule.coordinationStartTime
    ? formatTimeLabel(schedule.coordinationStartTime)
    : null;
  const coordEndTime = schedule.coordinationEndTime
    ? formatTimeLabel(schedule.coordinationEndTime)
    : null;

  const markingStart = schedule.markingStartDate
    ? formatDateOnly(schedule.markingStartDate)
    : null;
  const markingEnd = schedule.markingEndDate ? formatDateOnly(schedule.markingEndDate) : null;

  const submitBy = schedule.markedScriptSubmissionDeadline
    ? formatDateOnly(schedule.markedScriptSubmissionDeadline)
    : null;

  return (
    <div className={cn("grid grid-cols-1", compact ? "gap-2" : "gap-3", className)}>
      {hasCoordination(schedule) ? (
        colored ? (
          <ScheduleCard title="Coordination" icon={MapPin} tone="violet" compact={compact}>
            <ScheduleField label="Start date" value={coordStart !== "—" ? coordStart : null} />
            <ScheduleField label="Start time" value={coordStartTime !== "—" ? coordStartTime : null} />
            <ScheduleField label="End date" value={coordEnd !== "—" ? coordEnd : null} />
            <ScheduleField label="End time" value={coordEndTime !== "—" ? coordEndTime : null} />
            <ScheduleField label="Venue" value={schedule.coordinationVenue.trim() || null} />
          </ScheduleCard>
        ) : (
          <section className="rounded-lg border border-border bg-muted/15 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coordination</h4>
            <dl className="mt-3 space-y-2">
              <ScheduleField label="Start date" value={coordStart !== "—" ? coordStart : null} />
              <ScheduleField label="Start time" value={coordStartTime !== "—" ? coordStartTime : null} />
              <ScheduleField label="End date" value={coordEnd !== "—" ? coordEnd : null} />
              <ScheduleField label="End time" value={coordEndTime !== "—" ? coordEndTime : null} />
              <ScheduleField label="Venue" value={schedule.coordinationVenue.trim() || null} />
            </dl>
          </section>
        )
      ) : null}

      {hasMarking(schedule) ? (
        colored ? (
          <ScheduleCard title="Marking" icon={CalendarDays} tone="primary" compact={compact}>
            <ScheduleField label="Start date" value={markingStart !== "—" ? markingStart : null} />
            <ScheduleField label="End date" value={markingEnd !== "—" ? markingEnd : null} />
          </ScheduleCard>
        ) : (
          <section className="rounded-lg border border-border bg-muted/15 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marking</h4>
            <dl className="mt-3 space-y-2">
              <ScheduleField label="Start date" value={markingStart !== "—" ? markingStart : null} />
              <ScheduleField label="End date" value={markingEnd !== "—" ? markingEnd : null} />
            </dl>
          </section>
        )
      ) : null}

      {hasSubmission(schedule) ? (
        colored ? (
          <ScheduleCard title="Script submission" icon={ClipboardList} tone="amber" compact={compact}>
            <ScheduleField label="Deadline" value={submitBy !== "—" ? submitBy : null} />
          </ScheduleCard>
        ) : (
          <section className="rounded-lg border border-border bg-muted/15 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Script submission</h4>
            <dl className="mt-3 space-y-2">
              <ScheduleField label="Deadline" value={submitBy !== "—" ? submitBy : null} />
            </dl>
          </section>
        )
      ) : null}
    </div>
  );
}
