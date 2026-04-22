"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  apiJson,
  getDepotSchoolScriptControl,
  getDepotSchools,
  setDepotScriptEnvelopeVerification,
  type DepotSchoolRow,
  type Examination,
  type MySchoolScriptControlResponse,
  type ScriptPaperSlotResponse,
  type ScriptSubjectRowResponse,
} from "@/lib/api";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWritten(examinationDate: string | null, todayIso: string): boolean {
  return examinationDate != null && examinationDate <= todayIso;
}

type SubjectPaperBuckets = {
  unverified: ScriptPaperSlotResponse[];
  notRecorded: ScriptPaperSlotResponse[];
  verified: ScriptPaperSlotResponse[];
};

type StatusKey = keyof SubjectPaperBuckets;

type SeriesRow = ScriptPaperSlotResponse["series"][number];

type SubjectCompletion = {
  totalSeries: number;
  completedSeries: number;
  notRecordedSeries: number;
};

type StatusSeriesItem = {
  subject: Pick<ScriptSubjectRowResponse, "subject_id" | "subject_code" | "subject_name"> & {
    completion: SubjectCompletion;
  };
  paper: Pick<ScriptPaperSlotResponse, "paper_number" | "examination_date">;
  series: SeriesRow;
};

type SubjectGroup = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  completion: SubjectCompletion;
  papers: PaperGroup[];
};

type PaperGroup = {
  paper_number: number;
  examination_date: string | null;
  series: SeriesRow[];
};

type StatusGroup = {
  key: StatusKey;
  title: string;
  description: string;
  emptyLabel: string;
  subjects: SubjectGroup[];
};

const statusToneClass: Record<StatusKey, string> = {
  unverified: "border-amber-300/60 bg-amber-50/50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100",
  notRecorded:
    "border-red-300/60 bg-red-50/50 text-red-900 dark:border-red-700/60 dark:bg-red-950/30 dark:text-red-100",
  verified:
    "border-emerald-300/60 bg-emerald-50/50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-100",
};

function buildSubjectCompletion(subject: ScriptSubjectRowResponse, todayIso: string): SubjectCompletion {
  let totalSeries = 0;
  let completedSeries = 0;
  let notRecordedSeries = 0;
  for (const paper of subject.papers) {
    if (!isWritten(paper.examination_date ?? null, todayIso)) continue;
    for (const series of paper.series) {
      totalSeries += 1;
      if (series.packing == null) notRecordedSeries += 1;
      else if (series.verified) completedSeries += 1;
    }
  }
  return { totalSeries, completedSeries, notRecordedSeries };
}

function buildStatusGroups(
  subjects: ScriptSubjectRowResponse[],
  todayIso: string,
): Record<StatusKey, StatusSeriesItem[]> {
  const grouped: Record<StatusKey, StatusSeriesItem[]> = {
    unverified: [],
    notRecorded: [],
    verified: [],
  };

  for (const subject of subjects) {
    const completion = buildSubjectCompletion(subject, todayIso);
    if (completion.totalSeries === 0) continue;
    const subjectStatus: StatusKey =
      completion.completedSeries === completion.totalSeries
        ? "verified"
        : completion.notRecordedSeries > 0
          ? "notRecorded"
          : "unverified";

    for (const paper of subject.papers) {
      if (!isWritten(paper.examination_date ?? null, todayIso)) continue;
      for (const series of paper.series) {
        grouped[subjectStatus].push({
          subject: {
            subject_id: subject.subject_id,
            subject_code: subject.subject_code,
            subject_name: subject.subject_name,
            completion,
          },
          paper: {
            paper_number: paper.paper_number,
            examination_date: paper.examination_date,
          },
          series,
        });
      }
    }
  }

  return grouped;
}

function nestBySubjectPaper(items: StatusSeriesItem[]): SubjectGroup[] {
  const subjectMap = new Map<number, SubjectGroup>();

  for (const item of items) {
    const existingSubject = subjectMap.get(item.subject.subject_id);
    const subjectGroup: SubjectGroup =
      existingSubject ??
      ({
        subject_id: item.subject.subject_id,
        subject_code: item.subject.subject_code,
        subject_name: item.subject.subject_name,
        completion: item.subject.completion,
        papers: [],
      } as SubjectGroup);

    const paper = subjectGroup.papers.find((p) => p.paper_number === item.paper.paper_number);
    if (paper) {
      paper.series.push(item.series);
    } else {
      subjectGroup.papers.push({
        paper_number: item.paper.paper_number,
        examination_date: item.paper.examination_date,
        series: [item.series],
      });
    }

    subjectMap.set(subjectGroup.subject_id, subjectGroup);
  }

  return Array.from(subjectMap.values())
    .map((subject) => ({
      ...subject,
      papers: [...subject.papers].sort((a, b) => a.paper_number - b.paper_number),
    }))
    .sort((a, b) => a.subject_code.localeCompare(b.subject_code));
}

