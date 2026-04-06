"use client";

import { useCallback, useEffect, useState } from "react";

import {
  apiJson,
  getStaffCentreOverview,
  type Examination,
  type StaffCentreOverviewResponse,
  type StaffCentreOverviewUpcomingItem,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const statCardClass =
  "rounded-2xl border border-border bg-card p-5 shadow-sm";

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

/** Left accent bars: theme primary / accent / success (Ghana palette). */
const sessionAccentBar = ["border-l-primary", "border-l-accent", "border-l-success"] as const;

export function StaffDashboardOverview() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [overview, setOverview] = useState<StaffCentreOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    setError(null);
    try {
      const list = await apiJson<Examination[]>("/examinations/public-list");
      setExams(list);
      setExamId((prev) => {
        if (prev != null && list.some((e) => e.id === prev)) return prev;
        return list.length ? list[0].id : null;
      });
    } catch (e) {
      setExams([]);
      setExamId(null);
      setError(e instanceof Error ? e.message : "Could not load examinations");
    }
  }, []);

  const loadOverview = useCallback(async (id: number) => {
    setError(null);
    try {
      const data = await getStaffCentreOverview(id);
      setOverview(data);
    } catch (e) {
      setOverview(null);
      setError(e instanceof Error ? e.message : "Could not load overview");
    }
  }, []);

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

  return (
    <div className="space-y-8">
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

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {overviewLoading ? <p className="text-sm text-muted-foreground">Loading overview…</p> : null}

      {!overviewLoading && overview ? (
        <>
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
            <li className={statCardClass}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schools at centre</p>
              <p className="mt-2 tabular-nums text-3xl font-semibold text-card-foreground">
                {overview.school_count.toLocaleString()}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Schools that write at this centre.</p>
            </li>
          </ul>

          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Upcoming sessions</h2>
            {overview.upcoming.length === 0 ? (
              <div className={`mt-4 ${statCardClass}`}>
                <p className="text-sm text-muted-foreground">
                  No upcoming sessions found—check the timetable or candidate registrations, or all papers may have
                  already started.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {groupUpcomingByDate(overview.upcoming).map((group) => {
                  const sessionLabel = group.slots.length === 1 ? "session" : "sessions";
                  return (
                    <article
                      key={group.dateKey}
                      className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                    >
                      <div
                        className="flex w-[min(42%,9.5rem)] shrink-0 flex-col justify-between bg-linear-to-br from-primary via-accent to-success px-4 py-5 text-primary-foreground sm:w-40"
                      >
                        <time dateTime={group.dateKey} className="block">
                          <span className="block text-3xl font-bold leading-none tracking-tight sm:text-4xl">
                            {monthDayFormatter.format(group.date)}
                          </span>
                          <span className="mt-2 block text-sm font-medium text-primary-foreground/90">
                            {weekdayFormatter.format(group.date)}
                          </span>
                        </time>
                        <p className="text-xs text-primary-foreground/75">
                          {group.slots.length} {sessionLabel}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Upcoming
                        </p>
                        <ul className="mt-3 space-y-3">
                          {group.slots.map((row, i) => (
                            <li
                              key={`${row.subject_code}-${row.paper}-${row.examination_date}-${row.examination_time}-${i}`}
                              className={`border-l-[3px] pl-3 ${sessionAccentBar[i % sessionAccentBar.length]}`}
                            >
                              <p className="font-medium leading-snug text-foreground">
                                {row.subject_code} — {row.subject_name}
                              </p>
                              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                                Paper {row.paper} · {formatTimeShort(row.examination_time)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
