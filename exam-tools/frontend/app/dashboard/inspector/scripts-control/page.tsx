"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  displayScriptSubjectCode,
  dueListHint,
  formatUpcomingPapersLabel,
  getPaperInspectorVisuals,
  groupPaperBundlesBySubject,
  isPaperBundleFullyRecorded,
  partitionDueAndUpcoming,
  sortSubjectBundleGroups,
  sortSubjectBundleGroupsAscending,
  subjectScriptAccordionId,
  type ScriptPaperBundle,
  type SubjectScriptBundleGroup,
  seriesInspectorBadgeClass,
} from "@/lib/paper-inspector-styles";
import {
  packingCountDescriptor,
  packingCountFieldLabel,
  packingCountTypePhrase,
  packingItemPlural,
} from "@/lib/script-packing-terms";
import {
  deleteScriptSeries,
  getMyCenterSchoolsForTimetable,
  getMyInspectorPostings,
  getMySchoolScriptControl,
  getStaffDefaultExamination,
  upsertScriptSeries,
  type Examination,
  type MyCenterSchoolsResponse,
  type MyInspectorPostingRow,
  type MySchoolScriptControlResponse,
  type ScriptSeriesPackingResponse,
  type ScriptSeriesSlotResponse,
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

/** Sorted envelope numbers to save must be exactly 1..k. */
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
  const items = packingItemPlural(paperNumber);
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
    return `Paper 1: up to ${g} scannables per envelope. Paper 2 and other papers: up to ${g} booklets per envelope.`;
  }
  if (p1 === p2) {
    return `Paper 1: up to ${p1} scannables per envelope; Paper 2: up to ${p1} booklets per envelope. Other papers: up to ${g} booklets per envelope.`;
  }
  return `Paper 1: up to ${p1} scannables; Paper 2: up to ${p2} booklets; other papers: up to ${g} booklets per envelope.`;
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

function workspaceOptionLabel(p: MyInspectorPostingRow): string {
  return `${p.center_name} (${p.center_code}) — ${p.subject_scope}`;
}

