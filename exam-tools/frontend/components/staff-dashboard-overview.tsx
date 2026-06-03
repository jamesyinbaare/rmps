"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Users } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  ExecutiveBrandHero,
  ExecutiveLoadingPulse,
  ExecutiveSectionHeading,
  ExecutiveStatTile,
  executiveExamSelectClass,
} from "@/components/executive-ui";
import {
  apiJson,
  getStaffCentreDaySummary,
  getStaffCentreOverview,
  getStaffDefaultExamination,
  getStaffDepotDaySummary,
  getStaffDepotOverview,
  getStaffNationalDaySummary,
  getStaffNationalOverview,
  type Examination,
  type NationalExecutiveOverviewResponse,
  type StaffCentreDaySummaryResponse,
  type StaffCentreDaySummarySlotRow,
  type StaffCentreOverviewResponse,
  type StaffCentreOverviewUpcomingItem,
  type StaffDepotOverviewResponse,
} from "@/lib/api";

type SplitCentreDaySummaries = {
  core: StaffCentreDaySummaryResponse;
  elective: StaffCentreDaySummaryResponse;
};

function usesSplitCentreDaySummary(overview: StaffCentreOverviewResponse | null): boolean {
  if (!overview || overview.centre_structure_mode !== "SPLIT") return false;
  if (overview.dashboard_viewer === "inspector") {
    const scope = overview.centre_subject_scope;
    return !scope || scope === "ALL";
  }
  return overview.supervisor_school_is_centre_host;
}

async function fetchCentreDaySummaryForDate(
  examId: number,
  dateKey: string,
  split: boolean,
): Promise<StaffCentreDaySummaryResponse | SplitCentreDaySummaries> {
  if (split) {
    const [core, elective] = await Promise.all([
      getStaffCentreDaySummary(examId, dateKey, "CORE_ONLY"),
      getStaffCentreDaySummary(examId, dateKey, "ELECTIVE_ONLY"),
    ]);
    return { core, elective };
  }
  return getStaffCentreDaySummary(examId, dateKey);
}

function isSplitCentreDaySummaries(
  data: StaffCentreDaySummaryResponse | SplitCentreDaySummaries,
): data is SplitCentreDaySummaries {
  return "core" in data && "elective" in data;
}

function daySummaryReadyForDate(
  dateKey: string,
  single: StaffCentreDaySummaryResponse | null,
  split: SplitCentreDaySummaries | null,
): boolean {
  if (single?.examination_date === dateKey) return true;
  if (split?.core.examination_date === dateKey) return true;
  return false;
}
import {
  getCachedExaminations,
  getCachedNationalOverview,
  peekCachedExaminations,
  peekCachedNationalOverview,
} from "@/lib/executive-overview-cache";
import { resolveExecutiveExamId, writeExecutiveSelectedExamId } from "@/lib/executive-selected-examination";
import { parseMonitoringExamIdFromUrl } from "@/lib/monitoring-access";
import {
  centreSubjectScopePhrase,
  externalWriteDestinations,
  shouldShowWhereCandidatesWrite,
  StaffCandidateWriteDestinations,
} from "@/components/staff-candidate-write-destinations";
import { cn } from "@/lib/utils";

const statCardClass =
  "rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5";

/** Satellite schools: examination centre destination — visually distinct from plain stat cards. */
const satelliteWritesCardClass =
  "rounded-2xl border-2 border-primary/45 bg-linear-to-br from-primary/15 via-card to-accent/10 p-5 shadow-md ring-1 ring-primary/20";

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function parseLocalDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTimeShort(isoTime: string): string {
  return isoTime.length >= 5 ? isoTime.slice(0, 5) : isoTime;
}

/** Portrait mobile: shorten school names in tables/chips (full string in title). */
const MOBILE_SCHOOL_NAME_MAX_CHARS = 26;

function truncateSchoolNameEnd(name: string, maxChars = MOBILE_SCHOOL_NAME_MAX_CHARS): string {
  const t = name.trim();
  if (t.length <= maxChars) return t;
  if (maxChars <= 1) return "…";
  return `${t.slice(0, maxChars - 1)}…`;
}

function schoolListTitle(name: string, code: string): string {
  const c = code.trim();
  return c !== "" ? `${name} (${c})` : name;
}

const monthDayFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });

function groupUpcomingByDate(
  items: StaffCentreOverviewUpcomingItem[],
): { dateKey: string; date: Date; slots: StaffCentreOverviewUpcomingItem[] }[] {
  const map = new Map<string, StaffCentreOverviewUpcomingItem[]>();
  for (const item of items) {
    const key = item.examination_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const groups = [...map.entries()].map(([dateKey, slots]) => ({
    dateKey,
    date: parseLocalDateFromIso(dateKey),
    slots: [...slots].sort((a, b) => a.examination_time.localeCompare(b.examination_time)),
  }));
  groups.sort((a, b) => a.date.getTime() - b.date.getTime());
  return groups;
}

/** Merge timetable rows for the same subject on the same day (e.g. papers 1 & 2) for the main upcoming card. */
type MergedUpcomingCardSlot = {
  subject_code: string;
  subject_name: string;
  papers: number[];
  papersParenLabel: string | null;
  timesLabel: string;
};

function mergeUpcomingSlotsForMainCard(slots: StaffCentreOverviewUpcomingItem[]): MergedUpcomingCardSlot[] {
  const byCode = new Map<string, StaffCentreOverviewUpcomingItem[]>();
  for (const s of slots) {
    const k = s.subject_code.trim();
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k)!.push(s);
  }
  const groups = [...byCode.values()].map((g) =>
    [...g].sort(
      (a, b) =>
        a.examination_time.localeCompare(b.examination_time) || a.paper - b.paper || a.subject_code.localeCompare(b.subject_code),
    ),
  );
  groups.sort(
    (a, b) =>
      a[0].examination_time.localeCompare(b[0].examination_time) ||
      a[0].subject_code.localeCompare(b[0].subject_code),
  );

  return groups.map((g) => {
    const papers = [...new Set(g.map((x) => x.paper))].sort((a, b) => a - b);
    const timeParts = [...new Set(g.map((x) => formatTimeShort(x.examination_time)))].sort();
    const timesLabel = timeParts.join(" · ");
    const first = g[0];
    const papersParenLabel = papers.length > 1 ? papers.map(String).join("&") : null;
    return {
      subject_code: first.subject_code,
      subject_name: first.subject_name,
      papers,
      papersParenLabel,
      timesLabel,
    };
  });
}

function getDayMergedSlots(
  items: StaffCentreOverviewUpcomingItem[],
): { date: Date; dateKey: string; slots: MergedUpcomingCardSlot[] } | null {
  const groups = groupUpcomingByDate(items);
  const first = groups[0];
  if (first == null) return null;
  const slots = mergeUpcomingSlotsForMainCard(first.slots);
  if (slots.length === 0) return null;
  return { date: first.date, dateKey: first.dateKey, slots };
}

