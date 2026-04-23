"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  apiJson,
  deleteScriptSeries,
  getMySchoolScriptControl,
  upsertScriptSeries,
  type Examination,
  type MyCenterSchoolsResponse,
  type MySchoolScriptControlResponse,
  type ScriptEnvelopeItem,
  type ScriptSeriesPackingResponse,
  type ScriptSeriesSlotResponse,
  type ScriptSubjectRowResponse,
} from "@/lib/api";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30";
const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30";
const btnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30";

type EditingState = {
  subjectId: number;
  paperNumber: number;
  seriesNumber: number;
};

type Draft = {
  envelopes: ScriptEnvelopeItem[];
};

type PaperBundle = {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  paperNumber: number;
  examinationDate: string | null;
  series: ScriptSeriesSlotResponse[];
};

type GroupedPapers = {
  upcoming: PaperBundle[];
  outstanding: PaperBundle[];
  completed: PaperBundle[];
};

function emptyDraft(): Draft {
  return { envelopes: [] };
}

function draftFromPacking(p: ScriptSeriesPackingResponse): Draft {
  return {
    envelopes: p.envelopes.map((e) => ({
      ...e,
      booklet_count: Math.max(0, e.booklet_count),
    })),
  };
}

function scriptCapsSummary(d: MySchoolScriptControlResponse): string {
  const g = d.scripts_per_envelope;
  const p1 = d.scripts_per_envelope_paper_1;
  const p2 = d.scripts_per_envelope_paper_2;
  if (p1 === p2 && p2 === g) {
    return `Each envelope may hold at most ${g} booklets.`;
  }
  if (p1 === p2) {
    return `Paper 1 and Paper 2: up to ${p1} booklets per envelope. Other papers: up to ${g} booklets per envelope.`;
  }
  return `Paper 1: up to ${p1}; Paper 2: up to ${p2}; other papers: up to ${g} booklets per envelope.`;
}

function maxBookletsForPaper(d: MySchoolScriptControlResponse, paperNumber: number): number {
  if (paperNumber === 1) return d.scripts_per_envelope_paper_1;
  if (paperNumber === 2) return d.scripts_per_envelope_paper_2;
  return d.scripts_per_envelope;
}