export default function InspectorScriptsControlPage() {
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
  const [openAccordionId, setOpenAccordionId] = useState<string | null>(null);
  const subjectAccordionRefs = useRef<Record<string, HTMLDetailsElement | null>>({});

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
      const res = await getMySchoolScriptControl(examId, selectedSchoolId, postingParam);
      setData(res);
      setOpenAccordionId(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load script control data");
      setData(null);
      setOpenAccordionId(null);
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
        if (scope.schools.length === 1) {
          setSelectedSchoolId(scope.schools[0].id);
        } else {
          setSelectedSchoolId("");
        }
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
      loadData();
    } else {
      setData(null);
    }
  }, [examId, selectedSchoolId, selectedPostingId, postings.length, loadData]);

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
    const toSave = envelopesToPersist(draft);
    if (toSave.length === 0) {
      setFormError(`${packingCountTypePhrase(editing.paperNumber)} counts can't be zero or empty.`);
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
          `Envelope ${env.envelope_number}: at most ${cap} ${packingItemPlural(editing.paperNumber)} for paper ${editing.paperNumber}.`,
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
    if (!window.confirm("Remove this packing record and all envelopes?")) return;
    setBusy(true);
    try {
      await deleteScriptSeries(examId, {
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
    const next =
      draft.envelopes.length === 0
        ? 1
        : Math.max(...draft.envelopes.map((e) => e.envelope_number)) + 1;
    setDraft((d) => ({
      ...d,
      envelopes: [...d.envelopes, { envelope_number: next, booklet_count: null }],
    }));
  }

  function removeEnvelope(idx: number) {
    setFormError(null);
    setDraft((d) => ({
      ...d,
      envelopes: d.envelopes.filter((_, i) => i !== idx),
    }));
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
    editing !== null &&
    editing.subjectId === subjectId &&
    editing.paperNumber === paperNumber &&
    editing.seriesNumber === seriesNumber;

  const partitioned =
    data && data.subjects.length > 0 ? partitionDueAndUpcoming(data.subjects, localTodayIso()) : null;
  const dueSubjectGroups = partitioned
    ? sortSubjectBundleGroups(groupPaperBundlesBySubject(partitioned.due))
    : [];
  const upcomingSubjectGroups = partitioned
    ? sortSubjectBundleGroupsAscending(groupPaperBundlesBySubject(partitioned.upcoming))
    : [];
  const listHint = partitioned ? dueListHint(partitioned.due, partitioned.upcoming) : null;

  function toggleSubjectAccordion(id: string) {
    const opening = openAccordionId !== id;
    setOpenAccordionId(opening ? id : null);
    if (opening) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          subjectAccordionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
  }

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
            <span
              className={seriesInspectorBadgeClass}
              title="Packing series for this paper"
            >
              Series {slot.series_number}
            </span>
            {!isEditing ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {packing ? (
                  <>
                    {packing.envelopes.length} envelope
                    {packing.envelopes.length === 1 ? "" : "s"},{" "}
                    {packing.envelopes.reduce((s, e) => s + e.booklet_count, 0)}{" "}
                    {packingItemPlural(paperNumber)} total
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
          <div className={`mt-3 w-full space-y-3 pt-3 ${paperVisuals.editDividerClass}`}>
            {formError || derivedEnvelopeOrderError ? (
              <p className="text-sm text-destructive">{formError ?? derivedEnvelopeOrderError}</p>
            ) : null}
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className={formLabelClass}>Envelopes</span>
                <button type="button" className={btnSecondary} onClick={addEnvelope}>
                  Add envelope
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Up to {capForPaper} {packingItemPlural(paperNumber)} per envelope for Paper {paperNumber}.
                {paperNumber === 1 ? " Counts of 250 or more must be split into multiple envelopes." : ""}
              </p>
              {draft.envelopes.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Add envelopes and {packingCountDescriptor(paperNumber)}s, then save.
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
                          htmlFor={`script-packing-count-p${paperNumber}-${env.envelope_number}-${idx}`}
                          className={formLabelClass}
                        >
                          {packingCountFieldLabel(paperNumber)}
                        </label>
                        <input
                          id={`script-packing-count-p${paperNumber}-${env.envelope_number}-${idx}`}
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
                          At most {capForPaper} {packingItemPlural(paperNumber)} for paper {paperNumber} (you entered{" "}
                          {env.booklet_count}).
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

  function renderPaperBundleCard(bundle: ScriptPaperBundle) {
    const v = getPaperInspectorVisuals(bundle.paperNumber);
    const fullyRecorded = isPaperBundleFullyRecorded(bundle);
    return (
      <div key={`${bundle.subjectId}-${bundle.paperNumber}`} className={v.cardClass}>
        <h3 className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {displayScriptSubjectCode(bundle)} — {bundle.subjectName}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`${v.badgeClass} px-2.5 py-1 text-sm font-bold`}
              title={`Paper ${bundle.paperNumber}`}
            >
              {v.badgeShortLabel}
            </span>
            <span className="text-xl font-bold tabular-nums tracking-tight text-card-foreground">
              Paper {bundle.paperNumber}
            </span>
            {fullyRecorded ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Recorded
              </span>
            ) : null}
          </div>
        </h3>
        <ul className="mt-2 space-y-4">
          {bundle.series.map((slot) => renderSeriesRow(bundle.subjectId, bundle.paperNumber, slot))}
        </ul>
      </div>
    );
  }

  function renderSubjectCollapsibleGroups(
    groups: SubjectScriptBundleGroup[],
    scope: "due" | "upcoming",
  ) {
    return (
      <div className={scope === "upcoming" ? "space-y-4" : "space-y-6"}>
        {groups.map((subjectGroup) => {
          const accordionId = subjectScriptAccordionId(scope, subjectGroup.key);
          const isOpen = openAccordionId === accordionId;
          return (
            <details
              key={subjectGroup.key}
              ref={(el) => {
                subjectAccordionRefs.current[accordionId] = el;
              }}
              className={`scroll-mt-4 group rounded-2xl border border-border p-4 shadow-sm sm:p-5 ${
                scope === "upcoming" ? "bg-card/60" : "bg-card"
              }`}
              open={isOpen}
            >
              <summary
                className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden"
                onClick={(e) => {
                  e.preventDefault();
                  toggleSubjectAccordion(accordionId);
                }}
              >
                <span>
                  {subjectGroup.subjectCode} — {subjectGroup.subjectName}
                  <span className="ml-2 font-normal text-muted-foreground">
                    · {subjectGroup.bundles.length}{" "}
                    {subjectGroup.bundles.length === 1 ? "paper" : "papers"}
                  </span>
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {isOpen ? "Tap to collapse" : "Tap to expand"}
                </span>
              </summary>
              {scope === "due" ? (
                <div className="mt-4 space-y-4">
                  {subjectGroup.bundles.map((bundle) => renderPaperBundleCard(bundle))}
                </div>
              ) : (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {subjectGroup.bundles.map((bundle) => (
                    <li
                      key={`${bundle.subjectId}-${bundle.paperNumber}`}
                      className="flex flex-col gap-1 text-sm text-foreground sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5"
                    >
                      <span className="font-medium">{formatUpcomingPapersLabel([bundle])}</span>
                      <span className="text-muted-foreground">
                        {bundle.examinationDate
                          ? `Scheduled ${bundle.examinationDate}`
                          : "No date in timetable"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    );
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Worked Scripts Control" staffRole="inspector">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Record scannables per envelope for Paper 1 and booklets per envelope for Paper 2 and later papers, for each
            subject and (series) after the scheduled paper date. Record Paper 1 and Paper 2 separately. Subjects are
            listed with the most recent papers first; expand one subject at a time to record or review packing.
            {data ? (
              <>
                {" "}
                <span className="font-medium text-foreground">{scriptCapsSummary(data)}</span>
              </>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-accent">Blue accent</span> marks Paper 1 sections;{" "}
            <span className="font-medium text-success">green accent</span> marks Paper 2. Always match counts to the
            paper label and P1/P2 badge before saving.
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
                  setOpenAccordionId(null);
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
              No examination records for this school for this examination. Contact Mr. Philip Quarm on 055 812 4495 for assistance.
            </p>
          ) : null}

          {partitioned ? (
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

              {listHint ? <p className="text-sm text-muted-foreground">{listHint}</p> : null}

              {dueSubjectGroups.length > 0 ? (
                renderSubjectCollapsibleGroups(dueSubjectGroups, "due")
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                  No papers due for packing yet.
                </p>
              )}

              {showUpcoming && upcomingSubjectGroups.length > 0 ? (
                <section className="space-y-3 border-t border-border pt-8">
                  <h2 className="text-base font-semibold text-foreground">Upcoming</h2>
                  <p className="text-xs text-muted-foreground">
                    Packing is available on or after each paper&apos;s scheduled date.
                  </p>
                  {renderSubjectCollapsibleGroups(upcomingSubjectGroups, "upcoming")}
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
