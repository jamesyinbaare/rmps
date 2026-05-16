"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  formatUpcomingPapersLabel,
  getPaperInspectorVisuals,
  groupUpcomingBundlesBySubjectAndDate,
  seriesInspectorBadgeClass,
} from "@/lib/paper-inspector-styles";
import {
  irregularPackingItemPlural,
  packingCountDescriptor,
  packingCountFieldLabel,
} from "@/lib/script-packing-terms";
import {
  deleteIrregularScriptSeries,
  getMyCenterSchoolsForTimetable,
  getMyInspectorPostings,
  getMySchoolIrregularScriptControl,
  getStaffDefaultExamination,
  upsertIrregularScriptSeries,
  type Examination,
  type MyCenterSchoolsResponse,
  type MyInspectorPostingRow,
  type MySchoolScriptControlResponse,
  type ScriptSeriesPackingResponse,
  type ScriptSeriesSlotResponse,
  type ScriptSubjectRowResponse,
} from "@/lib/api";
import { inspectorMustPickWorkspaceGlobally, pickInspectorPostingId } from "@/lib/auth";

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

type DraftEnvelope = {
  envelope_number: number;
  booklet_count: number | null;
};

type Draft = {
  envelopes: DraftEnvelope[];
};

type PaperBundle = {
  subjectId: number;
  subjectCode: string;
  subjectOriginalCode: string | null;
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
    envelopes: [...p.envelopes]
      .sort((a, b) => a.envelope_number - b.envelope_number)
      .map((e) => ({
        envelope_number: e.envelope_number,
        booklet_count: Math.max(0, e.booklet_count),
      })),
  };
}

function envelopesToPersist(draft: Draft): { envelope_number: number; booklet_count: number }[] {
  const out: { envelope_number: number; booklet_count: number }[] = [];
  for (const e of draft.envelopes) {
    if (e.booklet_count !== null && e.booklet_count > 0) {
      out.push({ envelope_number: e.envelope_number, booklet_count: e.booklet_count });
    }
  }
  return out;
}

function isConsecutiveFromOne(envelopeNumbers: number[]): boolean {
  const nums = [...envelopeNumbers].sort((a, b) => a - b);
  if (nums.length === 0) return false;
  return nums.every((n, i) => n === i + 1);
}

/** Envelope numbers with positive counts must be exactly 1..k; returns i in 1..k not present. */
function missingEnvelopesInConsecutivePrefix(envelopeNumbers: number[]): number[] {
  const nums = [...envelopeNumbers].sort((a, b) => a - b);
  if (nums.length === 0) return [];
  const k = nums.length;
  const present = new Set(nums);
  const missing: number[] = [];
  for (let i = 1; i <= k; i++) {
    if (!present.has(i)) missing.push(i);
  }
  return missing;
}

function consecutiveEnvelopeNumbersMessage(paperNumber: number, envelopeNumbers: number[]): string {
  const missing = missingEnvelopesInConsecutivePrefix(envelopeNumbers);
  const items = irregularPackingItemPlural(paperNumber);
  const base = `You can't record envelopes with empty or zero ${items}.`;
  if (missing.length === 0) {
    return `${base} Each envelope from 1 up to the number you're saving must have a ${packingCountDescriptor(paperNumber)}.`;
  }
  const listed =
    missing.length === 1 ? `envelope ${missing[0]}` : `envelopes ${missing.join(", ")}`;
  return `${base} Missing: ${listed}.`;
}

