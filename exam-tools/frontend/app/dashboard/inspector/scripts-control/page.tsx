"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  apiJson,
  deleteScriptSeries,
  getMySchoolScriptControl,
  upsertScriptSeries,
  type Examination,
  type MySchoolScriptControlResponse,
  type ScriptEnvelopeItem,
} from "@/lib/api";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30";
const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30";
const btnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30";

type Draft = {
  scripts_per_envelope: number;
  candidate_count: string;
  envelopes: ScriptEnvelopeItem[];
};

function emptyDraft(defaultScripts = 50): Draft {
  return {
    scripts_per_envelope: defaultScripts,
    candidate_count: "",
    envelopes: [],
  };
}

function draftFromPacking(p: {
  scripts_per_envelope: number;
  candidate_count: number | null;
  envelopes: ScriptEnvelopeItem[];
}): Draft {
  return {
    scripts_per_envelope: p.scripts_per_envelope,
    candidate_count: p.candidate_count === null ? "" : String(p.candidate_count),
    envelopes: p.envelopes.map((e) => ({ ...e })),
  };
}

export default function InspectorScriptsControlPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [data, setData] = useState<MySchoolScriptControlResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (examId === null) return;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await getMySchoolScriptControl(examId);
      setData(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load script control data");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [examId]);

  useEffect(() => {
    async function loadExamsOnce() {
      try {
        const list = await apiJson<Examination[]>("/examinations/public-list");
        setExams(list);
        setExamId((prev) => (prev === null && list.length ? list[0].id : prev));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    }
    loadExamsOnce();
  }, []);

  useEffect(() => {
    if (examId !== null) {
      loadData();
    }
  }, [examId, loadData]);

  function openEdit(subjectId: number, paper: number, series: number, initial: Draft) {
    const key = `${subjectId}-${paper}-${series}`;
    setEditKey(key);
    setFormError(null);
    setDraft(initial);
  }

  function closeEdit() {
    setEditKey(null);
    setFormError(null);
  }

  async function onSave(subjectId: number, paper: number, series: number) {
    if (examId === null) return;
    setFormError(null);
    const candidateRaw = draft.candidate_count.trim();
    let candidate_count: number | null = null;
    if (candidateRaw !== "") {
      const n = parseInt(candidateRaw, 10);
      if (Number.isNaN(n) || n < 0) {
        setFormError("Candidate count must be a non-negative integer or empty.");
        return;
      }
      candidate_count = n;
    }
    const sp = draft.scripts_per_envelope;
    if (sp < 1) {
      setFormError("Scripts per envelope must be at least 1.");
      return;
    }
    for (const env of draft.envelopes) {
      if (env.booklet_count > sp) {
        setFormError(
          `Envelope ${env.envelope_number}: booklets cannot exceed ${sp} (scripts per envelope).`,
        );
        return;
      }
    }
    setBusy(true);
    try {
      await upsertScriptSeries(examId, {
        subject_id: subjectId,
        paper_number: paper,
        series_number: series,
        scripts_per_envelope: sp,
        candidate_count,
        envelopes: draft.envelopes,
      });
      await loadData();
      closeEdit();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onClear(subjectId: number, paper: number, series: number) {
    if (examId === null) return;
    if (!window.confirm("Remove this packing record and all envelopes?")) return;
    setBusy(true);
    try {
      await deleteScriptSeries(examId, { subject_id: subjectId, paper_number: paper, series_number: series });
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
      envelopes: d.envelopes.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    }));
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Scripts control" staffRole="inspector">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Record how many answered booklets are in each envelope, by subject, paper, and series (1–6).
            Paper 1 and Paper 2 are entered separately.
          </p>

          <div>
            <label htmlFor="script-exam" className={formLabelClass}>
              Examination
            </label>
            <select
              id="script-exam"
              className={`mt-1 w-full max-w-md ${formInputClass}`}
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

          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {busy && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

          {data && data.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subjects on this examination match your school&apos;s programmes, or timetables are not loaded yet.
            </p>
          ) : null}

          {data && data.subjects.length > 0 ? (
            <div className="space-y-6">
              {data.subjects.map((sub) => (
                <section
                  key={sub.subject_id}
                  className="rounded-2xl border border-border bg-card p-4 sm:p-5"
                >
                  <h2 className="text-lg font-semibold text-card-foreground">
                    {sub.subject_code} — {sub.subject_name}
                  </h2>
                  <div className="mt-4 space-y-5">
                    {sub.papers.map((paper) => (
                      <div key={paper.paper_number} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                        <h3 className="text-sm font-medium text-card-foreground">
                          Paper {paper.paper_number}
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {paper.series.map((slot) => {
                            const key = `${sub.subject_id}-${paper.paper_number}-${slot.series_number}`;
                            const packing = slot.packing;
                            const isEditing = editKey === key;
                            return (
                              <li
                                key={slot.series_number}
                                className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background/50 p-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    Series {slot.series_number}
                                  </p>
                                  {packing && !isEditing ? (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {packing.envelopes.length} envelope
                                      {packing.envelopes.length === 1 ? "" : "s"},{" "}
                                      {packing.envelopes.reduce((s, e) => s + e.booklet_count, 0)} booklets total
                                      · max {packing.scripts_per_envelope} per envelope
                                      {packing.candidate_count != null
                                        ? ` · ${packing.candidate_count} candidates recorded`
                                        : ""}
                                    </p>
                                  ) : null}
                                  {!packing && !isEditing ? (
                                    <p className="mt-1 text-xs text-muted-foreground">Not recorded</p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {!isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className={btnSecondary}
                                        disabled={busy}
                                        onClick={() =>
                                          openEdit(
                                            sub.subject_id,
                                            paper.paper_number,
                                            slot.series_number,
                                            packing ? draftFromPacking(packing) : emptyDraft(),
                                          )
                                        }
                                      >
                                        {packing ? "Edit" : "Add"}
                                      </button>
                                      {packing ? (
                                        <button
                                          type="button"
                                          className={btnDanger}
                                          disabled={busy}
                                          onClick={() => onClear(sub.subject_id, paper.paper_number, slot.series_number)}
                                        >
                                          Clear
                                        </button>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                                </div>
                                {isEditing ? (
                                  <div className="mt-3 w-full space-y-3 border-t border-border pt-3">
                                    {formError ? (
                                      <p className="text-sm text-destructive">{formError}</p>
                                    ) : null}
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className={formLabelClass}>Scripts per envelope</label>
                                        <input
                                          type="number"
                                          min={1}
                                          className={`mt-1 w-full ${formInputClass}`}
                                          value={draft.scripts_per_envelope}
                                          onChange={(e) =>
                                            setDraft((d) => ({
                                              ...d,
                                              scripts_per_envelope: Math.max(1, parseInt(e.target.value, 10) || 1),
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <label className={formLabelClass}>Candidate count (optional)</label>
                                        <input
                                          type="number"
                                          min={0}
                                          className={`mt-1 w-full ${formInputClass}`}
                                          value={draft.candidate_count}
                                          onChange={(e) =>
                                            setDraft((d) => ({ ...d, candidate_count: e.target.value }))
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={formLabelClass}>Envelopes</span>
                                        <button type="button" className={btnSecondary} onClick={addEnvelope}>
                                          Add envelope
                                        </button>
                                      </div>
                                      {draft.envelopes.length === 0 ? (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                          Add at least one envelope, or save with none to clear (use Clear instead).
                                        </p>
                                      ) : (
                                        <ul className="mt-2 space-y-2">
                                          {draft.envelopes.map((env, idx) => (
                                            <li
                                              key={`${env.envelope_number}-${idx}`}
                                              className="flex flex-wrap items-end gap-2"
                                            >
                                              <div>
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
                                              <div className="min-w-[8rem] flex-1">
                                                <label className={formLabelClass}>Booklets</label>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  className={`mt-1 w-full ${formInputClass}`}
                                                  value={env.booklet_count}
                                                  onChange={(e) =>
                                                    updateEnvelope(idx, {
                                                      booklet_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                                                    })
                                                  }
                                                />
                                              </div>
                                              <button
                                                type="button"
                                                className={`${btnDanger} self-end`}
                                                onClick={() => removeEnvelope(idx)}
                                              >
                                                Remove
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className={btnPrimary}
                                        disabled={busy}
                                        onClick={() =>
                                          onSave(sub.subject_id, paper.paper_number, slot.series_number)
                                        }
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
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