/** Executive mobile: today's papers if any, otherwise the next upcoming exam day. */
function getExecutiveSessionDay(
  sessionsToday: StaffCentreOverviewUpcomingItem[] | undefined,
  upcoming: StaffCentreOverviewUpcomingItem[],
): ({ date: Date; dateKey: string; slots: MergedUpcomingCardSlot[] } & { isToday: boolean }) | null {
  if (sessionsToday != null && sessionsToday.length > 0) {
    const day = getDayMergedSlots(sessionsToday);
    return day == null ? null : { ...day, isToday: true };
  }
  const day = getDayMergedSlots(upcoming);
  return day == null ? null : { ...day, isToday: false };
}

/** Left accent bars: theme primary / accent / success (Ghana palette). */
const sessionAccentBar = ["border-l-primary", "border-l-accent", "border-l-success"] as const;

const summaryToggleClass =
  "mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto";

/** Default number of upcoming calendar dates shown before “View all”. */
const UPCOMING_DATES_PREVIEW = 3;

function nationalCentreCount(overview: StaffCentreOverviewResponse): number {
  const national = overview as NationalExecutiveOverviewResponse;
  if (typeof national.centre_count === "number") return national.centre_count;
  return national.centres?.length ?? 0;
}

function ExecutiveNationalStatsRow({
  candidateCount,
  schoolCount,
  centreCount,
}: {
  candidateCount: number;
  schoolCount: number;
  centreCount: number;
}) {
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:gap-3">
      <ExecutiveStatTile
        label="Candidates"
        value={candidateCount}
        tint="primary"
        featured
        className="lg:col-span-2 lg:aspect-2/1 lg:h-auto lg:w-full"
        animationDelayMs={0}
      />
      <div className="grid grid-cols-2 gap-3 lg:contents">
        <ExecutiveStatTile
          label="Schools"
          value={schoolCount}
          tint="success"
          className="lg:aspect-square lg:h-auto lg:w-full"
          animationDelayMs={120}
        />
        <ExecutiveStatTile
          label="Centres"
          value={centreCount}
          tint="secondary"
          className="lg:aspect-square lg:h-auto lg:w-full"
          animationDelayMs={240}
        />
      </div>
    </div>
  );
}

function ExecutiveSessionSlotRow({ row, index }: { row: MergedUpcomingCardSlot; index: number }) {
  const accent = sessionAccentBar[index % sessionAccentBar.length];
  return (
    <li className={`border-l-[3px] pl-2.5 ${accent} lg:border-l-4 lg:pl-3`}>
      <p className="font-medium leading-snug text-foreground lg:text-base">
        <span className="font-semibold">{row.subject_code}</span>
        {row.papersParenLabel != null ? (
          <span className="text-muted-foreground lg:hidden"> ({row.papersParenLabel})</span>
        ) : (
          <span className="text-muted-foreground lg:hidden"> · Paper {row.papers[0]}</span>
        )}
        <span className="font-normal text-muted-foreground lg:hidden"> · </span>
        <span className="tabular-nums lg:hidden">{row.timesLabel}</span>
        <span className="hidden font-normal text-muted-foreground lg:inline">
          {" "}
          — {row.subject_name}
          {row.papersParenLabel != null ? ` (${row.papersParenLabel})` : null}
        </span>
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground lg:hidden" title={row.subject_name}>
        {truncateSchoolNameEnd(row.subject_name, 36)}
      </p>
      <p className="mt-1 hidden text-sm tabular-nums text-muted-foreground lg:block">
        {row.papersParenLabel != null ? (
          row.timesLabel
        ) : (
          <>
            Paper {row.papers[0]} · {row.timesLabel}
          </>
        )}
      </p>
    </li>
  );
}

