"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  getMyCenterProgrammes,
  getStaffCentreDaySummary,
  getStaffCentreOverview,
  type CentreScopeProgrammeItem,
  type Examination,
  type StaffCentreDaySummaryResponse,
  type StaffCentreOverviewResponse,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  examDayInstructions,
  postExamInstructions,
  preExamInstructions,
  requiredDocumentsChecklist,
  supervisorNoticeClosing,
  supervisorNoticeIntro,
  supervisorNoticeTitle,
} from "@/lib/supervisor-notice-content";

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function nowStampLabel(): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function sortedProgrammes(items: CentreScopeProgrammeItem[]): CentreScopeProgrammeItem[] {
  return [...items].sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
}

export default function SupervisorNoticePage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [overview, setOverview] = useState<StaffCentreOverviewResponse | null>(null);
  const [programmes, setProgrammes] = useState<CentreScopeProgrammeItem[]>([]);
  const [daySummary, setDaySummary] = useState<StaffCentreDaySummaryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    setError(null);
    try {
      const list = await apiJson<Examination[]>("/examinations/public-list");
      setExams(list);
      setExamId((prev) => {
        if (prev != null && list.some((it) => it.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (e) {
      setExams([]);
      setExamId(null);
      setError(e instanceof Error ? e.message : "Could not load examinations");
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (examId == null) {
      setOverview(null);
      setProgrammes([]);
      setDaySummary(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);

    async function loadNoticeData() {
      try {
        const [overviewData, programmesData] = await Promise.all([
          getStaffCentreOverview(examId),
          getMyCenterProgrammes(),
        ]);
        if (cancelled) return;
        setOverview(overviewData);
        setProgrammes(sortedProgrammes(programmesData.programmes));

        const focusDate =
          overviewData.sessions_today && overviewData.sessions_today.length > 0
            ? overviewData.sessions_today[0].examination_date
            : overviewData.upcoming.length > 0
              ? overviewData.upcoming[0].examination_date
              : null;
        if (!focusDate) {
          setDaySummary(null);
          return;
        }
        const summary = await getStaffCentreDaySummary(examId, focusDate);
        if (!cancelled) setDaySummary(summary);
      } catch (e) {
        if (!cancelled) {
          setOverview(null);
          setProgrammes([]);
          setDaySummary(null);
          setError(e instanceof Error ? e.message : "Could not load supervisor notice data");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void loadNoticeData();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const activeExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [exams, examId]);
  const firstRows = daySummary ? daySummary.slots.slice(0, 4) : [];

  return (
    <RoleGuard expectedRole="SUPERVISOR" loginHref="/login/supervisor">
      <DashboardShell title="Supervisor notice" staffRole="supervisor">
        <div className="space-y-5">
          <div className="max-w-md">
            <label htmlFor="supervisor-notice-exam" className={formLabelClass}>
              Examination
            </label>
            <select
              id="supervisor-notice-exam"
              className={`mt-1 w-full ${formInputClass}`}
              value={examId ?? ""}
              onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
              disabled={exams.length === 0 || busy}
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

          {busy && !overview ? <p className="text-sm text-muted-foreground">Loading notice…</p> : null}

          {activeExam && overview ? (
            <article className="supervisor-notice-onepage mx-auto rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <header className="mb-4 border-b border-border pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Supervisor notice
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {activeExam.exam_type} {activeExam.exam_series ? `${activeExam.exam_series} ` : ""}
                  {activeExam.year}
                </h2>
                <p className="mt-1 text-sm font-medium text-foreground">{supervisorNoticeTitle}</p>
                <p className="text-sm text-muted-foreground">Generated: {nowStampLabel()}</p>
                <p className="mt-2 text-sm text-foreground">{supervisorNoticeIntro}</p>
              </header>

              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <section className="space-y-4">
                  <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <h3 className="text-sm font-semibold text-foreground">As a Principal and Supervisor, you are responsible for</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                      {preExamInstructions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <h3 className="text-sm font-semibold text-foreground">During the examination period</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                      {examDayInstructions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <h3 className="text-sm font-semibold text-foreground">After the examinations</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                      {postExamInstructions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                    <h3 className="text-sm font-semibold text-foreground">Documents/details for your attention</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                      {requiredDocumentsChecklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="rounded-xl border border-border p-3">
                    <h3 className="text-sm font-semibold text-foreground">Centre summary</h3>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Candidates</dt>
                      <dd className="text-right font-semibold text-foreground">
                        {overview.candidate_count.toLocaleString()}
                      </dd>
                      <dt className="text-muted-foreground">Schools</dt>
                      <dd className="text-right font-semibold text-foreground">{overview.school_count.toLocaleString()}</dd>
                      <dt className="text-muted-foreground">Programmes</dt>
                      <dd className="text-right font-semibold text-foreground">{programmes.length.toLocaleString()}</dd>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    <h3 className="text-sm font-semibold text-foreground">Programmes at centre</h3>
                    {programmes.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">No programmes found.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {programmes.slice(0, 8).map((p) => (
                          <li key={p.id} className="flex justify-between gap-2">
                            <span className="truncate text-foreground" title={`${p.code} — ${p.name}`}>
                              {p.code} — {p.name}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{p.subject_count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                </section>
              </div>
            </article>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
