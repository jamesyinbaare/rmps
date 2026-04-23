"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  apiJson,
  getMyCenterQuestionPaperControl,
  upsertQuestionPaperSlot,
  type Examination,
  type MyCenterQuestionPaperControlResponse,
  type QuestionPaperSeriesSlotResponse,
} from "@/lib/api";

const btnPrimary =
  "inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnGhost =
  "inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-lg px-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-ring/30";

type SlotCounts = {
  copies_received: number;
  copies_used: number;
  copies_to_library: number;
  copies_remaining: number;
};

type QpPaperBundle = {
  subjectId: number;
  subjectCode: string;
  /** Prefer for display in recorded table (falls back to subjectCode). */
  subjectOriginalCode: string | null;
  subjectName: string;
  paperNumber: number;
  examinationDate: string | null;
  series: QuestionPaperSeriesSlotResponse[];
};

function displayRecordedSubjectCode(b: QpPaperBundle): string {
  return (b.subjectOriginalCode && b.subjectOriginalCode.trim() !== "" ? b.subjectOriginalCode : b.subjectCode).trim();
}

function slotKey(subjectId: number, paperNumber: number, seriesNumber: number) {
  return `${subjectId}-${paperNumber}-${seriesNumber}`;
}

function parseNonNegInt(raw: string): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function draftsFromData(data: MyCenterQuestionPaperControlResponse): Record<string, SlotCounts> {
  const out: Record<string, SlotCounts> = {};
  for (const sub of data.subjects) {
    for (const paper of sub.papers) {
      for (const ser of paper.series) {
        out[slotKey(sub.subject_id, paper.paper_number, ser.series_number)] = {
          copies_received: ser.copies_received,
          copies_used: ser.copies_used,
          copies_to_library: ser.copies_to_library,
          copies_remaining: ser.copies_remaining,
        };
      }
    }
  }
  return out;
}

function flattenToBundles(data: MyCenterQuestionPaperControlResponse): QpPaperBundle[] {
  const out: QpPaperBundle[] = [];
  for (const sub of data.subjects) {
    for (const paper of sub.papers) {
      out.push({
        subjectId: sub.subject_id,
        subjectCode: sub.subject_code,
        subjectOriginalCode: sub.subject_original_code != null ? sub.subject_original_code : null,
        subjectName: sub.subject_name,
        paperNumber: paper.paper_number,
        examinationDate: paper.examination_date,
        series: paper.series,
      });
    }
  }
  return out;
}

function allocationTotal(d: SlotCounts): number {
  return d.copies_used + d.copies_to_library + d.copies_remaining;
}

function countsConstraintMessage(d: SlotCounts): string | null {
  const alloc = allocationTotal(d);
  if (alloc > d.copies_received) {
    return `Used + library + remaining (${alloc}) cannot exceed received (${d.copies_received}).`;
  }
  return null;
}

function allSeriesRecorded(series: QuestionPaperSeriesSlotResponse[]): boolean {
  return series.every(
    (s) =>
      s.copies_received > 0 ||
      s.copies_used > 0 ||
      s.copies_to_library > 0 ||
      s.copies_remaining > 0,
  );
}

type GroupedQp = {
  upcoming: QpPaperBundle[];
  outstanding: QpPaperBundle[];
  completed: QpPaperBundle[];
};

function partitionQpPapers(bundles: QpPaperBundle[], today: string): GroupedQp {
  const upcoming: QpPaperBundle[] = [];
  const outstanding: QpPaperBundle[] = [];
  const completed: QpPaperBundle[] = [];

  for (const b of bundles) {
    const ed = b.examinationDate;
    if (ed && ed > today) {
      upcoming.push(b);
      continue;
    }
    if (allSeriesRecorded(b.series)) {
      completed.push(b);
    } else {
      outstanding.push(b);
    }
  }

  const dateSort = (a: QpPaperBundle, b: QpPaperBundle) => {
    const ad = a.examinationDate;
    const bd = b.examinationDate;
    if (ad == null && bd == null) return 0;
    if (ad == null) return 1;
    if (bd == null) return -1;
    return ad.localeCompare(bd);
  };

  const tieBreak = (a: QpPaperBundle, b: QpPaperBundle) =>
    a.subjectCode.localeCompare(b.subjectCode) || a.paperNumber - b.paperNumber;

  upcoming.sort((a, b) => {
    const c = dateSort(a, b);
    return c !== 0 ? c : tieBreak(a, b);
  });
  outstanding.sort((a, b) => {
    const c = dateSort(a, b);
    return c !== 0 ? c : tieBreak(a, b);
  });
  completed.sort((a, b) => {
    const c = dateSort(a, b);
    return c !== 0 ? c : tieBreak(a, b);
  });

  return { upcoming, outstanding, completed };
}