function scriptCapsSummary(d: MySchoolScriptControlResponse): string {
  const g = d.scripts_per_envelope;
  const p1 = d.scripts_per_envelope_paper_1;
  const p2 = d.scripts_per_envelope_paper_2;
  if (p1 === p2 && p2 === g) {
    return `Paper 1: up to ${g} irregular scannables per envelope. Paper 2 and other papers: up to ${g} irregular booklets per envelope.`;
  }
  if (p1 === p2) {
    return `Paper 1: up to ${p1} irregular scannables per envelope; Paper 2: up to ${p1} irregular booklets per envelope. Other papers: up to ${g} irregular booklets per envelope.`;
  }
  return `Paper 1: up to ${p1} irregular scannables; Paper 2: up to ${p2} irregular booklets; other papers: up to ${g} irregular booklets per envelope.`;
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
        subjectOriginalCode: sub.subject_original_code ?? null,
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
      const allPacked = bundle.series.length > 0 && bundle.series.every((s) => s.packing != null);
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
    return "No pending irregular entries on due papers. Expand “Past irregular papers — recorded” to review or edit; upcoming papers are listed below.";
  }
  if (g.completed.length > 0) {
    return "No pending irregular entries on due papers. Expand “Past irregular papers — recorded” below to review or edit.";
  }
  if (g.upcoming.length > 0) {
    return "No irregular entries recorded yet. Use this page only when irregular scripts occur.";
  }
  return null;
}

function workspaceOptionLabel(p: MyInspectorPostingRow): string {
  return `${p.center_name} (${p.center_code}) — ${p.subject_scope}`;
}

export default function InspectorIrregularScriptsControlPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centerSchools, setCenterSchools] = useState<MyCenterSchoolsResponse | null>(null);
  const [postings, setPostings] = useState<MyInspectorPostingRow[]>([]);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
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
    if (postings.length > 0 && !selectedPostingId) return;
    setLoadError(null);
    setBusy(true);
    try {
      const postingParam = postings.length > 0 ? selectedPostingId! : undefined;
      const res = await getMySchoolIrregularScriptControl(examId, selectedSchoolId, postingParam);
      setData(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load irregular script control data");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [examId, selectedSchoolId, postings.length, selectedPostingId]);

  useEffect(() => {
    async function loadActiveExam() {
      setLoadError(null);
      try {
        const ex = await getStaffDefaultExamination();
        setExams([ex]);
        setExamId(ex.id);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load active examination");
      }
    }
    void loadActiveExam();
  }, []);

  useEffect(() => {
    if (inspectorMustPickWorkspaceGlobally(postings.length)) {
      router.replace("/dashboard/inspector/select-workspace");
    }
  }, [postings.length, router]);

  useEffect(() => {
    if (examId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const [scope, postingRes] = await Promise.all([
          getMyCenterSchoolsForTimetable(examId),
          getMyInspectorPostings(examId),
        ]);
        if (cancelled) return;
        setCenterSchools(scope);
        setPostings(postingRes.items);
        setSelectedPostingId((prev) => pickInspectorPostingId(postingRes.items, prev));
        if (scope.schools.length === 1) setSelectedSchoolId(scope.schools[0].id);
        else setSelectedSchoolId("");
      } catch (e) {
        if (cancelled) return;
        setCenterSchools(null);
        setPostings([]);
        setSelectedPostingId(null);
        setSelectedSchoolId("");
        setLoadError(e instanceof Error ? e.message : "Failed to load examination centre schools");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (examId !== null && selectedSchoolId.trim() !== "" && (postings.length === 0 || selectedPostingId)) {
      void loadData();
    } else setData(null);
  }, [examId, selectedSchoolId, selectedPostingId, postings.length, loadData]);

  function openEdit(subjectId: number, paperNumber: number, seriesNumber: number, packing: ScriptSeriesPackingResponse | null) {
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
    const toSave = envelopesToPersist(draft);
    if (toSave.length === 0) {
      setFormError(`Enter at least one ${packingCountDescriptor(editing.paperNumber)} to save.`);
      return;
    }
    const nums = toSave.map((e) => e.envelope_number);
    if (!isConsecutiveFromOne(nums)) {
      setFormError(consecutiveEnvelopeNumbersMessage(editing.paperNumber, nums));
      return;
    }
    for (const env of toSave) {
      if (env.booklet_count > cap) {
        setFormError(
          `Envelope ${env.envelope_number}: at most ${cap} ${irregularPackingItemPlural(editing.paperNumber)} for paper ${editing.paperNumber}.`,
        );
        return;
      }
    }
    setBusy(true);
    try {
      await upsertIrregularScriptSeries(examId, selectedSchoolId, {
        subject_id: editing.subjectId,
        paper_number: editing.paperNumber,
        series_number: editing.seriesNumber,
        envelopes: toSave.map((e) => ({
          envelope_number: e.envelope_number,
          booklet_count: e.booklet_count,
        })),
      }, postings.length > 0 ? selectedPostingId! : undefined);
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
    if (!window.confirm("Remove this irregular packing record and all envelopes?")) return;
    setBusy(true);
    try {
      await deleteIrregularScriptSeries(examId, {
        school_id: selectedSchoolId,
        subject_id: subjectId,
        paper_number: paperNumber,
        series_number: seriesNumber,
        posting_id: postings.length > 0 ? selectedPostingId! : undefined,
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
    setFormError(null);
    const next = draft.envelopes.length === 0 ? 1 : Math.max(...draft.envelopes.map((e) => e.envelope_number)) + 1;
    setDraft((d) => ({ ...d, envelopes: [...d.envelopes, { envelope_number: next, booklet_count: null }] }));
  }
  function removeEnvelope(idx: number) {
    setFormError(null);
    setDraft((d) => ({ ...d, envelopes: d.envelopes.filter((_, i) => i !== idx) }));
  }
  function updateEnvelope(idx: number, patch: Partial<Pick<DraftEnvelope, "booklet_count">>) {
    setFormError(null);
    setDraft((d) => ({
      ...d,
      envelopes: d.envelopes.map((e, i) => {
        if (i !== idx) return e;
        const next: DraftEnvelope = { ...e, ...patch };
        if (
          "booklet_count" in patch &&
          patch.booklet_count !== null &&
          patch.booklet_count !== undefined
        ) {
          next.booklet_count = Math.max(0, patch.booklet_count);
        }
        return next;
      }),
    }));
  }

  const isEditingSlot = (subjectId: number, paperNumber: number, seriesNumber: number) =>
    editing !== null && editing.subjectId === subjectId && editing.paperNumber === paperNumber && editing.seriesNumber === seriesNumber;

  const grouped = data && data.subjects.length > 0 ? partitionPapers(data.subjects, localTodayIso()) : null;
  const groupedHint = grouped ? emptyOutstandingHint(grouped) : null;

  function renderSeriesRow(subjectId: number, paperNumber: number, slot: ScriptSeriesSlotResponse) {
    const packing = slot.packing;
    const anyEnvelopeVerified = Boolean(packing?.envelopes?.some((e) => e.verified));
    const isEditing = isEditingSlot(subjectId, paperNumber, slot.series_number);
    const capForPaper = data ? maxBookletsForPaper(data, paperNumber) : 50;
    const toSave = isEditing ? envelopesToPersist(draft) : [];
    const editingHasOverCap =
      isEditing &&
      draft.envelopes.some(
        (e) => e.booklet_count !== null && e.booklet_count > capForPaper,
      );
    const derivedEnvelopeOrderError =
      isEditing &&
      toSave.length > 0 &&
      !isConsecutiveFromOne(toSave.map((e) => e.envelope_number))
        ? consecutiveEnvelopeNumbersMessage(paperNumber, toSave.map((e) => e.envelope_number))
        : null;
    const paperVisuals = getPaperInspectorVisuals(paperNumber);
    return (
      <li key={slot.series_number} className={paperVisuals.seriesRowClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className={seriesInspectorBadgeClass} title="Packing series for this paper">
              Series {slot.series_number}
            </span>
            {!isEditing ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {packing ? (
                  <>
                    {packing.envelopes.length} envelope{packing.envelopes.length === 1 ? "" : "s"},{" "}
                    {packing.envelopes.reduce((s, e) => s + e.booklet_count, 0)}{" "}
                    {irregularPackingItemPlural(paperNumber)} total
                  </>
                ) : (
                  "Not recorded"
                )}
              </p>
            ) : null}
            {!isEditing && anyEnvelopeVerified ? (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                You can&apos;t make changes to irregular envelopes that have been verified or partially verified by depot keeper.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isEditing && !anyEnvelopeVerified ? (
              <>
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => openEdit(subjectId, paperNumber, slot.series_number, packing)}>
                  {packing ? "Edit" : "Add"}
                </button>
                {packing ? (
                  <button type="button" className={btnDanger} disabled={busy} onClick={() => void onClear(subjectId, paperNumber, slot.series_number)}>
                    Clear
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {isEditing ? (
          <div className={`mt-3 w-full space-y-3 pt-3 ${paperVisuals.editDividerClass}`}>
            {formError || derivedEnvelopeOrderError ? (
              <p className="text-sm text-destructive">{formError ?? derivedEnvelopeOrderError}</p>
            ) : null}
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className={formLabelClass}>Irregular envelopes</span>
                <button type="button" className={btnSecondary} onClick={addEnvelope}>Add envelope</button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Up to {capForPaper} {irregularPackingItemPlural(paperNumber)} per envelope for Paper {paperNumber}.
              </p>
              {draft.envelopes.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Add irregular envelopes and {packingCountDescriptor(paperNumber)}s, then save.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {draft.envelopes.map((env, idx) => (
                    <li
                      key={`${env.envelope_number}-${idx}`}
                      className="grid grid-cols-[auto_minmax(8rem,1fr)_auto] items-start gap-x-2 gap-y-1"
                    >
                      <div className="flex flex-col">
                        <span className={`${formLabelClass} invisible select-none`} aria-hidden>
                          {packingCountFieldLabel(paperNumber)}
                        </span>
                        <div className="mt-1.5 flex min-h-11 items-center">
                          <span className="text-sm font-medium text-foreground">
                            Env. {env.envelope_number}
                          </span>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <label
                          htmlFor={`irregular-packing-count-p${paperNumber}-${env.envelope_number}-${idx}`}
                          className={formLabelClass}
                        >
                          {packingCountFieldLabel(paperNumber)}
                        </label>
                        <input
                          id={`irregular-packing-count-p${paperNumber}-${env.envelope_number}-${idx}`}
                          type="number"
                          min={0}
                          className={`w-full min-w-0 ${formInputClass} ${
                            env.booklet_count !== null && env.booklet_count > capForPaper
                              ? "border-destructive"
                              : ""
                          }`}
                          value={env.booklet_count === null ? "" : env.booklet_count}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") {
                              updateEnvelope(idx, { booklet_count: null });
                              return;
                            }
                            const n = parseInt(v, 10);
                            if (Number.isNaN(n)) {
                              updateEnvelope(idx, { booklet_count: null });
                            } else {
                              updateEnvelope(idx, { booklet_count: Math.max(0, n) });
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className={`${formLabelClass} invisible select-none`} aria-hidden>
                          {packingCountFieldLabel(paperNumber)}
                        </span>
                        <div className="mt-1.5 flex min-h-11 items-center">
                          <button type="button" className={btnDanger} onClick={() => removeEnvelope(idx)}>
                            Remove
                          </button>
                        </div>
                      </div>
                      {env.booklet_count !== null && env.booklet_count > capForPaper ? (
                        <p className="col-start-2 text-xs leading-snug text-destructive">
                          At most {capForPaper} {irregularPackingItemPlural(paperNumber)} for paper {paperNumber} (you
                          entered {env.booklet_count}).
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
              <button type="button" className={btnSecondary} disabled={busy} onClick={closeEdit}>Cancel</button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  function renderPaperBundles(bundles: PaperBundle[]) {
    return (
      <div className="space-y-6">
        {bundles.map((bundle, idx) => {
          const v = getPaperInspectorVisuals(bundle.paperNumber);
          return (
            <Fragment key={`${bundle.subjectId}-${bundle.paperNumber}`}>
              {(idx === 0 || bundles[idx - 1].subjectId !== bundle.subjectId) && (
                <h2 className="text-lg font-semibold text-card-foreground">{bundle.subjectOriginalCode ?? bundle.subjectCode} — {bundle.subjectName}</h2>
              )}
              <div className={v.cardClass}>
                <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-card-foreground">
                  <span className={v.badgeClass} title={`Paper ${bundle.paperNumber}`}>
                    {v.badgeShortLabel}
                  </span>
                  <span>
                    Paper {bundle.paperNumber}
                    {bundle.examinationDate ? (
                      <span className="ml-2 font-normal text-muted-foreground">· Scheduled {bundle.examinationDate}</span>
                    ) : (
                      <span className="ml-2 font-normal text-muted-foreground">· No date in timetable</span>
                    )}
                  </span>
                </h3>
                <ul className="mt-2 space-y-4">
                  {bundle.series.map((slot) => renderSeriesRow(bundle.subjectId, bundle.paperNumber, slot))}
                </ul>
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Irregular Worked Scripts Control" staffRole="inspector">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Record irregular worked scripts separately from regular worked scripts, per subject, paper, and series. This is optional and only needed when irregular scripts occur.
            {data ? <> <span className="font-medium text-foreground">{scriptCapsSummary(data)}</span></> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-accent">Blue accent</span> marks Paper 1 sections;{" "}
            <span className="font-medium text-success">green accent</span> marks Paper 2. Match irregular counts to the
            correct paper before saving.
          </p>

          <div>
            {examId != null && exams[0] ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Examination</span>
                {": "}
                {exams[0].year}
                {exams[0].exam_series ? ` ${exams[0].exam_series}` : ""} — {exams[0].exam_type}
              </p>
            ) : null}
          </div>

          {selectedPostingId ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Workspace:</span>{" "}
              {(() => {
                const p = postings.find((x) => x.id === selectedPostingId);
                return p ? workspaceOptionLabel(p) : "—";
              })()}
            </p>
          ) : null}

          {centerSchools && centerSchools.schools.length > 1 ? (
            <div>
              <label htmlFor="irregular-script-school" className={formLabelClass}>School</label>
              <select id="irregular-script-school" className={`mt-1 w-full max-w-md ${formInputClass}`} value={selectedSchoolId} onChange={(e) => { setSelectedSchoolId(e.target.value); setData(null); closeEdit(); }}>
                <option value="">Select school…</option>
                {centerSchools.schools.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
            </div>
          ) : null}

          {loadError ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p> : null}
          {busy && selectedSchoolId.trim() !== "" && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

          {grouped ? (
            <div className="space-y-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-foreground">Irregular recording (optional)</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" className="rounded border-input-border" checked={showUpcoming} onChange={(e) => setShowUpcoming(e.target.checked)} />
                  Show upcoming papers
                </label>
              </div>
              {groupedHint ? <p className="text-sm text-muted-foreground">{groupedHint}</p> : null}
              {grouped.outstanding.length > 0 ? renderPaperBundles(grouped.outstanding) : null}
              {grouped.completed.length > 0 ? (
                <details className="group rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
                  <summary className="cursor-pointer text-sm font-semibold text-card-foreground marker:text-muted-foreground">
                    Past irregular papers — recorded ({grouped.completed.length} {grouped.completed.length === 1 ? "paper" : "papers"})
                  </summary>
                  <div className="mt-4">{renderPaperBundles(grouped.completed)}</div>
                </details>
              ) : null}
              {showUpcoming && grouped.upcoming.length > 0 ? (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold text-foreground">Upcoming</h2>
                  <ul className="space-y-2 rounded-2xl border border-border bg-card p-4 sm:p-5">
                    {groupUpcomingBundlesBySubjectAndDate(grouped.upcoming).map((bundles) => {
                      const b = bundles[0];
                      const nums = bundles.map((x) => x.paperNumber).join("-");
                      return (
                        <li
                          key={`${b.subjectId}-${nums}-${b.examinationDate ?? "na"}`}
                          className="flex flex-col gap-1 border-b border-border/60 pb-2 text-sm text-foreground last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5 sm:gap-y-0"
                        >
                          <span className="font-medium">{b.subjectOriginalCode ?? b.subjectCode} — {b.subjectName}</span>
                          <span className="text-muted-foreground">
                            <span className="hidden sm:inline">· </span>
                            {formatUpcomingPapersLabel(bundles)}
                            {b.examinationDate ? ` · ${b.examinationDate}` : ""}
                          </span>
                        </li>
                      );
                    })}
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
