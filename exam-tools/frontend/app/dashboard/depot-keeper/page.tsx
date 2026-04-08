"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { StaffDashboardOverview } from "@/components/staff-dashboard-overview";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { apiJson, getDepotSchoolScriptControl, getDepotSchools, type Examination, type ScriptEnvelopeItem } from "@/lib/api";

type EnvelopeSummary = {
  verified: number;
  unverified: number;
  notSubmittedSeries: number;
};

function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DepotKeeperDashboardPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [summary, setSummary] = useState<EnvelopeSummary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const todayIso = useMemo(() => localTodayIso(), []);

  const loadSummary = useCallback(async (id: number) => {
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const schools = await getDepotSchools();
      const results = await Promise.all(
        schools.items.map((s) => getDepotSchoolScriptControl(id, s.id)),
      );
      let verified = 0;
      let unverified = 0;
      let notSubmittedSeries = 0;

      for (const res of results) {
        for (const sub of res.subjects) {
          for (const paper of sub.papers) {
            const written = paper.examination_date != null && paper.examination_date <= todayIso;
            for (const ser of paper.series) {
              if (written && ser.packing == null) {
                notSubmittedSeries += 1;
                continue;
              }
              const envs: ScriptEnvelopeItem[] = ser.packing?.envelopes ?? [];
              for (const e of envs) {
                if (e.verified) verified += 1;
                else unverified += 1;
              }
            }
          }
        }
      }
      setSummary({ verified, unverified, notSubmittedSeries });
    } catch (e) {
      setSummary(null);
      setSummaryError(e instanceof Error ? e.message : "Could not load summary");
    } finally {
      setSummaryBusy(false);
    }
  }, [todayIso]);

  useEffect(() => {
    async function init() {
      setInitError(null);
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
        setInitError(e instanceof Error ? e.message : "Could not load examinations");
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (examId != null) void loadSummary(examId);
    else setSummary(null);
  }, [examId, loadSummary]);

  const scriptsSummaryBlock = (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div>
        <p className="text-base font-semibold text-foreground">Scripts summary</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Verified vs unverified envelopes across all schools in your depot for the selected examination.
        </p>
      </div>

      {summaryError ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {summaryError}
        </p>
      ) : null}

      {summaryBusy ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading summary…</p>
      ) : summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-xs text-muted-foreground">Verified envelopes</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{summary.verified}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-xs text-muted-foreground">Unverified envelopes</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{summary.unverified}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-xs text-muted-foreground">Not submitted (written series)</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{summary.notSubmittedSeries}</p>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <RoleGuard expectedRole="DEPOT_KEEPER" loginHref="/login/depot-keeper">
      <DashboardShell title="Depot keeper dashboard" staffRole="depot-keeper">
        <div className="space-y-6">

          <div>
            <label htmlFor="dk-dashboard-exam" className={formLabelClass}>
              Examination
            </label>
            <select
              id="dk-dashboard-exam"
              className={`mt-1 w-full max-w-md ${formInputClass}`}
              value={examId ?? ""}
              onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
              disabled={exams.length === 0}
            >
              {exams.length === 0 ? <option value="">No examinations</option> : null}
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.year}
                  {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                </option>
              ))}
            </select>
          </div>

          {initError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {initError}
            </p>
          ) : null}

          <StaffDashboardOverview
            variant="depot"
            depotFrontPage
            controlledExam={{
              exams,
              examId,
              onExamIdChange: setExamId,
            }}
            depotLearnMoreFooter={scriptsSummaryBlock}
          />
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