function outstandingHint(g: GroupedQp): string | null {
  if (g.outstanding.length > 0) return null;
  if (g.completed.length > 0) {
    return "All papers due so far are recorded. Use the table to review or edit.";
  }
  if (g.upcoming.length > 0) return "Nothing to record yet for now.";
  return null;
}

type CompletedTableRow = {
  bundle: QpPaperBundle;
  ser: QuestionPaperSeriesSlotResponse;
};

type CompletedTableGroup = {
  key: string;
  bundle: QpPaperBundle;
  rows: CompletedTableRow[];
};

type SubjectOutstandingGroup = {
  key: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  bundles: QpPaperBundle[];
};

type SubjectCompletedGroup = {
  key: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  groups: CompletedTableGroup[];
};

function flattenCompletedToRows(bundles: QpPaperBundle[]): CompletedTableRow[] {
  const rows: CompletedTableRow[] = [];
  for (const b of bundles) {
    for (const ser of b.series) {
      rows.push({ bundle: b, ser });
    }
  }
  return rows;
}

function groupCompletedRows(rows: CompletedTableRow[]): CompletedTableGroup[] {
  const map = new Map<string, CompletedTableGroup>();
  for (const row of rows) {
    const key = `${row.bundle.subjectId}-${row.bundle.paperNumber}`;
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(key, { key, bundle: row.bundle, rows: [row] });
  }
  return Array.from(map.values());
}

function groupOutstandingBundlesBySubject(bundles: QpPaperBundle[]): SubjectOutstandingGroup[] {
  const map = new Map<string, SubjectOutstandingGroup>();
  for (const b of bundles) {
    const key = String(b.subjectId);
    const existing = map.get(key);
    if (existing) {
      existing.bundles.push(b);
      continue;
    }
    map.set(key, {
      key,
      subjectId: b.subjectId,
      subjectCode: displayRecordedSubjectCode(b),
      subjectName: b.subjectName,
      bundles: [b],
    });
  }
  return Array.from(map.values());
}

function groupCompletedGroupsBySubject(groups: CompletedTableGroup[]): SubjectCompletedGroup[] {
  const map = new Map<string, SubjectCompletedGroup>();
  for (const g of groups) {
    const key = String(g.bundle.subjectId);
    const existing = map.get(key);
    if (existing) {
      existing.groups.push(g);
      continue;
    }
    map.set(key, {
      key,
      subjectId: g.bundle.subjectId,
      subjectCode: displayRecordedSubjectCode(g.bundle),
      subjectName: g.bundle.subjectName,
      groups: [g],
    });
  }
  return Array.from(map.values());
}

export default function InspectorQuestionPaperControlPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [data, setData] = useState<MyCenterQuestionPaperControlResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SlotCounts>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [pastEdit, setPastEdit] = useState<CompletedTableRow | null>(null);

  const loadData = useCallback(async () => {
    if (examId === null) return;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await getMyCenterQuestionPaperControl(examId);
      setData(res);
      setDrafts(draftsFromData(res));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load question paper control");
      setData(null);
      setDrafts({});
    } finally {
      setBusy(false);
    }
  }, [examId]);

  useEffect(() => {
    async function loadExams() {
      setLoadError(null);
      try {
        const list = await apiJson<Examination[]>("/examinations/public-list");
        setExams(list);
        setExamId((prev) => (prev === null && list.length ? list[0].id : prev));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    }
    void loadExams();
  }, []);

  useEffect(() => {
    if (examId !== null) {
      void loadData();
    } else {
      setData(null);
      setDrafts({});
    }
    setPastEdit(null);
  }, [examId, loadData]);

  function updateDraft(key: string, patch: Partial<SlotCounts>) {
    setDrafts((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, ...patch } };
    });
  }

  async function saveSlot(subjectId: number, paperNumber: number, seriesNumber: number) {
    if (examId === null || data === null) return;
    const key = slotKey(subjectId, paperNumber, seriesNumber);
    const d = drafts[key];
    if (!d) return;
    const msg = countsConstraintMessage(d);
    if (msg) {
      setSlotError(msg);
      return;
    }
    setSlotError(null);
    setSavingKey(key);
    try {
      await upsertQuestionPaperSlot(examId, {
        subject_id: subjectId,
        paper_number: paperNumber,
        series_number: seriesNumber,
        copies_received: d.copies_received,
        copies_used: d.copies_used,
        copies_to_library: d.copies_to_library,
        copies_remaining: d.copies_remaining,
      });
      await loadData();
      setPastEdit(null);
    } catch (e) {
      setSlotError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  }

  const today = localTodayIso();
  const bundles = data && data.subjects.length > 0 ? flattenToBundles(data) : [];
  const grouped = bundles.length > 0 ? partitionQpPapers(bundles, today) : null;
  const hint = grouped ? outstandingHint(grouped) : null;
  const completedRows = grouped ? flattenCompletedToRows(grouped.completed) : [];
  const completedGroups = groupCompletedRows(completedRows);
  const outstandingSubjectGroups = grouped ? groupOutstandingBundlesBySubject(grouped.outstanding) : [];
  const completedSubjectGroups = groupCompletedGroupsBySubject(completedGroups);

  function renderSeriesFormBlock(
    bundle: QpPaperBundle,
    ser: QuestionPaperSeriesSlotResponse,
    options: { showCancel?: boolean } = {},
  ) {
    const { showCancel = false } = options;
    if (ser.verified) {
      return (
        <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-3">
          <p className="text-sm font-medium text-foreground">Confirmed by depot keeper</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This slot can no longer be edited by the inspector.
          </p>
        </div>
      );
    }
    const key = slotKey(bundle.subjectId, bundle.paperNumber, ser.series_number);
    const d = drafts[key] ?? {
      copies_received: ser.copies_received,
      copies_used: ser.copies_used,
      copies_to_library: ser.copies_to_library,
      copies_remaining: ser.copies_remaining,
    };
    const constraint = countsConstraintMessage(d);
    const alloc = allocationTotal(d);
    const saving = savingKey === key;

    return (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <label className={formLabelClass} htmlFor={`${key}-recv`}>
              Received
            </label>
            <input
              id={`${key}-recv`}
              type="number"
              min={0}
              inputMode="numeric"
              className={formInputClass}
              value={d.copies_received}
              onChange={(e) => updateDraft(key, { copies_received: parseNonNegInt(e.target.value) })}
              disabled={busy || saving}
              aria-invalid={constraint ? true : undefined}
            />
          </div>
          <div className="min-w-0">
            <label className={formLabelClass} htmlFor={`${key}-used`}>
              Used
            </label>
            <input
              id={`${key}-used`}
              type="number"
              min={0}
              inputMode="numeric"
              className={formInputClass}
              value={d.copies_used}
              onChange={(e) => updateDraft(key, { copies_used: parseNonNegInt(e.target.value) })}
              disabled={busy || saving}
              aria-invalid={constraint ? true : undefined}
            />
          </div>
          <div className="min-w-0">
            <label className={formLabelClass} htmlFor={`${key}-lib`}>
              To library
            </label>
            <input
              id={`${key}-lib`}
              type="number"
              min={0}
              inputMode="numeric"
              className={formInputClass}
              value={d.copies_to_library}
              onChange={(e) => updateDraft(key, { copies_to_library: parseNonNegInt(e.target.value) })}
              disabled={busy || saving}
              aria-invalid={constraint ? true : undefined}
            />
          </div>
          <div className="min-w-0">
            <label className={formLabelClass} htmlFor={`${key}-rem`}>
              Remaining
            </label>
            <input
              id={`${key}-rem`}
              type="number"
              min={0}
              inputMode="numeric"
              className={formInputClass}
              value={d.copies_remaining}
              onChange={(e) => updateDraft(key, { copies_remaining: parseNonNegInt(e.target.value) })}
              disabled={busy || saving}
              aria-invalid={constraint ? true : undefined}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Used:{" "}
          <span className="font-medium tabular-nums text-foreground">{alloc}</span>
          {constraint ? <span className="mt-1 block text-destructive">{constraint}</span> : null}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btnPrimary} ${!showCancel ? "w-full sm:w-auto" : ""}`}
            disabled={busy || saving || Boolean(constraint)}
            onClick={() => void saveSlot(bundle.subjectId, bundle.paperNumber, ser.series_number)}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {showCancel ? (
            <button type="button" className={btnSecondary} disabled={busy || saving} onClick={() => setPastEdit(null)}>
              Cancel
            </button>
          ) : null}
        </div>
      </>
    );
  }

  function renderSeriesSlotOutstanding(bundle: QpPaperBundle, ser: QuestionPaperSeriesSlotResponse) {
    const showSeries = bundle.series.length > 1;

    return (
      <li
        key={ser.series_number}
        className="rounded-xl border border-border/70 bg-background px-3 py-4 sm:px-4"
      >
        {showSeries ? (
          <p className="mb-3 text-sm font-semibold text-foreground">Series {ser.series_number}</p>
        ) : null}
        {renderSeriesFormBlock(bundle, ser, { showCancel: false })}
      </li>
    );
  }

  function renderPaperBundleOutstanding(bundle: QpPaperBundle) {
    return (
      <ul className="mt-3 space-y-3">
        {bundle.series.map((ser) => renderSeriesSlotOutstanding(bundle, ser))}
      </ul>
    );
  }

  function renderOutstandingBundleList(items: SubjectOutstandingGroup[]) {
    return (
      <div className="space-y-6">
        {items.map((subjectGroup, idx) => (
          <details key={subjectGroup.key} className="group rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" open={idx === 0}>
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              <span>
                {subjectGroup.subjectCode} — {subjectGroup.subjectName}
                <span className="ml-2 font-normal text-muted-foreground">
                  · {subjectGroup.bundles.length} {subjectGroup.bundles.length === 1 ? "paper" : "papers"}
                </span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">Tap to expand/collapse</span>
            </summary>
            <div className="mt-3 space-y-4">
              {subjectGroup.bundles.map((bundle) => (
                <Fragment key={`${bundle.subjectId}-${bundle.paperNumber}`}>
                  <div className="rounded-xl border border-border/70 bg-card/30 p-3 sm:p-4">
                    <div className="text-sm font-semibold text-card-foreground">
                      Paper {bundle.paperNumber}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {bundle.examinationDate ? `· ${bundle.examinationDate}` : "· No date in timetable"}
                      </span>
                    </div>
                    <div className="mt-3">{renderPaperBundleOutstanding(bundle)}</div>
                  </div>
                </Fragment>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }

  function renderCompletedGroupTables(items: SubjectCompletedGroup[]) {
    return (
      <div className="space-y-3">
        {items.map((subjectGroup, idx) => (
          <details key={subjectGroup.key} className="group rounded-xl border border-border bg-card/40" open={idx === 0}>
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                <span>
                {subjectGroup.subjectCode} — {subjectGroup.subjectName}
                <span className="ml-2 font-normal text-muted-foreground">
                  · {subjectGroup.groups.length} {subjectGroup.groups.length === 1 ? "paper" : "papers"}
                </span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">Tap to expand/collapse</span>
            </summary>
            <div className="space-y-3 border-t border-border p-3 sm:p-4">
              {subjectGroup.groups.map((group) => (
                <div key={group.key} className="rounded-lg border border-border bg-background/40">
                  <div className="px-3 py-2 text-sm font-medium text-foreground">
                    Paper {group.bundle.paperNumber}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {group.bundle.examinationDate ?? "No date"}
                    </span>
                  </div>
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                      <caption className="sr-only">Recorded rows for one subject paper</caption>
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-3 py-2.5 font-semibold text-foreground">Series</th>
                          <th className="px-2 py-2.5 font-semibold text-foreground">Recv.</th>
                          <th className="px-2 py-2.5 font-semibold text-foreground">Used</th>
                          <th className="px-2 py-2.5 font-semibold text-foreground">Library</th>
                          <th className="px-2 py-2.5 font-semibold text-foreground">Rem.</th>
                          <th className="sticky right-0 bg-muted/40 px-3 py-2.5 font-semibold text-foreground">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map(({ bundle, ser }) => {
                          const k = slotKey(bundle.subjectId, bundle.paperNumber, ser.series_number);
                          const d = drafts[k] ?? {
                            copies_received: ser.copies_received,
                            copies_used: ser.copies_used,
                            copies_to_library: ser.copies_to_library,
                            copies_remaining: ser.copies_remaining,
                          };
                          return (
                            <tr key={k} className="border-b border-border/70 last:border-b-0">
                              <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums text-foreground">
                                {ser.series_number}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 align-middle tabular-nums">{d.copies_received}</td>
                              <td className="whitespace-nowrap px-2 py-2.5 align-middle tabular-nums">{d.copies_used}</td>
                              <td className="whitespace-nowrap px-2 py-2.5 align-middle tabular-nums">{d.copies_to_library}</td>
                              <td className="whitespace-nowrap px-2 py-2.5 align-middle tabular-nums">{d.copies_remaining}</td>
                              <td className="sticky right-0 bg-background px-2 py-2 align-middle sm:px-3">
                                {ser.verified ? (
                                  <span className="text-xs text-muted-foreground">Locked</span>
                                ) : (
                                  <button
                                    type="button"
                                    className={btnGhost}
                                    onClick={() => {
                                      setSlotError(null);
                                      setPastEdit({ bundle, ser });
                                    }}
                                  >
                                    Edit
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Question paper control" staffRole="inspector">
        <div className="space-y-6">
          <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-foreground">How this page works</p>
            <p className="text-sm text-muted-foreground">
              This page allows you to record the number of question paper copies received, used, and given to the school&apos;s library for each subject, paper, and series.
            </p>

            <p className="text-sm text-muted-foreground">
              To record a count, simply enter the number of copies received, used, and sent to the library for each paper.
            </p>
          </div>

          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {slotError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {slotError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <label htmlFor="qp-exam" className={formLabelClass}>
                Examination
              </label>
              <select
                id="qp-exam"
                className={`${formInputClass} max-w-none`}
                value={examId ?? ""}
                onChange={(e) => {
                  setExamId(e.target.value ? Number(e.target.value) : null);
                  setSlotError(null);
                }}
                disabled={busy || exams.length === 0}
              >
                {exams.length === 0 ? <option value="">No examinations</option> : null}
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.exam_type} {ex.year}
                    {ex.exam_series ? ` (${ex.exam_series})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {data && data.subjects.length > 0 ? (
              <button type="button" className={btnSecondary} disabled={busy} onClick={() => void loadData()}>
                Refresh data
              </button>
            ) : null}
          </div>

          {data ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
              <span className="font-semibold">Centre:</span> {data.center_name}{" "}
              <span className="text-muted-foreground">({data.center_code})</span>
            </div>
          ) : null}

          {busy && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

          {data && data.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subjects in scope for this examination (check registrations and timetable).
            </p>
          ) : null}

          {grouped ? (
            <div className="space-y-8">
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-foreground">
                  Needs records
                  {grouped.outstanding.length > 0 ? (
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({grouped.outstanding.length}{" "}
                      {grouped.outstanding.length === 1 ? "paper" : "papers"})
                    </span>
                  ) : (
                    <span className="ml-2 font-normal text-muted-foreground">(none)</span>
                  )}
                </h2>
                {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
                {grouped.outstanding.length > 0 ? (
                  renderOutstandingBundleList(outstandingSubjectGroups)
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                    No papers waiting for first-time entry.
                  </p>
                )}
              </section>

              {completedRows.length > 0 ? (
                <section className="space-y-3 border-t border-border pt-8">
                  <h2 className="text-base font-semibold text-foreground">
                    Past papers — recorded
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({completedRows.length} {completedRows.length === 1 ? "row" : "rows"})
                    </span>
                  </h2>

                  {renderCompletedGroupTables(completedSubjectGroups)}
                </section>
              ) : null}

            </div>
          ) : null}

        </div>

        {pastEdit ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-0 sm:items-center sm:p-4"
            role="presentation"
            onClick={() => setPastEdit(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="qp-past-edit-title"
              className="max-h-[min(90vh,100%)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:rounded-2xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="qp-past-edit-title" className="text-lg font-semibold text-foreground">
                Edit question paper counts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {displayRecordedSubjectCode(pastEdit.bundle)} — {pastEdit.bundle.subjectName} · Paper{" "}
                {pastEdit.bundle.paperNumber}
                {pastEdit.bundle.series.length > 1 ? ` · Series ${pastEdit.ser.series_number}` : ""}
              </p>
              <div className="mt-4">{renderSeriesFormBlock(pastEdit.bundle, pastEdit.ser, { showCancel: true })}</div>
            </div>
          </div>
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