function ExecutiveNextSessionCard({
  date,
  dateKey,
  slots,
  isToday,
}: {
  date: Date;
  dateKey: string;
  slots: MergedUpcomingCardSlot[];
  isToday: boolean;
}) {
  const sessionHeading = isToday ? "Today's session" : "Next session";
  const dayNum = date.getDate();
  const monthShort = monthDayFormatter.format(date).split(" ")[0];
  const weekdayShort = weekdayFormatter.format(date).slice(0, 3);
  const sessionLabel = slots.length === 1 ? "session" : "sessions";
  const single = slots.length === 1 ? slots[0] : null;
  const useSlotGrid = slots.length > 2;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border-2 bg-card shadow-md ring-1",
        isToday
          ? "border-primary/50 ring-primary/20"
          : "border-primary/40 ring-primary/15",
      )}
    >
      <div className="flex min-w-0 items-stretch">
        <div className="flex w-18 shrink-0 flex-col items-center justify-center self-stretch bg-linear-to-br from-primary via-accent to-success px-2 py-4 text-primary-foreground lg:w-40 lg:justify-between lg:px-4 lg:py-6">
          <time dateTime={dateKey} className="flex flex-col items-center text-center">
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary-foreground/85 lg:hidden">
              {monthShort}
            </span>
            <span className="hidden text-xs font-bold uppercase tracking-wide text-primary-foreground/90 lg:block">
              {monthShort}
            </span>
            <span className="text-3xl font-black leading-none tabular-nums lg:mt-1 lg:text-5xl">{dayNum}</span>
            <span className="mt-1 text-center text-[10px] font-semibold leading-tight text-primary-foreground/90 lg:hidden">
              {weekdayShort}
            </span>
            <span className="mt-2 hidden text-sm font-medium leading-snug text-primary-foreground/90 lg:block">
              {weekdayFormatter.format(date)}
            </span>
            <span className="mt-1 hidden text-sm font-medium text-primary-foreground/90 lg:block">
              {monthDayFormatter.format(date)}
            </span>
          </time>
          <p className="mt-3 hidden text-xs text-primary-foreground/80 lg:block">
            {slots.length} {sessionLabel}
          </p>
        </div>
        <div className="min-w-0 flex-1 border-l border-primary/15 px-4 py-3.5 lg:px-6 lg:py-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary lg:text-xs lg:tracking-wider">
            {sessionHeading}
          </p>
          {single != null ? (
            <>
              <p className="mt-1 font-semibold leading-snug text-foreground lg:mt-2 lg:text-xl">
                {single.subject_code}
                {single.papersParenLabel != null ? (
                  <span className="font-normal text-muted-foreground"> ({single.papersParenLabel})</span>
                ) : (
                  <span className="font-normal text-muted-foreground"> · Paper {single.papers[0]}</span>
                )}
              </p>
              <p
                className="mt-0.5 truncate text-xs text-muted-foreground lg:mt-1.5 lg:line-clamp-2 lg:text-base lg:whitespace-normal"
                title={single.subject_name}
              >
                {single.subject_name}
              </p>
              <p className="mt-2 inline-flex rounded-md bg-secondary/20 px-2 py-0.5 text-sm font-semibold tabular-nums text-foreground lg:mt-3 lg:px-3 lg:py-1 lg:text-base">
                {single.timesLabel}
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-xs font-medium tabular-nums text-muted-foreground lg:mt-1 lg:text-sm">
                {slots.length} {sessionLabel}
              </p>
              <ul
                className={cn(
                  "mt-2.5 space-y-2.5 lg:mt-4 lg:space-y-3",
                  useSlotGrid && "lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-4 lg:space-y-0",
                )}
              >
                {slots.map((row, i) => (
                  <ExecutiveSessionSlotRow
                    key={`${row.subject_code}-${row.papers.join("-")}-${row.timesLabel}-${i}`}
                    row={row}
                    index={i}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function nationalSchoolsWithCandidatesForSlot(slot: StaffCentreDaySummarySlotRow): number {
  return slot.counts_by_school.filter((c) => c > 0).length;
}

/** National test-admin upcoming “Details”: one row per subject — candidates and school count only. */
function NationalUpcomingDayDetailsSummary({ summary }: { summary: StaffCentreDaySummaryResponse }) {
  const nSchoolsDay = summary.schools.length;
  return (
    <div className="mt-4 space-y-3">

      {summary.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timetable slots on this date.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[min(100%,18rem)] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                  Subject
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-card-foreground">
                  Candidates
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-card-foreground">
                  Schools
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.slots.map((slot, i) => (
                <tr
                  key={`${slot.subject_code}-${i}`}
                  className="border-b border-border/70 last:border-b-0"
                >
                  <td className="px-3 py-2.5 align-top" title={slot.subject_name}>
                    <span className="font-semibold text-foreground">{slot.subject_code}</span>
                    <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                      {slot.subject_name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums text-foreground">
                    {slot.row_total.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums text-foreground">
                    {nationalSchoolsWithCandidatesForSlot(slot).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** National monitoring: one row per subject/paper slot with total candidates only (no per-school grid). */
function NationalDaySummaryCompact({ summary }: { summary: StaffCentreDaySummaryResponse }) {
  const nSchools = summary.schools.length;
  return (
    <div className="space-y-4">

      {summary.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timetable slots on this date.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[min(100%,20rem)] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                  Subject
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                  Papers
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                  Time
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-card-foreground">
                  Candidates
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.slots.map((slot, i) => (
                <tr
                  key={`${slot.subject_code}-${slot.papers_label}-${slot.times_label}-${i}`}
                  className="border-b border-border/70 last:border-b-0"
                >
                  <td className="px-3 py-2.5 align-top" title={slot.subject_name}>
                    <span className="font-semibold text-foreground">{slot.subject_code}</span>
                    <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                      {slot.subject_name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top tabular-nums text-foreground">{slot.papers_label}</td>
                  <td className="px-3 py-2.5 align-top tabular-nums text-muted-foreground">{slot.times_label}</td>
                  <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums text-foreground">
                    {slot.row_total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CentreDaySummaryDetails({
  single,
  split,
  embedded = false,
  sectionTitle = "Details",
  statsFirst = false,
  statsProminent = false,
  hideTopStats = false,
}: {
  single: StaffCentreDaySummaryResponse | null;
  split: SplitCentreDaySummaries | null;
  embedded?: boolean;
  sectionTitle?: string;
  statsFirst?: boolean;
  statsProminent?: boolean;
  hideTopStats?: boolean;
}) {
  const tableProps = { embedded, statsFirst, statsProminent, hideTopStats };
  if (split) {
    const hasCore = split.core.slots.length > 0 || split.core.schools.length > 0;
    const hasElective = split.elective.slots.length > 0 || split.elective.schools.length > 0;
    if (!hasCore && !hasElective) {
      return (
        <p className="text-sm text-muted-foreground">
          No timetable slots on this date for your centre scope.
        </p>
      );
    }
    return (
      <div className="space-y-8">
        {hasCore ? (
          <CentreDaySummaryTable
            summary={split.core}
            sectionTitle="Core schedule details"
            {...tableProps}
          />
        ) : null}
        {hasElective ? (
          <CentreDaySummaryTable
            summary={split.elective}
            sectionTitle="Elective schedule details"
            {...tableProps}
          />
        ) : null}
      </div>
    );
  }
  if (single) {
    return (
      <CentreDaySummaryTable summary={single} sectionTitle={sectionTitle} {...tableProps} />
    );
  }
  return null;
}

function TodayAtCentrePanel({
  items,
  summary,
  summarySplit,
  summaryLoading,
  summaryError,
  sessionScope = "centre",
  hideSchoolNameBadges = false,
  hideCandidateInvigilatorCards = false,
  compactSlotSummary = false,
}: {
  items: StaffCentreOverviewUpcomingItem[];
  summary: StaffCentreDaySummaryResponse | null;
  summarySplit?: SplitCentreDaySummaries | null;
  summaryLoading: boolean;
  summaryError: string | null;
  /** Wording for the timetable subtitle (depot = schools in depot; national = all candidate schools). */
  sessionScope?: "centre" | "depot" | "national";
  /** Depot keeper: omit school name chips above the table. */
  hideSchoolNameBadges?: boolean;
  /** Depot keeper: omit candidate / invigilator stat cards above the table. */
  hideCandidateInvigilatorCards?: boolean;
  /** National: show slot totals only instead of a per-school matrix. */
  compactSlotSummary?: boolean;
}) {
  if (items.length === 0) return null;
  const dayDate = parseLocalDateFromIso(items[0].examination_date);
  const cardSlots = mergeUpcomingSlotsForMainCard(items);
  const sessionLabel = cardSlots.length === 1 ? "session" : "sessions";

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-primary/50 bg-card shadow-xl ring-2 ring-primary/15"
      aria-labelledby="today-at-centre-heading"
    >
      <div className="relative bg-linear-to-br from-primary via-accent to-success px-4 py-5 sm:px-8 sm:py-9">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_55%)]" aria-hidden />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary-foreground/85 sm:text-[11px]">
            Examination day
          </p>
          <h2
            id="today-at-centre-heading"
            className="mt-1.5 font-black tracking-tight text-primary-foreground text-3xl leading-none sm:mt-2 sm:text-5xl"
          >
            TODAY
          </h2>
          <p className="mt-2 text-sm font-bold text-primary-foreground sm:mt-3 sm:text-lg">
            {weekdayFormatter.format(dayDate)} · {monthDayFormatter.format(dayDate)}
          </p>
          <p className="mt-1 max-w-xl text-xs font-semibold leading-snug text-primary-foreground/90 sm:text-sm">
            {cardSlots.length} {sessionLabel} on the timetable for{" "}
            {sessionScope === "depot"
              ? "schools in your depot"
              : sessionScope === "national"
                ? "all registered schools"
                : "your centre"}{" "}
            today —{" "}
            {compactSlotSummary
              ? "aggregated paper totals below."
              : hideCandidateInvigilatorCards
                ? "breakdown below."
                : "breakdown and staffing below."}
          </p>
        </div>
      </div>

      <div className="border-t border-border bg-card px-4 py-4 sm:px-6 sm:py-6">
        {summaryLoading ? (
          <p className="text-sm font-medium text-muted-foreground">Loading today&apos;s candidate breakdown…</p>
        ) : null}
        {summaryError ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {summaryError}
          </p>
        ) : null}
        {!summaryLoading && !summaryError && (summary || summarySplit) ? (
          <>
            {!hideSchoolNameBadges ? (
              (summary?.schools.length ?? 0) > 0 ? (
                <div className="mb-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Schools writing today
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Schools with candidates today">
                    {summary!.schools.map((s) => (
                      <li
                        key={s.id}
                        className="inline-flex max-w-full rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-bold text-foreground"
                      >
                        <span className="truncate" title={schoolListTitle(s.name, s.code)}>
                          <span className="sm:hidden">{truncateSchoolNameEnd(s.name)}</span>
                          <span className="hidden sm:inline">{s.name}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (summary?.slots.length ?? 0) > 0 ? (
                <p className="mb-5 text-sm font-medium text-muted-foreground">
                  No per-school breakdown yet — no registered candidates today for these papers.
                </p>
              ) : null
            ) : null}
            <div className={hideSchoolNameBadges ? "" : "border-t border-border pt-5"}>
              {compactSlotSummary && summary ? (
                <NationalDaySummaryCompact summary={summary} />
              ) : (
                <CentreDaySummaryDetails
                  single={summary}
                  split={summarySplit ?? null}
                  embedded
                  statsFirst={!hideCandidateInvigilatorCards}
                  statsProminent={!hideCandidateInvigilatorCards}
                  hideTopStats={hideCandidateInvigilatorCards}
                  sectionTitle={
                    hideCandidateInvigilatorCards ? "School counts by paper" : "Candidates, invigilators & school counts"
                  }
                />
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

const stickyCornerTh =
  "sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left font-semibold text-card-foreground shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";
const stickyRowHeader =
  "sticky left-0 z-[1] bg-background px-3 py-2.5 text-left align-middle text-sm font-medium text-foreground shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]";
const stickyFooterSchool =
  "sticky left-0 z-10 bg-muted/30 px-3 py-2.5 font-semibold text-card-foreground shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";

function CentreDaySummaryTable({
  summary,
  embedded = false,
  statsFirst = false,
  statsProminent = false,
  sectionTitle = "Details",
  showHeading = true,
  hideTopStats = false,
}: {
  summary: StaffCentreDaySummaryResponse;
  /** No top border / default spacing; optional heading for use inside Today panel. */
  embedded?: boolean;
  /** Render candidate & invigilator stats above the table. */
  statsFirst?: boolean;
  /** Larger stat figures. */
  statsProminent?: boolean;
  sectionTitle?: string;
  /** When false, no section heading above stats/table (e.g. Today panel supplies its own labels). */
  showHeading?: boolean;
  /** Omit candidate / invigilator cards (table only). */
  hideTopStats?: boolean;
}) {
  const { schools, slots } = summary;
  const slotCount = slots.length;
  const schoolCount = schools.length;

  const statNumClass = statsProminent
    ? "mt-2 tabular-nums text-3xl font-black tracking-tight text-card-foreground sm:text-4xl"
    : "mt-1 tabular-nums text-xl font-semibold text-card-foreground";
  const statPad = statsProminent ? "p-4 sm:p-6" : "p-4";
  const statLabelClass = statsProminent
    ? "text-xs font-bold uppercase tracking-wide text-muted-foreground"
    : "text-xs font-medium uppercase tracking-wide text-muted-foreground";

  const statsGrid = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className={`${statCardClass} ${statPad} border-primary/15`}>
        <p className={statLabelClass}>No. of candidates</p>
        <p className={statNumClass}>{summary.unique_candidates.toLocaleString()}</p>
        {statsProminent ? (
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            Candidates sitting at least one paper today.
          </p>
        ) : null}
      </div>
      <div className={`${statCardClass} ${statPad} border-primary/15`}>
        <p className={statLabelClass}>No. of invigilators</p>
        <p className={statNumClass}>{summary.invigilators_required.toLocaleString()}</p>
        {statsProminent ? (
          <p className="mt-2 text-xs font-medium text-muted-foreground">1 invigilator per 30 candidates.</p>
        ) : null}
      </div>
    </div>
  );

  const tableBlock =
    slotCount === 0 ? (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className="px-3 py-4 text-muted-foreground">
                No timetable slots on this date for your centre scope.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ) : (
      <div className="space-y-1">
        <div className="relative rounded-xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[min(100%,36rem)] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th scope="col" className={stickyCornerTh}>
                    School
                  </th>
                  {slots.map((slot, j) => (
                    <th
                      key={`${slot.subject_code}-${slot.papers_label}-${slot.times_label}-${j}`}
                      scope="col"
                      title={`${slot.subject_code} — ${slot.subject_name}`}
                      className="min-w-30 max-w-44 px-3 py-2.5 align-bottom font-semibold text-card-foreground"
                    >
                      <span className="block leading-tight">
                        <span className="font-semibold">{slot.subject_code}</span>
                        <span className="hidden font-normal text-muted-foreground sm:block">
                          {slot.subject_name}
                        </span>
                      </span>
                      <span className="mt-1 block tabular-nums text-xs font-medium text-card-foreground">
                        {slot.papers_label}
                      </span>
                      <span className="block tabular-nums text-xs font-normal text-muted-foreground">
                        {slot.times_label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schoolCount === 0 ? (
                  <tr>
                    <td
                      className="bg-background px-3 py-4 text-muted-foreground"
                      colSpan={slotCount + 1}
                    >
                      No registered candidates at this centre.
                    </td>
                  </tr>
                ) : (
                  schools.map((school, i) => (
                    <tr key={school.id} className="border-b border-border/70 last:border-b-0">
                      <th
                        scope="row"
                        className={stickyRowHeader}
                        title={schoolListTitle(school.name, school.code)}
                      >
                        <span className="block sm:hidden">{truncateSchoolNameEnd(school.name)}</span>
                        <span className="hidden sm:block">{school.name}</span>
                      </th>
                      {slots.map((slot, j) => (
                        <td
                          key={`${school.id}-${slot.subject_code}-${j}`}
                          className="px-3 py-2.5 text-center tabular-nums text-card-foreground sm:text-left"
                        >
                          {(slot.counts_by_school[i] ?? 0).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              {schoolCount > 0 ? (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td className={stickyFooterSchool}>Total</td>
                    {slots.map((slot, j) => (
                      <td key={`total-${j}`} className="px-3 py-2.5 tabular-nums text-card-foreground">
                        {slot.row_total.toLocaleString()}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <div
            className="pointer-events-none absolute inset-y-px right-px z-5 hidden w-10 rounded-r-xl bg-linear-to-l from-card from-35% to-transparent sm:hidden"
            aria-hidden
          />
        </div>
        <p className="px-0.5 text-[11px] leading-tight text-muted-foreground sm:hidden">
          Swipe sideways to see all papers.
        </p>
      </div>
    );

  return (
    <div
      className={
        embedded ? "space-y-5" : "mt-4 space-y-4 border-t border-border pt-4"
      }
    >
      {showHeading ? (
        !embedded ? (
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {sectionTitle}
          </h3>
        ) : (
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {sectionTitle}
          </h3>
        )
      ) : null}
      {hideTopStats ? (
        tableBlock
      ) : statsFirst ? (
        <>
          {statsGrid}
          {tableBlock}
        </>
      ) : (
        <>
          {tableBlock}
          {statsGrid}
        </>
      )}
    </div>
  );
}

function CentreStaffStatCards({ overview }: { overview: StaffCentreOverviewResponse }) {
  const isInspector = overview.dashboard_viewer === "inspector";
  const scopePhrase = centreSubjectScopePhrase(overview.centre_subject_scope);
  const scopeSuffix =
    isInspector && overview.centre_subject_scope ? ` (${scopePhrase})` : "";

  if (isInspector) {
    return (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <li className={statCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Candidates at centre{scopeSuffix}
          </p>
          <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
            {overview.candidate_count.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Registered candidates at schools writing at{" "}
            <span className="font-medium text-foreground">{overview.examination_centre_host_name}</span>
            {scopeSuffix ? ` for ${scopePhrase}` : " this centre"}.
          </p>
        </li>
        <li className={statCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Schools at centre{scopeSuffix}
          </p>
          <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
            {overview.school_count.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Schools with candidates writing at this centre
            {scopeSuffix ? ` for ${scopePhrase}` : ""}.
          </p>
        </li>
      </ul>
    );
  }

  /** Host = school code matches centre code (API); hide “where you write” when writing at own centre only. */
  const writesAtOwnCentre = overview.supervisor_school_is_centre_host;

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <li className={statCardClass}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {writesAtOwnCentre ? "Candidates at centre" : "Your candidates"}
        </p>
        <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
          {overview.candidate_count.toLocaleString()}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {writesAtOwnCentre
            ? "Registered candidates at this centre."
            : `Registered candidates at ${overview.supervisor_school_name} for this examination.`}
        </p>
      </li>
      {writesAtOwnCentre ? (
        <li className={statCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schools at centre</p>
          <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
            {overview.school_count.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Schools that write at this centre.</p>
        </li>
      ) : (
        <li className={satelliteWritesCardClass}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Where your candidates write</p>
          <StaffCandidateWriteDestinations
            className="mt-2"
            destinations={externalWriteDestinations(overview)}
          />
        </li>
      )}
    </ul>
  );
}

export type StaffDashboardControlledExam = {
  exams: Examination[];
  examId: number | null;
  onExamIdChange: (id: number | null) => void;
};

export type StaffDashboardOverviewProps = {
  variant?: "centre" | "depot" | "national";
  /** Parent-owned examination list and selection (e.g. depot dashboard shared picker). */
  controlledExam?: StaffDashboardControlledExam;
  /**
   * Depot dashboard: show only upcoming sessions until the user expands “Learn more”
   * (candidate/school stats, today’s breakdown, optional footer e.g. scripts summary).
   */
  depotFrontPage?: boolean;
  /** Rendered inside the expanded “Learn more” section (depot + depotFrontPage only). */
  depotLearnMoreFooter?: ReactNode;
  /** When set, shows a short card linking to the full examination notice (staff overview). */
  examinationNoticeHref?: string;
  /** Notified when the selected examination changes (e.g. executive centres section on monitoring page). */
  onExamIdChange?: (id: number | null) => void;
  /** Tighter spacing and touch-first national layout (executive monitoring page). */
  mobileFirst?: boolean;
  /** When set, read/write selected examination id in the URL query (e.g. `exam_id`). */
  examIdSearchParam?: string;
  /** Hide today / upcoming timetable sections (e.g. Test Administration exam overview). */
  hideSessionSchedule?: boolean;
};

export function StaffDashboardOverview({
  variant = "centre",
  controlledExam,
  depotFrontPage = false,
  depotLearnMoreFooter,
  examinationNoticeHref,
  onExamIdChange,
  mobileFirst = false,
  examIdSearchParam,
  hideSessionSchedule = false,
}: StaffDashboardOverviewProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [internalExams, setInternalExams] = useState<Examination[]>([]);
  const [internalExamId, setInternalExamId] = useState<number | null>(null);
  const [examUrlHydrated, setExamUrlHydrated] = useState(!examIdSearchParam);
  const exams = controlledExam?.exams ?? internalExams;
  const examId = controlledExam?.examId ?? internalExamId;
  const setExamId = controlledExam?.onExamIdChange ?? setInternalExamId;

  const [overview, setOverview] = useState<StaffCentreOverviewResponse | StaffDepotOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewRevalidating, setOverviewRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<StaffCentreDaySummaryResponse | null>(null);
  const [daySummarySplit, setDaySummarySplit] = useState<SplitCentreDaySummaries | null>(null);
  const [daySummaryLoading, setDaySummaryLoading] = useState(false);
  const [daySummaryError, setDaySummaryError] = useState<string | null>(null);
  const [showAllUpcomingDates, setShowAllUpcomingDates] = useState(false);
  const [todaySummary, setTodaySummary] = useState<StaffCentreDaySummaryResponse | null>(null);
  const [todaySummarySplit, setTodaySummarySplit] = useState<SplitCentreDaySummaries | null>(null);
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(false);
  const [todaySummaryError, setTodaySummaryError] = useState<string | null>(null);
  const [depotLearnMoreOpen, setDepotLearnMoreOpen] = useState(false);

  const useExecutiveExamsCache = variant === "national";

  const loadExams = useCallback(async () => {
    if (controlledExam) return;
    setError(null);
    try {
      if (useExecutiveExamsCache) {
        const result = await getCachedExaminations({
          onUpdate: (payload) => {
            setInternalExams(payload.exams);
          },
        });
        const list = result.data.exams;
        const defaultExam = result.data.defaultExam;
        setInternalExams(list);
        const fromUrl =
          examIdSearchParam != null
            ? parseMonitoringExamIdFromUrl(searchParams.get(examIdSearchParam))
            : null;
        setInternalExamId((prev) =>
          resolveExecutiveExamId({
            exams: list,
            fromUrl,
            previous: prev,
            defaultExam,
          }),
        );
        if (examIdSearchParam != null) setExamUrlHydrated(true);
        return;
      }
      const path = "/examinations/public-list";
      const [list, defaultExam] = await Promise.all([
        apiJson<Examination[]>(path),
        getStaffDefaultExamination().catch(() => null),
      ]);
      setInternalExams(list);
      const fromUrl =
        examIdSearchParam != null
          ? parseMonitoringExamIdFromUrl(searchParams.get(examIdSearchParam))
          : null;
      setInternalExamId((prev) => {
        if (prev != null && list.some((e) => e.id === prev)) return prev;
        if (fromUrl != null && list.some((e) => e.id === fromUrl)) return fromUrl;
        const fromDefault =
          defaultExam != null && list.some((e) => e.id === defaultExam.id) ? defaultExam.id : null;
        if (fromDefault != null) return fromDefault;
        return list.length ? list[0].id : null;
      });
      if (examIdSearchParam != null) setExamUrlHydrated(true);
    } catch (e) {
      setInternalExams([]);
      setInternalExamId(null);
      setError(e instanceof Error ? e.message : "Could not load examinations");
    }
  }, [controlledExam, variant, examIdSearchParam, searchParams, useExecutiveExamsCache]);

  useEffect(() => {
    if (controlledExam || examIdSearchParam == null || internalExams.length === 0) return;
    const fromUrl = parseMonitoringExamIdFromUrl(searchParams.get(examIdSearchParam));
    setInternalExamId((prev) =>
      resolveExecutiveExamId({
        exams: internalExams,
        fromUrl,
        previous: prev,
        defaultExam: null,
      }),
    );
    setExamUrlHydrated(true);
  }, [controlledExam, examIdSearchParam, internalExams, searchParams]);

  useEffect(() => {
    if (controlledExam || examIdSearchParam == null || !examUrlHydrated || examId == null) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set(examIdSearchParam, String(examId));
    const next = p.toString();
    if (next === searchParams.toString()) return;
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [
    controlledExam,
    examIdSearchParam,
    examUrlHydrated,
    examId,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (!useExecutiveExamsCache || examId == null) return;
    writeExecutiveSelectedExamId(examId);
  }, [examId, useExecutiveExamsCache]);

  const slimNationalOverview = mobileFirst && variant === "national";

  const loadOverview = useCallback(
    async (id: number) => {
      setError(null);
      try {
        if (variant === "national") {
          const result = await getCachedNationalOverview(id, {
            includeCentres: !slimNationalOverview,
            onUpdate: (data) => {
              setOverview(data);
              setOverviewRevalidating(false);
            },
          });
          setOverview(result.data);
          setOverviewRevalidating(result.isRevalidating);
          return;
        }
        const data =
          variant === "depot" ? await getStaffDepotOverview(id) : await getStaffCentreOverview(id);
        setOverview(data);
        setOverviewRevalidating(false);
      } catch (e) {
        setOverview(null);
        setOverviewRevalidating(false);
        setError(e instanceof Error ? e.message : "Could not load overview");
      }
    },
    [variant, slimNationalOverview],
  );

  useEffect(() => {
    if (controlledExam || !useExecutiveExamsCache) return;
    const peek = peekCachedExaminations();
    if (peek != null && internalExams.length === 0) {
      setInternalExams(peek.exams);
    }
  }, [controlledExam, useExecutiveExamsCache, internalExams.length]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    onExamIdChange?.(examId);
  }, [examId, onExamIdChange]);

  useEffect(() => {
    if (examId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOverview(null);
      setOverviewLoading(false);
      setOverviewRevalidating(false);
      return;
    }
    if (variant === "national") {
      const peek = peekCachedNationalOverview(examId, !slimNationalOverview);
      if (peek != null) {
        setOverview(peek);
        setOverviewLoading(false);
      } else {
        setOverviewLoading(true);
      }
    } else {
      setOverviewLoading(true);
    }
    setOverviewRevalidating(false);
    void loadOverview(examId).finally(() => setOverviewLoading(false));
  }, [examId, loadOverview, variant, slimNationalOverview]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedDateKey(null);
    setDaySummary(null);
    setDaySummarySplit(null);
    setDaySummaryError(null);
    setTodaySummary(null);
    setTodaySummarySplit(null);
    setTodaySummaryError(null);
    setShowAllUpcomingDates(false);
    setDepotLearnMoreOpen(false);
  }, [examId]);

  const todayDateKey =
    overview?.sessions_today != null && overview.sessions_today.length > 0
      ? overview.sessions_today[0].examination_date
      : null;

  const centreOverview =
    variant === "centre" && overview && "centre_structure_mode" in overview
      ? (overview as StaffCentreOverviewResponse)
      : null;
  const splitCentreDaySummary = usesSplitCentreDaySummary(centreOverview);

  useEffect(() => {
    if (hideSessionSchedule || examId == null || todayDateKey == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTodaySummary(null);
      setTodaySummarySplit(null);
      setTodaySummaryLoading(false);
      setTodaySummaryError(null);
      return;
    }
    let cancelled = false;
    setTodaySummaryLoading(true);
    setTodaySummaryError(null);
    const run = async () => {
      try {
        if (variant === "depot") {
          const data = await getStaffDepotDaySummary(examId, todayDateKey);
          if (!cancelled) {
            setTodaySummary(data);
            setTodaySummarySplit(null);
          }
        } else if (variant === "national") {
          const data = await getStaffNationalDaySummary(examId, todayDateKey);
          if (!cancelled) {
            setTodaySummary(data);
            setTodaySummarySplit(null);
          }
        } else {
          const data = await fetchCentreDaySummaryForDate(
            examId,
            todayDateKey,
            splitCentreDaySummary,
          );
          if (!cancelled) {
            if (isSplitCentreDaySummaries(data)) {
              setTodaySummarySplit(data);
              setTodaySummary(null);
            } else {
              setTodaySummary(data);
              setTodaySummarySplit(null);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setTodaySummary(null);
          setTodaySummarySplit(null);
          setTodaySummaryError(
            e instanceof Error ? e.message : "Could not load today’s breakdown",
          );
        }
      } finally {
        if (!cancelled) setTodaySummaryLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [examId, todayDateKey, variant, splitCentreDaySummary, hideSessionSchedule]);

  useEffect(() => {
    if (examId == null || expandedDateKey == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDaySummary(null);
      setDaySummarySplit(null);
      setDaySummaryLoading(false);
      setDaySummaryError(null);
      return;
    }
    let cancelled = false;
    setDaySummaryLoading(true);
    setDaySummaryError(null);
    const run = async () => {
      try {
        if (variant === "depot") {
          const data = await getStaffDepotDaySummary(examId, expandedDateKey);
          if (!cancelled) {
            setDaySummary(data);
            setDaySummarySplit(null);
          }
        } else if (variant === "national") {
          const data = await getStaffNationalDaySummary(examId, expandedDateKey);
          if (!cancelled) {
            setDaySummary(data);
            setDaySummarySplit(null);
          }
        } else {
          const data = await fetchCentreDaySummaryForDate(
            examId,
            expandedDateKey,
            splitCentreDaySummary,
          );
          if (!cancelled) {
            if (isSplitCentreDaySummaries(data)) {
              setDaySummarySplit(data);
              setDaySummary(null);
            } else {
              setDaySummary(data);
              setDaySummarySplit(null);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setDaySummary(null);
          setDaySummarySplit(null);
          setDaySummaryError(e instanceof Error ? e.message : "Could not load day summary");
        }
      } finally {
        if (!cancelled) setDaySummaryLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [examId, expandedDateKey, variant, splitCentreDaySummary]);

  const executiveMobileNational = mobileFirst && variant === "national";

  const upcomingDateGroups =
    overview != null && overview.upcoming.length > 0 ? groupUpcomingByDate(overview.upcoming) : [];
  const upcomingDatesLimit = executiveMobileNational ? 1 : UPCOMING_DATES_PREVIEW;
  const visibleUpcomingDateGroups = showAllUpcomingDates
    ? upcomingDateGroups
    : upcomingDateGroups.slice(0, upcomingDatesLimit);
  const moreUpcomingDatesCount = executiveMobileNational
    ? 0
    : Math.max(0, upcomingDateGroups.length - UPCOMING_DATES_PREVIEW);
  const executiveSessionDay =
    overview != null
      ? getExecutiveSessionDay(overview.sessions_today, overview.upcoming)
      : null;

  const sessionScope = variant === "depot" ? "depot" : variant === "national" ? "national" : "centre";
  const isDepotOverview = overview != null && "depot_code" in overview;
  const depotCompact = Boolean(isDepotOverview && depotFrontPage);

  const upcomingSection =
    overview == null ? null : executiveMobileNational ? (
      <div>
        <ExecutiveSectionHeading icon={CalendarDays} accentClass="bg-secondary">
          {executiveSessionDay?.isToday ? "Today's session" : "Upcoming session"}
        </ExecutiveSectionHeading>
        {executiveSessionDay == null ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            No upcoming sessions — all papers may have been written or the timetable is not set.
          </p>
        ) : (
          <div className="mt-3">
            <ExecutiveNextSessionCard
              date={executiveSessionDay.date}
              dateKey={executiveSessionDay.dateKey}
              slots={executiveSessionDay.slots}
              isToday={executiveSessionDay.isToday}
            />
          </div>
        )}
      </div>
    ) : (
      <div>
        <h2 className="text-sm font-semibold text-card-foreground">Upcoming sessions</h2>
        {overview.upcoming.length === 0 ? (
          <div className={`mt-4 ${statCardClass}`}>
            <p className="text-sm text-muted-foreground">
              No upcoming sessions found for{" "}
              {sessionScope === "depot"
                ? "schools in your depot"
                : sessionScope === "national"
                  ? "all registered schools"
                  : "your centre"}
              —check the timetable or candidate registrations, or all papers may have already been written.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-4">
              {visibleUpcomingDateGroups.map((group) => {
                const cardSlots = mergeUpcomingSlotsForMainCard(group.slots);
                const sessionLabel = cardSlots.length === 1 ? "session" : "sessions";
                const mobileDetailsReady =
                  expandedDateKey === group.dateKey &&
                  !daySummaryLoading &&
                  !daySummaryError &&
                  daySummaryReadyForDate(group.dateKey, daySummary, daySummarySplit);
                return (
                  <article
                    key={group.dateKey}
                    className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:flex-row"
                  >
                    <div className="hidden shrink-0 flex-col justify-between bg-linear-to-br from-primary via-accent to-success px-4 py-5 text-primary-foreground sm:flex sm:w-40">
                      <time dateTime={group.dateKey} className="block">
                        <span className="block text-3xl font-bold leading-none tracking-tight sm:text-4xl">
                          {monthDayFormatter.format(group.date)}
                        </span>
                        <span className="mt-2 block text-sm font-medium text-primary-foreground/90">
                          {weekdayFormatter.format(group.date)}
                        </span>
                      </time>
                      <p className="text-xs text-primary-foreground/75">
                        {cardSlots.length} {sessionLabel}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
                      <div
                        className={
                          mobileDetailsReady
                            ? "hidden"
                            : "mb-2 flex min-w-0 items-baseline justify-between gap-2 sm:hidden"
                        }
                      >
                        <time
                          dateTime={group.dateKey}
                          className="min-w-0 text-xs font-semibold leading-snug text-foreground"
                        >
                          {weekdayFormatter.format(group.date)} · {monthDayFormatter.format(group.date)}
                        </time>
                        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                          {cardSlots.length} {sessionLabel}
                        </span>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</p>
                      <ul className="mt-3 space-y-3">
                        {cardSlots.map((row, i) => (
                          <li
                            key={`${row.subject_code}-${row.papers.join("-")}-${row.timesLabel}-${i}`}
                            className={`border-l-[3px] pl-3 ${sessionAccentBar[i % sessionAccentBar.length]}`}
                          >
                            <p className="font-medium leading-snug text-foreground sm:hidden">
                              <span className="font-semibold">{row.subject_code}</span>
                              {row.papersParenLabel != null ? (
                                <span className="text-muted-foreground"> ({row.papersParenLabel})</span>
                              ) : (
                                <span className="text-muted-foreground"> · Paper {row.papers[0]}</span>
                              )}
                              <span className="font-normal text-muted-foreground"> · </span>
                              <span className="tabular-nums">{row.timesLabel}</span>
                            </p>
                            <p
                              className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden"
                              title={row.subject_name}
                            >
                              {truncateSchoolNameEnd(row.subject_name, 36)}
                            </p>
                            <p className="hidden font-medium leading-snug text-foreground sm:block">
                              {row.subject_code} — {row.subject_name}
                              {row.papersParenLabel != null ? (
                                <span className="text-muted-foreground"> ({row.papersParenLabel})</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 hidden text-sm tabular-nums text-muted-foreground sm:block">
                              {row.papersParenLabel != null ? (
                                row.timesLabel
                              ) : (
                                <>
                                  Paper {row.papers[0]} · {row.timesLabel}
                                </>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className={summaryToggleClass}
                        aria-expanded={expandedDateKey === group.dateKey}
                        onClick={() =>
                          setExpandedDateKey((prev) => (prev === group.dateKey ? null : group.dateKey))
                        }
                      >
                        {expandedDateKey === group.dateKey ? "Hide details" : "Details"}
                      </button>
                      {expandedDateKey === group.dateKey ? (
                        <>
                          {daySummaryLoading ? (
                            <p className="mt-4 text-sm text-muted-foreground">Loading day summary…</p>
                          ) : null}
                          {daySummaryError ? (
                            <p className="mt-4 text-sm text-destructive" role="alert">
                              {daySummaryError}
                            </p>
                          ) : null}
                          {!daySummaryLoading &&
                          !daySummaryError &&
                          daySummaryReadyForDate(group.dateKey, daySummary, daySummarySplit) ? (
                            <>
                              <div className="mb-3 flex min-w-0 items-baseline justify-between gap-2 border-b border-border/60 pb-2 sm:hidden">
                                <time
                                  dateTime={group.dateKey}
                                  className="min-w-0 text-[11px] font-medium leading-snug text-muted-foreground"
                                >
                                  {weekdayFormatter.format(group.date)} ·{" "}
                                  {monthDayFormatter.format(group.date)}
                                </time>
                                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                                  {cardSlots.length} {sessionLabel}
                                </span>
                              </div>
                              {variant === "national" && daySummary ? (
                                <NationalUpcomingDayDetailsSummary summary={daySummary} />
                              ) : (
                                <CentreDaySummaryDetails
                                  single={daySummary}
                                  split={daySummarySplit}
                                  sectionTitle="Details"
                                />
                              )}
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            {moreUpcomingDatesCount > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  className={`${summaryToggleClass} mt-0`}
                  onClick={() => {
                    if (showAllUpcomingDates) {
                      setShowAllUpcomingDates(false);
                      setExpandedDateKey((key) => {
                        if (key == null) return null;
                        const firstKeys = new Set(
                          upcomingDateGroups.slice(0, UPCOMING_DATES_PREVIEW).map((g) => g.dateKey),
                        );
                        return firstKeys.has(key) ? key : null;
                      });
                    } else {
                      setShowAllUpcomingDates(true);
                    }
                  }}
                >
                  {showAllUpcomingDates
                    ? "Show fewer dates"
                    : `View all · ${moreUpcomingDatesCount} more date${moreUpcomingDatesCount === 1 ? "" : "s"}`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    );

  const examinationNoticeTeaser =
    examinationNoticeHref != null && examinationNoticeHref !== "" ? (
      <aside
        className="rounded-2xl border border-primary/30 bg-linear-to-br from-primary/10 via-card to-accent/5 p-5 shadow-sm ring-1 ring-primary/15"
        aria-labelledby="overview-examination-notice-heading"
      >
        <p
          id="overview-examination-notice-heading"
          className="text-xs font-bold uppercase tracking-wider text-primary"
        >
          Examination notice
        </p>
        <p className="mt-2 text-sm text-foreground">
          Summary, responsibilities, and document checklist for this examination.
        </p>
        <div className="mt-4">
          <Link
            href={examinationNoticeHref}
            className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View examination notice
          </Link>
        </div>
      </aside>
    ) : null;

  const rootSpacing =
    depotCompact || executiveMobileNational ? "space-y-6" : "space-y-8";

  return (
    <div className={rootSpacing}>
      {executiveMobileNational && exams.length > 0 ? (
        <ExecutiveBrandHero title="National monitoring">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-primary-foreground/90">Examination</span>
            <select
              className={executiveExamSelectClass}
              value={examId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                const next = v === "" ? null : Number(v);
                setExamId(next);
                if (next != null) writeExecutiveSelectedExamId(next);
                else writeExecutiveSelectedExamId(null);
              }}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </label>
        </ExecutiveBrandHero>
      ) : examId != null ? (
        <div
          className={
            mobileFirst && variant === "national"
              ? "rounded-xl border border-border bg-muted/30 px-4 py-3.5"
              : "rounded-lg border border-border bg-muted/30 px-4 py-3"
          }
        >
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Examination</span>
            {": "}
            {exams.find((e) => e.id === examId)
              ? formatExamLabel(exams.find((e) => e.id === examId)!)
              : "—"}
          </p>
        </div>
      ) : null}

      {examinationNoticeTeaser}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {overviewLoading ? (
        executiveMobileNational ? (
          <ExecutiveLoadingPulse label="Loading overview…" />
        ) : (
          <p className="text-sm text-muted-foreground">Loading overview…</p>
        )
      ) : null}

      {!overviewLoading && overviewRevalidating && overview ? (
        <p className="text-center text-xs font-medium text-muted-foreground motion-reduce:opacity-100">
          Updating…
        </p>
      ) : null}

      {!overviewLoading && overview ? (
        <>
          {depotCompact ? (
            <>
              {!hideSessionSchedule ? (
                <TodayAtCentrePanel
                  items={overview.sessions_today ?? []}
                  summary={todaySummary}
                  summarySplit={todaySummarySplit}
                  summaryLoading={todaySummaryLoading}
                  summaryError={todaySummaryError}
                  sessionScope={sessionScope}
                  hideSchoolNameBadges
                  hideCandidateInvigilatorCards
                />
              ) : null}
              {!hideSessionSchedule ? upcomingSection : null}
              <div>
                <button
                  type="button"
                  className={summaryToggleClass}
                  aria-expanded={depotLearnMoreOpen}
                  onClick={() => setDepotLearnMoreOpen((v) => !v)}
                >
                  {depotLearnMoreOpen ? "Show less" : "Learn more"}
                </button>
                {depotLearnMoreOpen ? (
                  <div className="mt-6 space-y-8 border-t border-border pt-6">
                    <p className="text-sm text-muted-foreground">
                      Registration totals for your depot and script envelope summary.
                    </p>
                    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <li className={statCardClass}>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Candidates in depot
                        </p>
                        <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                          {overview.candidate_count.toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Registered candidates at schools in your depot for this examination.
                        </p>
                      </li>
                      <li className={statCardClass}>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Schools in depot
                        </p>
                        <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                          {overview.school_count.toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {"depot_name" in overview
                            ? `Schools assigned to depot ${overview.depot_name} (${overview.depot_code}).`
                            : "Schools assigned to your depot."}
                        </p>
                      </li>
                    </ul>
                    {depotLearnMoreFooter != null ? (
                      <div className="space-y-3">{depotLearnMoreFooter}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {isDepotOverview ? (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <li className={statCardClass}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Candidates in depot
                    </p>
                    <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                      {overview.candidate_count.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Registered candidates at schools in your depot for this examination.
                    </p>
                  </li>
                  <li className={statCardClass}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schools in depot</p>
                    <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                      {overview.school_count.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Schools assigned to depot {overview.depot_name} ({overview.depot_code}).
                    </p>
                  </li>
                </ul>
              ) : variant === "national" ? (
                mobileFirst ? (
                  <div>
                    <ExecutiveSectionHeading icon={Users} accentClass="bg-primary">
                      National totals
                    </ExecutiveSectionHeading>
                    <div className="mt-3">
                      <ExecutiveNationalStatsRow
                        candidateCount={overview.candidate_count}
                        schoolCount={overview.school_count}
                        centreCount={nationalCentreCount(overview)}
                      />
                    </div>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <li className={statCardClass}>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Candidates (national)
                      </p>
                      <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                        {overview.candidate_count.toLocaleString()}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Registered candidates for this examination across all schools.
                      </p>
                    </li>
                    <li className={statCardClass}>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Schools with candidates
                      </p>
                      <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                        {overview.school_count.toLocaleString()}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Number of schools with registered candidate for this examination.
                      </p>
                    </li>
                  </ul>
                )
              ) : (
                <CentreStaffStatCards overview={overview as StaffCentreOverviewResponse} />
              )}

              {!hideSessionSchedule && !executiveMobileNational ? (
                <TodayAtCentrePanel
                  items={overview.sessions_today ?? []}
                  summary={todaySummary}
                  summarySplit={todaySummarySplit}
                  summaryLoading={todaySummaryLoading}
                  summaryError={todaySummaryError}
                  sessionScope={sessionScope}
                  hideSchoolNameBadges={variant === "national"}
                  hideCandidateInvigilatorCards={variant === "national"}
                  compactSlotSummary={variant === "national"}
                />
              ) : null}

              {!hideSessionSchedule ? upcomingSection : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