function countEnvelopes(groups: SubjectGroup[]): number {
  return groups.reduce(
    (acc, subject) =>
      acc +
      subject.papers.reduce(
        (paperAcc, paper) =>
          paperAcc +
          paper.series.reduce(
            (seriesAcc, series) => seriesAcc + (series.packing?.envelopes.length ?? 0),
            0,
          ),
        0,
      ),
    0,
  );
}

/** Envelope rows and booklet sums from recorded packing only. */
function subjectPackingTotals(subject: SubjectGroup): { envelopeCount: number; totalBooklets: number } {
  let envelopeCount = 0;
  let totalBooklets = 0;
  for (const paper of subject.papers) {
    for (const ser of paper.series) {
      const envs = ser.packing?.envelopes;
      if (!envs?.length) continue;
      envelopeCount += envs.length;
      for (const e of envs) {
        totalBooklets += e.booklet_count;
      }
    }
  }
  return { envelopeCount, totalBooklets };
}

function seriesPackingTotals(packing: NonNullable<SeriesRow["packing"]>): {
  envelopeCount: number;
  totalBooklets: number;
} {
  const envs = packing.envelopes;
  return {
    envelopeCount: envs.length,
    totalBooklets: envs.reduce((s, e) => s + e.booklet_count, 0),
  };
}

function paperPackingTotals(paper: PaperGroup): { envelopeCount: number; totalBooklets: number } {
  let envelopeCount = 0;
  let totalBooklets = 0;
  for (const ser of paper.series) {
    const envs = ser.packing?.envelopes;
    if (!envs?.length) continue;
    envelopeCount += envs.length;
    for (const e of envs) {
      totalBooklets += e.booklet_count;
    }
  }
  return { envelopeCount, totalBooklets };
}

export default function DepotKeeperScriptsControlPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [schools, setSchools] = useState<DepotSchoolRow[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [data, setData] = useState<MySchoolScriptControlResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusKey>("unverified");
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    if (examId === null || selectedSchoolId.trim() === "") return;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await getDepotSchoolScriptControl(examId, selectedSchoolId);
      setData(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load script control data");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [examId, selectedSchoolId]);

  useEffect(() => {
    async function init() {
      setLoadError(null);
      try {
        const list = await apiJson<Examination[]>("/examinations/public-list");
        setExams(list);
        setExamId((prev) => (prev === null && list.length ? list[0].id : prev));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
        return;
      }
      try {
        const sc = await getDepotSchools();
        setSchools(sc.items);
        if (sc.items.length === 1) setSelectedSchoolId(sc.items[0].id);
      } catch (e) {
        setSchools([]);
        setLoadError(e instanceof Error ? e.message : "Failed to load depot schools");
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (examId !== null && selectedSchoolId.trim() !== "") void loadData();
    else setData(null);
  }, [examId, selectedSchoolId, loadData]);

  useEffect(() => {
    setActiveStatus("unverified");
    setExpandedSubjects({});
  }, [examId, selectedSchoolId]);

  const statusGroups = useMemo<StatusGroup[]>(() => {
    if (!data) return [];
    const grouped = buildStatusGroups(data.subjects, localTodayIso());
    return [
      {
        key: "unverified",
        title: "Unverified",
        description:
          "Exam written and recorded by inspector, but envelope verification is pending at depot.",
        emptyLabel: "No unverified series for this selection.",
        subjects: nestBySubjectPaper(grouped.unverified),
      },
      {
        key: "notRecorded",
        title: "Not recorded",
        description:
          "Written papers where inspector packing is incomplete for this subject. Either no packing has been entered for one or more series yet, or some series are recorded while others are still missing. You can verify at the depot only after every series for the subject has been recorded.",
        emptyLabel:
          "No subjects with missing or partial inspector recordings for this selection.",
        subjects: nestBySubjectPaper(grouped.notRecorded),
      },
      {
        key: "verified",
        title: "Verified",
        description: "Recorded by inspector and fully verified by depot keeper.",
        emptyLabel: "No fully verified series yet for this selection.",
        subjects: nestBySubjectPaper(grouped.verified),
      },
    ];
  }, [data]);

  const activeGroup = useMemo(
    () => statusGroups.find((group) => group.key === activeStatus) ?? null,
    [statusGroups, activeStatus],
  );

  async function onToggleVerify(
    subjectId: number,
    paperNumber: number,
    seriesNumber: number,
    envelopeNumber: number,
    verified: boolean,
  ) {
    if (examId === null || selectedSchoolId.trim() === "") return;
    const key = `${subjectId}-${paperNumber}-${seriesNumber}-${envelopeNumber}`;
    setActionError(null);
    setVerifyingKey(key);
    try {
      await setDepotScriptEnvelopeVerification(examId, selectedSchoolId, {
        subject_id: subjectId,
        paper_number: paperNumber,
        series_number: seriesNumber,
        envelope_number: envelopeNumber,
        verified,
      });
      await loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Verification update failed");
    } finally {
      setVerifyingKey(null);
    }
  }

  return (
    <RoleGuard expectedRole="DEPOT_KEEPER" loginHref="/login/depot-keeper">
      <DashboardShell title="Worked Scripts Control (Verify)" staffRole="depot-keeper">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Select a school in your depot and an examination. Verify the number of worked scripts(answer booklets) recorded on each envelope by the inspector.
          </p>

          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {actionError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="dk-script-exam" className={formLabelClass}>
                Examination
              </label>
              <select
                id="dk-script-exam"
                className={`mt-1 w-full ${formInputClass}`}
                value={examId ?? ""}
                onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
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
            <div>
              <label htmlFor="dk-script-school" className={formLabelClass}>
                School
              </label>
              <select
                id="dk-script-school"
                className={`mt-1 w-full ${formInputClass}`}
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
              >
                <option value="">Select school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {busy && data === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {data && data.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No script control rows for this selection.</p>
          ) : null}

          {data && data.subjects.length > 0 ? (
            <div className="space-y-6">
              {statusGroups.every((group) => group.subjects.length === 0) ? (
                <p className="text-sm text-muted-foreground">No written papers yet for this selection.</p>
              ) : (
                <>
                  <div className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-xl border border-border bg-background/95 px-1 py-1 backdrop-blur supports-backdrop-filter:bg-background/80">
                    <div className="flex min-w-max gap-1">
                      {statusGroups.map((group) => {
                        const paperCount = group.subjects.reduce((acc, subject) => acc + subject.papers.length, 0);
                        const isActive = activeStatus === group.key;
                        return (
                          <button
                            key={group.key}
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 ${
                              isActive
                                ? statusToneClass[group.key]
                                : "border-input-border bg-background hover:bg-muted"
                            }`}
                            onClick={() => setActiveStatus(group.key)}
                          >
                            <span className="block font-medium">{group.title}</span>
                            <span className="block text-xs opacity-80">
                              {group.subjects.length} subject{group.subjects.length === 1 ? "" : "s"} · {paperCount}{" "}
                              paper{paperCount === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activeGroup ? (() => {
                    const group = activeGroup;
                    const paperCount = group.subjects.reduce((acc, subject) => acc + subject.papers.length, 0);
                    const seriesCount = group.subjects.reduce(
                      (acc, subject) =>
                        acc + subject.papers.reduce((paperAcc, paper) => paperAcc + paper.series.length, 0),
                      0,
                    );
                    const envelopeCount = countEnvelopes(group.subjects);
                    return (
                      <section key={group.key} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                        <div className="flex flex-col gap-2">
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">
                              {group.title}
                              <span
                                className={`ml-2 inline-flex rounded-full border px-2 py-0.5 align-middle text-xs font-medium ${statusToneClass[group.key]}`}
                              >
                                Active
                              </span>
                            </h2>
                            <p className="text-sm text-muted-foreground">{group.description}</p>
                            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                Subjects:{" "}
                                <span className="font-semibold tabular-nums text-foreground">{group.subjects.length}</span>
                              </span>
                              <span className="text-border">·</span>
                              <span>
                                Papers:{" "}
                                <span className="font-semibold tabular-nums text-foreground">{paperCount}</span>
                              </span>
                              <span className="text-border">·</span>
                              <span>
                                Series:{" "}
                                <span className="font-semibold tabular-nums text-foreground">{seriesCount}</span>
                              </span>
                              <span className="text-border">·</span>
                              <span>
                                Envelopes:{" "}
                                <span className="text-base font-bold tabular-nums text-foreground">
                                  {envelopeCount}
                                </span>
                              </span>
                            </p>
                          </div>
                        </div>

                        {group.subjects.length === 0 ? (
                          <p className="mt-4 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                            {group.emptyLabel}
                          </p>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {group.subjects.map((subject) => {
                              const subjectKey = `${group.key}-${subject.subject_id}`;
                              const subjectOpen = expandedSubjects[subjectKey] ?? false;
                              const subjectSeriesCount = subject.papers.reduce(
                                (acc, paper) => acc + paper.series.length,
                                0,
                              );
                              const packingTotals = subjectPackingTotals(subject);
                              return (
                                <div
                                  key={subjectKey}
                                  className="rounded-xl border border-border/80 bg-background/40 p-3"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-foreground">
                                        {subject.subject_code} — {subject.subject_name}
                                      </p>
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        {subject.papers.length} paper{subject.papers.length === 1 ? "" : "s"} ·{" "}
                                        {subjectSeriesCount} series
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-lg border border-input-border bg-background px-2.5 py-1.5 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
                                      onClick={() =>
                                        setExpandedSubjects((prev) => ({
                                          ...prev,
                                          [subjectKey]: !subjectOpen,
                                        }))
                                      }
                                      aria-expanded={subjectOpen}
                                      aria-label={subjectOpen ? "Collapse subject" : "Expand subject"}
                                    >
                                      <span className="md:hidden">{subjectOpen ? "Hide" : "Show"}</span>
                                      <span className="hidden text-base leading-none md:inline">
                                        {subjectOpen ? "▾" : "▸"}
                                      </span>
                                    </button>
                                  </div>

                                  {!subjectOpen ? (
                                    <div className="mt-2 md:mt-1.5">
                                      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm leading-snug md:text-xs md:leading-tight">
                                        <span className="tabular-nums font-semibold text-foreground">
                                          {packingTotals.envelopeCount}
                                        </span>
                                        <span className="text-muted-foreground">env</span>
                                        <span className="text-border">·</span>
                                        <span className="tabular-nums font-semibold text-foreground">
                                          {packingTotals.totalBooklets}
                                        </span>
                                        <span className="text-muted-foreground">booklets</span>
                                        <span className="text-border">·</span>
                                        <span className="tabular-nums font-semibold text-foreground">
                                          {subject.completion.completedSeries}/{subject.completion.totalSeries}
                                        </span>
                                        <span className="text-muted-foreground">series verified</span>
                                        <span className="text-border">·</span>
                                        <span className="tabular-nums font-medium text-foreground">
                                          {subject.completion.totalSeries === 0
                                            ? 0
                                            : Math.round(
                                                (subject.completion.completedSeries /
                                                  subject.completion.totalSeries) *
                                                  100,
                                              )}
                                          %
                                        </span>
                                      </p>
                                      <div className="mt-1.5 hidden h-1 overflow-hidden rounded-full bg-muted md:block">
                                        <div
                                          className="h-full rounded-full bg-primary transition-all"
                                          style={{
                                            width: `${
                                              subject.completion.totalSeries === 0
                                                ? 0
                                                : Math.round(
                                                    (subject.completion.completedSeries /
                                                      subject.completion.totalSeries) *
                                                      100,
                                                  )
                                            }%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 rounded-lg border border-border/80 bg-card px-3 py-3 shadow-sm">
                                      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Envelopes
                                          </p>
                                          <p className="mt-1 text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground">
                                            {packingTotals.envelopeCount}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Total booklets
                                          </p>
                                          <p className="mt-1 text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground">
                                            {packingTotals.totalBooklets}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-3 border-t border-border/70 pt-3">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                          <span>
                                            Verification: {subject.completion.completedSeries}/
                                            {subject.completion.totalSeries} series
                                          </span>
                                          <span className="tabular-nums font-medium text-foreground">
                                            {subject.completion.totalSeries === 0
                                              ? 0
                                              : Math.round(
                                                  (subject.completion.completedSeries /
                                                    subject.completion.totalSeries) *
                                                    100,
                                                )}
                                            %
                                          </span>
                                        </div>
                                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                                          <div
                                            className="h-full rounded-full bg-primary transition-all"
                                            style={{
                                              width: `${
                                                subject.completion.totalSeries === 0
                                                  ? 0
                                                  : Math.round(
                                                      (subject.completion.completedSeries /
                                                        subject.completion.totalSeries) *
                                                        100,
                                                    )
                                              }%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {subjectOpen ? (
                                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                      {subject.papers.map((paper) => {
                                        const paperTotals = paperPackingTotals(paper);
                                        return (
                                          <div
                                            key={`${subjectKey}-p${paper.paper_number}`}
                                            className="rounded-lg border border-border/70 bg-background/70 p-3"
                                          >
                                            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between">
                                              <p className="text-sm font-semibold text-foreground">
                                                Paper {paper.paper_number}
                                                {paper.examination_date ? (
                                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                    {paper.examination_date}
                                                  </span>
                                                ) : null}
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                  {paper.series.length} series
                                                </span>
                                              </p>
                                              {(paperTotals.envelopeCount > 0 || paperTotals.totalBooklets > 0) && (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                                  <span className="text-muted-foreground">
                                                    <span className="font-semibold tabular-nums text-foreground">
                                                      {paperTotals.envelopeCount}
                                                    </span>{" "}
                                                    env.
                                                  </span>
                                                  <span className="text-muted-foreground">
                                                    <span className="font-semibold tabular-nums text-foreground">
                                                      {paperTotals.totalBooklets}
                                                    </span>{" "}
                                                    booklets
                                                  </span>
                                                </div>
                                              )}
                                            </div>

                                            <div className="mt-3 space-y-2">
                                              {paper.series.map((ser) => {
                                                const packing = ser.packing;
                                                const st = packing ? seriesPackingTotals(packing) : null;
                                                return (
                                                  <div
                                                    key={`${subjectKey}-p${paper.paper_number}-s${ser.series_number}`}
                                                    className="rounded-md border border-border/70 bg-background px-3 py-2"
                                                  >
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                      <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-foreground">
                                                          Series {ser.series_number}
                                                        </p>
                                                        {!packing ? (
                                                          <p className="mt-1 text-xs text-muted-foreground">
                                                            Not recorded by inspector
                                                          </p>
                                                        ) : (
                                                          <>
                                                            <div className="mt-2 grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-card/90 px-2 py-2">
                                                              <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                  Envelopes
                                                                </p>
                                                                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                                                                  {st!.envelopeCount}
                                                                </p>
                                                              </div>
                                                              <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                  Booklets
                                                                </p>
                                                                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                                                                  {st!.totalBooklets}
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                  in series
                                                                </p>
                                                              </div>
                                                            </div>
                                                            <p className="mt-2 text-xs text-muted-foreground">
                                                              {ser.verified ? (
                                                                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                                                  Fully verified
                                                                </span>
                                                              ) : (
                                                                <>
                                                                  Pending verification on one or more envelopes below.
                                                                </>
                                                              )}
                                                            </p>
                                                          </>
                                                        )}
                                                      </div>
                                                    </div>

                                                    {packing ? (
                                                      packing.envelopes.length === 0 ? (
                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                          No envelopes recorded in this series.
                                                        </p>
                                                      ) : (
                                                        <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
                                                          {packing.envelopes.map((env) => {
                                                            const vkey = `${subject.subject_id}-${paper.paper_number}-${ser.series_number}-${env.envelope_number}`;
                                                            const verifying = verifyingKey === vkey;
                                                            const done = env.verified === true;
                                                            return (
                                                              <li
                                                                key={env.envelope_number}
                                                                className="flex flex-col gap-2 rounded-md bg-background/50 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                                                              >
                                                                <div className="min-w-0">
                                                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                                    <span className="text-sm font-medium text-foreground">
                                                                      Envelope {env.envelope_number}
                                                                    </span>
                                                                    <span className="rounded-md bg-muted/80 px-2 py-0.5 text-base font-bold tabular-nums text-foreground">
                                                                      {env.booklet_count}
                                                                    </span>
                                                                    <span className="text-xs font-medium text-muted-foreground">
                                                                      booklet{env.booklet_count === 1 ? "" : "s"}
                                                                    </span>
                                                                  </div>
                                                                  {done ? (
                                                                    <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                                                      Verified
                                                                    </p>
                                                                  ) : (
                                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                                      Not verified
                                                                    </p>
                                                                  )}
                                                                </div>
                                                                <button
                                                                  type="button"
                                                                  className={
                                                                    done
                                                                      ? "inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 sm:w-auto"
                                                                      : `${btnPrimary} w-full sm:w-auto`
                                                                  }
                                                                  disabled={busy || verifying}
                                                                  onClick={() =>
                                                                    void onToggleVerify(
                                                                      subject.subject_id,
                                                                      paper.paper_number,
                                                                      ser.series_number,
                                                                      env.envelope_number,
                                                                      !done,
                                                                    )
                                                                  }
                                                                >
                                                                  {verifying
                                                                    ? done
                                                                      ? "Unverifying…"
                                                                      : "Verifying…"
                                                                    : done
                                                                      ? "Unverify"
                                                                      : "Verify"}
                                                                </button>
                                                              </li>
                                                            );
                                                          })}
                                                        </ul>
                                                      )
                                                    ) : null}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })() : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
