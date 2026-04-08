"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  apiJson,
  getStaffCentreDaySummary,
  getStaffCentreOverview,
  getStaffDepotDaySummary,
  getStaffDepotOverview,
  type Examination,
  type StaffCentreDaySummaryResponse,
  type StaffCentreOverviewResponse,
  type StaffCentreOverviewUpcomingItem,
  type StaffDepotOverviewResponse,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const statCardClass =
  "rounded-2xl border border-border bg-card p-5 shadow-sm";

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

/** Left accent bars: theme primary / accent / success (Ghana palette). */
const sessionAccentBar = ["border-l-primary", "border-l-accent", "border-l-success"] as const;

const summaryToggleClass =
  "mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Default number of upcoming calendar dates shown before “View all”. */
const UPCOMING_DATES_PREVIEW = 3;

function TodayAtCentrePanel({
  items,
  summary,
  summaryLoading,
  summaryError,
  sessionScope = "centre",
  hideSchoolNameBadges = false,
  hideCandidateInvigilatorCards = false,
}: {
  items: StaffCentreOverviewUpcomingItem[];
  summary: StaffCentreDaySummaryResponse | null;
  summaryLoading: boolean;
  summaryError: string | null;
  /** Wording for the timetable subtitle (depot = schools in depot). */
  sessionScope?: "centre" | "depot";
  /** Depot keeper: omit school name chips above the table. */
  hideSchoolNameBadges?: boolean;
  /** Depot keeper: omit candidate / invigilator stat cards above the table. */
  hideCandidateInvigilatorCards?: boolean;
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
      <div className="relative bg-linear-to-br from-primary via-accent to-success px-5 py-7 sm:px-8 sm:py-9">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_55%)]" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary-foreground/85">
            Examination day
          </p>
          <h2
            id="today-at-centre-heading"
            className="mt-2 font-black tracking-tight text-primary-foreground text-4xl leading-none sm:text-5xl"
          >
            TODAY
          </h2>
          <p className="mt-3 text-base font-bold text-primary-foreground sm:text-lg">
            {weekdayFormatter.format(dayDate)} · {monthDayFormatter.format(dayDate)}
          </p>
          <p className="mt-1 max-w-xl text-sm font-semibold leading-snug text-primary-foreground/90">
            {cardSlots.length} {sessionLabel} on the timetable for{" "}
            {sessionScope === "depot" ? "schools in your depot" : "your centre"} today —{" "}
            {hideCandidateInvigilatorCards ? "breakdown below." : "breakdown and staffing below."}
          </p>
        </div>
      </div>

      <div className="border-t border-border bg-card px-4 py-5 sm:px-6 sm:py-6">
        {summaryLoading ? (
          <p className="text-sm font-medium text-muted-foreground">Loading today&apos;s candidate breakdown…</p>
        ) : null}
        {summaryError ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {summaryError}
          </p>
        ) : null}
        {!summaryLoading && !summaryError && summary ? (
          <>
            {!hideSchoolNameBadges ? (
              summary.schools.length > 0 ? (
                <div className="mb-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Schools writing today
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Schools with candidates today">
                    {summary.schools.map((s) => (
                      <li
                        key={s.id}
                        className="inline-flex max-w-full rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-bold text-foreground"
                      >
                        <span className="truncate" title={`${s.name} (${s.code})`}>
                          {s.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : summary.slots.length > 0 ? (
                <p className="mb-5 text-sm font-medium text-muted-foreground">
                  No per-school breakdown yet — no registered candidates today for these papers.
                </p>
              ) : null
            ) : null}
            <div className={hideSchoolNameBadges ? "" : "border-t border-border pt-5"}>
              <CentreDaySummaryTable
                summary={summary}
                embedded
                statsFirst={!hideCandidateInvigilatorCards}
                statsProminent={!hideCandidateInvigilatorCards}
                hideTopStats={hideCandidateInvigilatorCards}
                sectionTitle={
                  hideCandidateInvigilatorCards ? "School counts by paper" : "Candidates, invigilators & school counts"
                }
              />
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
  const statPad = statsProminent ? "p-5 sm:p-6" : "p-4";
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

  const tableBlock = (
    <div className="overflow-x-auto rounded-xl border border-border">
        {slotCount === 0 ? (
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="px-3 py-4 text-muted-foreground">
                  No timetable slots on this date for your centre scope.
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
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
                    className="min-w-30 max-w-44 px-3 py-2.5 align-bottom font-semibold text-card-foreground"
                  >
                    <span className="block leading-tight">
                      <span className="font-semibold">{slot.subject_code}</span>
                      <span className="block font-normal text-muted-foreground">{slot.subject_name}</span>
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
                    <th scope="row" className={stickyRowHeader}>
                      {school.name}
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
        )}
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

export type StaffDashboardControlledExam = {
  exams: Examination[];
  examId: number | null;
  onExamIdChange: (id: number | null) => void;
};

export type StaffDashboardOverviewProps = {
  variant?: "centre" | "depot";
  /** Parent-owned examination list and selection (e.g. depot dashboard shared picker). */
  controlledExam?: StaffDashboardControlledExam;
  /**
   * Depot dashboard: show only upcoming sessions until the user expands “Learn more”
   * (candidate/school stats, today’s breakdown, optional footer e.g. scripts summary).
   */
  depotFrontPage?: boolean;
  /** Rendered inside the expanded “Learn more” section (depot + depotFrontPage only). */
  depotLearnMoreFooter?: ReactNode;
};

export function StaffDashboardOverview({
  variant = "centre",
  controlledExam,
  depotFrontPage = false,
  depotLearnMoreFooter,
}: StaffDashboardOverviewProps = {}) {
  const [internalExams, setInternalExams] = useState<Examination[]>([]);
  const [internalExamId, setInternalExamId] = useState<number | null>(null);
  const exams = controlledExam?.exams ?? internalExams;
  const examId = controlledExam?.examId ?? internalExamId;
  const setExamId = controlledExam?.onExamIdChange ?? setInternalExamId;

  const [overview, setOverview] = useState<StaffCentreOverviewResponse | StaffDepotOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [daySummary, setDaySummary] = useState<StaffCentreDaySummaryResponse | null>(null);
  const [daySummaryLoading, setDaySummaryLoading] = useState(false);
  const [daySummaryError, setDaySummaryError] = useState<string | null>(null);
  const [showAllUpcomingDates, setShowAllUpcomingDates] = useState(false);
  const [todaySummary, setTodaySummary] = useState<StaffCentreDaySummaryResponse | null>(null);
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(false);
  const [todaySummaryError, setTodaySummaryError] = useState<string | null>(null);
  const [depotLearnMoreOpen, setDepotLearnMoreOpen] = useState(false);

  const loadExams = useCallback(async () => {
    if (controlledExam) return;
    setError(null);
    try {
      const list = await apiJson<Examination[]>("/examinations/public-list");
      setInternalExams(list);
      setInternalExamId((prev) => {
        if (prev != null && list.some((e) => e.id === prev)) return prev;
        return list.length ? list[0].id : null;
      });
    } catch (e) {
      setInternalExams([]);
      setInternalExamId(null);
      setError(e instanceof Error ? e.message : "Could not load examinations");
    }
  }, [controlledExam]);

  const loadOverview = useCallback(
    async (id: number) => {
      setError(null);
      try {
        const data =
          variant === "depot" ? await getStaffDepotOverview(id) : await getStaffCentreOverview(id);
        setOverview(data);
      } catch (e) {
        setOverview(null);
        setError(e instanceof Error ? e.message : "Could not load overview");
      }
    },
    [variant],
  );

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (examId == null) {
      setOverview(null);
      setOverviewLoading(false);
      return;
    }
    setOverviewLoading(true);
    void loadOverview(examId).finally(() => setOverviewLoading(false));
  }, [examId, loadOverview]);

  useEffect(() => {
    setExpandedDateKey(null);
    setDaySummary(null);
    setDaySummaryError(null);
    setTodaySummary(null);
    setTodaySummaryError(null);
    setShowAllUpcomingDates(false);
    setDepotLearnMoreOpen(false);
  }, [examId]);

  const todayDateKey =
    overview?.sessions_today != null && overview.sessions_today.length > 0
      ? overview.sessions_today[0].examination_date
      : null;

  useEffect(() => {
    if (examId == null || todayDateKey == null) {
      setTodaySummary(null);
      setTodaySummaryLoading(false);
      setTodaySummaryError(null);
      return;
    }
    let cancelled = false;
    setTodaySummaryLoading(true);
    setTodaySummaryError(null);
    const fetchSummary =
      variant === "depot"
        ? getStaffDepotDaySummary(examId, todayDateKey)
        : getStaffCentreDaySummary(examId, todayDateKey);
    void fetchSummary
      .then((data) => {
        if (!cancelled) setTodaySummary(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setTodaySummary(null);
          setTodaySummaryError(e instanceof Error ? e.message : "Could not load today’s breakdown");
        }
      })
      .finally(() => {
        if (!cancelled) setTodaySummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, todayDateKey, variant]);

  useEffect(() => {
    if (examId == null || expandedDateKey == null) {
      setDaySummary(null);
      setDaySummaryLoading(false);
      setDaySummaryError(null);
      return;
    }
    let cancelled = false;
    setDaySummaryLoading(true);
    setDaySummaryError(null);
    const fetchExpanded =
      variant === "depot"
        ? getStaffDepotDaySummary(examId, expandedDateKey)
        : getStaffCentreDaySummary(examId, expandedDateKey);
    void fetchExpanded
      .then((data) => {
        if (!cancelled) setDaySummary(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setDaySummary(null);
          setDaySummaryError(e instanceof Error ? e.message : "Could not load day summary");
        }
      })
      .finally(() => {
        if (!cancelled) setDaySummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, expandedDateKey, variant]);

  const upcomingDateGroups =
    overview != null && overview.upcoming.length > 0 ? groupUpcomingByDate(overview.upcoming) : [];
  const visibleUpcomingDateGroups = showAllUpcomingDates
    ? upcomingDateGroups
    : upcomingDateGroups.slice(0, UPCOMING_DATES_PREVIEW);
  const moreUpcomingDatesCount = Math.max(0, upcomingDateGroups.length - UPCOMING_DATES_PREVIEW);

  const sessionScope = variant === "depot" ? "depot" : "centre";
  const isDepotOverview = overview != null && "depot_code" in overview;
  const depotCompact = Boolean(isDepotOverview && depotFrontPage);

  const upcomingSection =
    overview == null ? null : (
      <div>
        <h2 className="text-sm font-semibold text-card-foreground">Upcoming sessions</h2>
        {overview.upcoming.length === 0 ? (
          <div className={`mt-4 ${statCardClass}`}>
            <p className="text-sm text-muted-foreground">
              No upcoming sessions found for {sessionScope === "depot" ? "schools in your depot" : "your centre"}
              —check the timetable or candidate registrations, or all papers may have already started.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-4">
              {visibleUpcomingDateGroups.map((group) => {
                const cardSlots = mergeUpcomingSlotsForMainCard(group.slots);
                const sessionLabel = cardSlots.length === 1 ? "session" : "sessions";
                return (
                  <article
                    key={group.dateKey}
                    className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                  >
                    <div className="flex w-[min(42%,9.5rem)] shrink-0 flex-col justify-between bg-linear-to-br from-primary via-accent to-success px-4 py-5 text-primary-foreground sm:w-40">
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
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</p>
                      <ul className="mt-3 space-y-3">
                        {cardSlots.map((row, i) => (
                          <li
                            key={`${row.subject_code}-${row.papers.join("-")}-${row.timesLabel}-${i}`}
                            className={`border-l-[3px] pl-3 ${sessionAccentBar[i % sessionAccentBar.length]}`}
                          >
                            <p className="font-medium leading-snug text-foreground">
                              {row.subject_code} — {row.subject_name}
                              {row.papersParenLabel != null ? (
                                <span className="text-muted-foreground"> ({row.papersParenLabel})</span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
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
                          daySummary &&
                          daySummary.examination_date === group.dateKey ? (
                            <CentreDaySummaryTable summary={daySummary} />
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

  return (
    <div className={`${depotCompact ? "space-y-6" : "space-y-8"}`}>
      {controlledExam ? null : (
        <div>
          <label htmlFor="overview-exam" className={formLabelClass}>
            Examination
          </label>
          <select
            id="overview-exam"
            className={`mt-1 w-full max-w-md ${formInputClass}`}
            value={examId ?? ""}
            onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
            disabled={exams.length === 0}
          >
            {exams.length === 0 ? <option value="">No examinations</option> : null}
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {formatExamLabel(ex)}
              </option>
            ))}
          </select>
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {overviewLoading ? <p className="text-sm text-muted-foreground">Loading overview…</p> : null}

      {!overviewLoading && overview ? (
        <>
          {depotCompact ? (
            <>
              <TodayAtCentrePanel
                items={overview.sessions_today ?? []}
                summary={todaySummary}
                summaryLoading={todaySummaryLoading}
                summaryError={todaySummaryError}
                sessionScope={sessionScope}
                hideSchoolNameBadges
                hideCandidateInvigilatorCards
              />
              {upcomingSection}
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
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <li className={statCardClass}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Candidates at centre
                    </p>
                    <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                      {overview.candidate_count.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Registered candidates at this centre.
                    </p>
                  </li>
                  {overview.supervisor_school_is_centre_host ? (
                    <li className={statCardClass}>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schools at centre</p>
                      <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                        {overview.school_count.toLocaleString()}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">Schools that write at this centre.</p>
                    </li>
                  ) : (
                    <li className={satelliteWritesCardClass}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Where your school writes
                      </p>
                      <p className="mt-2 line-clamp-3 text-xl font-bold leading-snug text-foreground">
                        {overview.examination_centre_host_name}
                      </p>
                      <p className="mt-2 text-sm text-foreground/85">
                        Examination centre code{" "}
                        <span className="font-mono font-semibold tabular-nums text-primary">
                          {overview.examination_centre_host_code}
                        </span>
                        . Your candidates sit examinations at this centre.
                      </p>
                    </li>
                  )}
                </ul>
              )}

              <TodayAtCentrePanel
                items={overview.sessions_today ?? []}
                summary={todaySummary}
                summaryLoading={todaySummaryLoading}
                summaryError={todaySummaryError}
                sessionScope={sessionScope}
              />

              {upcomingSection}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