function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function partitionPapers(subjects: ScriptSubjectRowResponse[], today: string): GroupedPapers {
  const upcoming: PaperBundle[] = [];
  const outstanding: PaperBundle[] = [];
  const completed: PaperBundle[] = [];

  for (const sub of subjects) {
    for (const paper of sub.papers) {
      const bundle: PaperBundle = {
        subjectId: sub.subject_id,
        subjectCode: sub.subject_code,
        subjectName: sub.subject_name,
        paperNumber: paper.paper_number,
        examinationDate: paper.examination_date ?? null,
        series: paper.series,
      };
      const ed = bundle.examinationDate;
      if (ed && ed > today) {
        upcoming.push(bundle);
        continue;
      }
      const allPacked =
        bundle.series.length > 0 && bundle.series.every((s) => s.packing != null);
      if (allPacked) {
        completed.push(bundle);
      } else {
        outstanding.push(bundle);
      }
    }
  }

  const dateSort = (a: PaperBundle, b: PaperBundle) => {
    const ad = a.examinationDate;
    const bd = b.examinationDate;
    if (ad == null && bd == null) return 0;
    if (ad == null) return 1;
    if (bd == null) return -1;
    return ad.localeCompare(bd);
  };

  const tieBreak = (a: PaperBundle, b: PaperBundle) =>
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

function emptyOutstandingHint(g: GroupedPapers): string | null {
  if (g.outstanding.length > 0) return null;
  if (g.completed.length > 0 && g.upcoming.length > 0) {
    return "All papers due so far are packed. Expand “Past papers — packed” to review or edit. Upcoming papers are listed below.";
  }
  if (g.completed.length > 0) {
    return "All papers due so far are packed. Expand “Past papers — packed” below to review or edit.";
  }
  if (g.upcoming.length > 0) {
    return "No papers to pack yet — every scheduled paper is still in the future.";
  }
  return null;
}

export default function InspectorScriptsControlPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centerSchools, setCenterSchools] = useState<MyCenterSchoolsResponse | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [data, setData] = useState<MySchoolScriptControlResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (examId === null || selectedSchoolId.trim() === "") return;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await getMySchoolScriptControl(examId, selectedSchoolId);
      setData(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load script control data");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [examId, selectedSchoolId]);

  useEffect(() => {
    async function loadExamsAndScope() {
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
        const scope = await apiJson<MyCenterSchoolsResponse>("/examinations/timetable/my-center-schools");
        setCenterSchools(scope);
        if (scope.schools.length === 1) {
          setSelectedSchoolId(scope.schools[0].id);
        } else {
          setSelectedSchoolId("");
        }
      } catch (e) {
        setCenterSchools(null);
        setSelectedSchoolId("");
        setLoadError(e instanceof Error ? e.message : "Failed to load examination centre schools");
      }
    }
    loadExamsAndScope();
  }, []);

  useEffect(() => {
    if (examId !== null && selectedSchoolId.trim() !== "") {
      loadData();
    } else {
      setData(null);
    }
  }, [examId, selectedSchoolId, loadData]);

  function openEdit(
    subjectId: number,
    paperNumber: number,
    seriesNumber: number,
    packing: ScriptSeriesPackingResponse | null,
  ) {
    setEditing({ subjectId, paperNumber, seriesNumber });
    setFormError(null);
    setDraft(packing ? draftFromPacking(packing) : emptyDraft());
  }

  function closeEdit() {
    setEditing(null);
    setFormError(null);
  }

  async function onSave() {
    if (examId === null || selectedSchoolId.trim() === "" || editing === null || data === null) return;
    setFormError(null);

    const cap = maxBookletsForPaper(data, editing.paperNumber);
    for (const env of draft.envelopes) {
      if (env.booklet_count > cap) {
        setFormError(
          `Envelope ${env.envelope_number}: at most ${cap} booklets for paper ${editing.paperNumber}.`,
        );
        return;
      }
    }

    setBusy(true);
    try {
      await upsertScriptSeries(examId, selectedSchoolId, {
        subject_id: editing.subjectId,
        paper_number: editing.paperNumber,
        series_number: editing.seriesNumber,
        envelopes: draft.envelopes.map((e) => ({
          envelope_number: e.envelope_number,
          booklet_count: e.booklet_count,
        })),
      });
      await loadData();
      closeEdit();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onClear(subjectId: number, paperNumber: number, seriesNumber: number) {
    if (examId === null || selectedSchoolId.trim() === "") return;
    if (!window.confirm("Remove this packing record and all envelopes?")) return;
    setBusy(true);
    try {
      await deleteScriptSeries(examId, {
        school_id: selectedSchoolId,
        subject_id: subjectId,
        paper_number: paperNumber,
        series_number: seriesNumber,
      });
      await loadData();
      closeEdit();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function addEnvelope() {
    const next =
      draft.envelopes.length === 0
        ? 1
        : Math.max(...draft.envelopes.map((e) => e.envelope_number)) + 1;
    setDraft((d) => ({
      ...d,
      envelopes: [...d.envelopes, { envelope_number: next, booklet_count: 0 }],
    }));
  }

  function removeEnvelope(idx: number) {
    setDraft((d) => ({
      ...d,
      envelopes: d.envelopes.filter((_, i) => i !== idx),
    }));
  }

  function updateEnvelope(idx: number, patch: Partial<ScriptEnvelopeItem>) {
    setDraft((d) => ({
      ...d,
      envelopes: d.envelopes.map((e, i) => {
        if (i !== idx) return e;
        const next = { ...e, ...patch };
        if ("booklet_count" in patch) {
          next.booklet_count = Math.max(0, next.booklet_count);
        }
        return next;
      }),
    }));
  }

  const isEditingSlot = (subjectId: number, paperNumber: number, seriesNumber: number) =>
    editing !== null &&
    editing.subjectId === subjectId &&
    editing.paperNumber === paperNumber &&
    editing.seriesNumber === seriesNumber;

  const grouped = data && data.subjects.length > 0 ? partitionPapers(data.subjects, localTodayIso()) : null;
  const groupedHint = grouped ? emptyOutstandingHint(grouped) : null;

  function renderSeriesRow(
    subjectId: number,
    paperNumber: number,
    slot: ScriptSeriesSlotResponse,
    seriesCount: number,
  ) {
    const packing = slot.packing;
    const anyEnvelopeVerified = Boolean(packing?.envelopes?.some((e) => e.verified));
    const isEditing = isEditingSlot(subjectId, paperNumber, slot.series_number);
    const showSeriesLabel = seriesCount > 1;
    const capForPaper = data ? maxBookletsForPaper(data, paperNumber) : 50;
    const editingHasOverCap =
      isEditing && draft.envelopes.some((e) => e.booklet_count > capForPaper);
    return (
      <li
        key={slot.series_number}
        className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background/50 p-3"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {showSeriesLabel ? (
              <p className="text-sm font-medium text-foreground">Series {slot.series_number}</p>
            ) : null}
            {!isEditing ? (
              <p className={`text-xs text-muted-foreground ${showSeriesLabel ? "mt-1" : ""}`}>
                {packing ? (
                  <>
                    {packing.envelopes.length} envelope
                    {packing.envelopes.length === 1 ? "" : "s"},{" "}
                    {packing.envelopes.reduce((s, e) => s + e.booklet_count, 0)} booklets total
                  </>
                ) : (
                  "Not recorded"
                )}
              </p>
            ) : null}
            {!isEditing && anyEnvelopeVerified ? (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                You can&apos;t make changes to envelopes that have been verified or partially verified by depot keeper.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isEditing ? (
              <>
                {!anyEnvelopeVerified ? (
                  <>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={busy}
                      onClick={() => openEdit(subjectId, paperNumber, slot.series_number, packing)}
                    >
                      {packing ? "Edit" : "Add"}
                    </button>
                    {packing ? (
                      <button
                        type="button"
                        className={btnDanger}
                        disabled={busy}
                        onClick={() => onClear(subjectId, paperNumber, slot.series_number)}
                      >
                        Clear
                      </button>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {isEditing ? (
          <div className="mt-3 w-full space-y-3 border-t border-border pt-3">
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className={formLabelClass}>Envelopes</span>
                <button type="button" className={btnSecondary} onClick={addEnvelope}>
                  Add envelope
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Up to {capForPaper} booklets per envelope for Paper {paperNumber}.
                {paperNumber === 1 ? " Counts of 250 or more must be split into multiple envelopes." : ""}
              </p>
              {draft.envelopes.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Add envelopes and booklet counts, then save.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {draft.envelopes.map((env, idx) => (
                    <li
                      key={`${env.envelope_number}-${idx}`}
                      className="grid grid-cols-[auto_minmax(8rem,1fr)_auto] items-end gap-x-2 gap-y-1"
                    >
                      <div className="flex flex-col">
                        <label className={formLabelClass}>No.</label>
                        <input
                          type="number"
                          min={1}
                          className={`mt-1 w-20 ${formInputClass}`}
                          value={env.envelope_number}
                          onChange={(e) =>
                            updateEnvelope(idx, {
                              envelope_number: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                        />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <label className={formLabelClass}>Booklets</label>
                        <input
                          type="number"
                          min={0}
                          className={`mt-1 w-full min-w-0 ${formInputClass} ${
                            env.booklet_count > capForPaper ? "border-destructive" : ""
                          }`}
                          value={env.booklet_count}
                          onChange={(e) =>
                            updateEnvelope(idx, {
                              booklet_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                        />
                      </div>
                      <button type="button" className={btnDanger} onClick={() => removeEnvelope(idx)}>
                        Remove
                      </button>
                      {env.booklet_count > capForPaper ? (
                        <p className="col-start-2 text-xs leading-snug text-destructive">
                          At most {capForPaper} for paper {paperNumber} (you entered {env.booklet_count}).
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || editingHasOverCap}
                onClick={() => void onSave()}
              >
                Save
              </button>
              <button type="button" className={btnSecondary} disabled={busy} onClick={closeEdit}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  function renderPaperBundles(bundles: PaperBundle[]) {
    return (
      <div className="space-y-6">
        {bundles.map((bundle, idx) => (
          <Fragment key={`${bundle.subjectId}-${bundle.paperNumber}`}>
            {(idx === 0 || bundles[idx - 1].subjectId !== bundle.subjectId) && (
              <h2 className="text-lg font-semibold text-card-foreground">
                {bundle.subjectCode} — {bundle.subjectName}
              </h2>
            )}
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm font-medium text-card-foreground">
                Paper {bundle.paperNumber}
                {bundle.examinationDate ? (
                  <span className="ml-2 font-normal text-muted-foreground">
                    · Scheduled {bundle.examinationDate}
                  </span>
                ) : (
                  <span className="ml-2 font-normal text-muted-foreground">· No date in timetable</span>
                )}
              </h3>
              <ul className="mt-2 space-y-2">
                {bundle.series.map((slot) =>
                  renderSeriesRow(bundle.subjectId, bundle.paperNumber, slot, bundle.series.length),
                )}
              </ul>
            </div>
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Worked Scripts Control" staffRole="inspector">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Record the number of booklets per envelope for each subject and
            (series) after the scheduled paper date. Record Paper 1
            and Paper 2 separately. Papers that are fully packed are grouped under “Past papers — packed”.
            {data ? (
              <>
                {" "}
                <span className="font-medium text-foreground">{scriptCapsSummary(data)}</span>
              </>
            ) : null}
          </p>

          <div>
            <label htmlFor="script-exam" className={formLabelClass}>
              Examination
            </label>
            <select
              id="script-exam"
              className={`mt-1 w-full max-w-md ${formInputClass}`}
              value={examId ?? ""}
              onChange={(e) => {
                setExamId(e.target.value ? Number(e.target.value) : null);
                closeEdit();
              }}
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

          {centerSchools && centerSchools.schools.length > 1 ? (
            <div>
              <label htmlFor="script-school" className={formLabelClass}>
                School
              </label>
              <select
                id="script-school"
                className={`mt-1 w-full max-w-md ${formInputClass}`}
                value={selectedSchoolId}
                onChange={(e) => {
                  setSelectedSchoolId(e.target.value);
                  setData(null);
                  closeEdit();
                }}
              >
                <option value="">Select school…</option>
                {centerSchools.schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
              {selectedSchoolId.trim() === "" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Your centre has more than one school. Choose which school&apos;s candidates and packing records to
                  work with.
                </p>
              ) : null}
            </div>
          ) : null}

          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {formError && !editing ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          {busy && selectedSchoolId.trim() !== "" && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {centerSchools && centerSchools.schools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schools are linked to your examination centre account.</p>
          ) : null}

          {data && data.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No examination records for this school for this examination. Contact Mr. Philip Quarm for assistance.
            </p>
          ) : null}

          {grouped ? (
            <div className="space-y-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-foreground">Needs packing records</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="rounded border-input-border"
                    checked={showUpcoming}
                    onChange={(e) => setShowUpcoming(e.target.checked)}
                  />
                  Show upcoming papers
                </label>
              </div>

              {groupedHint ? <p className="text-sm text-muted-foreground">{groupedHint}</p> : null}

              {grouped.outstanding.length > 0 ? renderPaperBundles(grouped.outstanding) : null}

              {grouped.completed.length > 0 ? (
                <details className="group rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
                  <summary className="cursor-pointer text-sm font-semibold text-card-foreground marker:text-muted-foreground">
                    Past papers — packed ({grouped.completed.length}{" "}
                    {grouped.completed.length === 1 ? "paper" : "papers"})
                  </summary>
                  <div className="mt-4">{renderPaperBundles(grouped.completed)}</div>
                </details>
              ) : null}

              {showUpcoming && grouped.upcoming.length > 0 ? (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold text-foreground">Upcoming</h2>
                  <p className="text-xs text-muted-foreground">
                    Packing is available on or after each paper&apos;s scheduled date.
                  </p>
                  <ul className="space-y-2 rounded-2xl border border-border bg-card p-4 sm:p-5">
                    {grouped.upcoming.map((b) => (
                      <li
                        key={`${b.subjectId}-${b.paperNumber}`}
                        className="text-sm text-foreground border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
                      >
                        <span className="font-medium">
                          {b.subjectCode} — {b.subjectName}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · Paper {b.paperNumber}
                          {b.series.length > 1 ? ` · ${b.series.length} series` : ""}
                          {b.examinationDate ? ` · ${b.examinationDate}` : ""}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Available on or after the scheduled date.
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
