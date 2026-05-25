"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  displayQuestionPaperSubjectCode,
  questionPaperBundleLabel,
  getPaperInspectorVisuals,
  groupQuestionPaperBundlesBySubject,
  isQuestionPaperBundleFullyRecorded,
  isQuestionPaperSeriesRecorded,
  partitionQuestionPaperDueAndUpcoming,
  questionPaperAccordionId,
  questionPaperDueListHint,
  sortQuestionPaperSubjectBundleGroups,
  sortQuestionPaperSubjectBundleGroupsAscending,
  seriesInspectorBadgeClass,
  type QuestionPaperBundle,
  type SubjectQuestionPaperBundleGroup,
} from "@/lib/paper-inspector-styles";
import {
  getMyCenterQuestionPaperControl,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  upsertQuestionPaperSlot,
  type Examination,
  type MyCenterQuestionPaperControlResponse,
  type MyInspectorPostingRow,
  type QuestionPaperSeriesSlotResponse,
} from "@/lib/api";
import { inspectorMustPickWorkspaceGlobally, pickInspectorPostingId } from "@/lib/auth";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

type SlotDraft = {
  copies_received: number | null;
  copies_used: number | null;
  copies_to_library: number | null;
  copies_remaining: number | null;
};

type ResolvedSlotCounts = {
  copies_received: number;
  copies_used: number;
  copies_to_library: number;
  copies_remaining: number;
};

function slotKey(subjectId: number, paperNumber: number, seriesNumber: number) {
  return `${subjectId}-${paperNumber}-${seriesNumber}`;
}

function emptyDraft(): SlotDraft {
  return {
    copies_received: null,
    copies_used: null,
    copies_to_library: null,
    copies_remaining: null,
  };
}

function draftFromSlot(ser: QuestionPaperSeriesSlotResponse): SlotDraft {
  if (!isQuestionPaperSeriesRecorded(ser)) {
    return emptyDraft();
  }
  return {
    copies_received: ser.copies_received,
    copies_used: ser.copies_used,
    copies_to_library: ser.copies_to_library,
    copies_remaining: ser.copies_remaining,
  };
}

function draftsFromData(data: MyCenterQuestionPaperControlResponse): Record<string, SlotDraft> {
  const out: Record<string, SlotDraft> = {};
  for (const sub of data.subjects) {
    for (const paper of sub.papers) {
      for (const ser of paper.series) {
        out[slotKey(sub.subject_id, paper.paper_number, ser.series_number)] = draftFromSlot(ser);
      }
    }
  }
  return out;
}

function resolveDraft(draft: SlotDraft): ResolvedSlotCounts {
  return {
    copies_received: draft.copies_received ?? 0,
    copies_used: draft.copies_used ?? 0,
    copies_to_library: draft.copies_to_library ?? 0,
    copies_remaining: draft.copies_remaining ?? 0,
  };
}

function allocationTotal(d: ResolvedSlotCounts): number {
  return d.copies_used + d.copies_to_library + d.copies_remaining;
}

function countsConstraintMessage(d: ResolvedSlotCounts): string | null {
  const alloc = allocationTotal(d);
  if (alloc > d.copies_received) {
    return `Used + library + remaining (${alloc}) cannot exceed received (${d.copies_received}).`;
  }
  return null;
}

function isDraftAllZero(d: ResolvedSlotCounts): boolean {
  return (
    d.copies_received === 0 &&
    d.copies_used === 0 &&
    d.copies_to_library === 0 &&
    d.copies_remaining === 0
  );
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

export default function InspectorQuestionPaperControlPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [postings, setPostings] = useState<MyInspectorPostingRow[]>([]);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [data, setData] = useState<MyCenterQuestionPaperControlResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SlotDraft>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [openAccordionId, setOpenAccordionId] = useState<string | null>(null);
  const [openSeriesKey, setOpenSeriesKey] = useState<string | null>(null);
  const subjectAccordionRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});
  const [isLgUp, setIsLgUp] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLgUp(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const loadData = useCallback(async () => {
    if (examId === null) return;
    if (postings.length > 0 && !selectedPostingId) return;
    setLoadError(null);
    setBusy(true);
    try {
      const postingParam = postings.length > 0 ? selectedPostingId! : undefined;
      const res = await getMyCenterQuestionPaperControl(examId, postingParam);
      setData(res);
      setDrafts(draftsFromData(res));
      setSlotErrors({});
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load question paper control");
      setData(null);
      setDrafts({});
      setOpenAccordionId(null);
      setOpenSeriesKey(null);
    } finally {
      setBusy(false);
    }
  }, [examId, postings.length, selectedPostingId]);

  useEffect(() => {
    if (inspectorMustPickWorkspaceGlobally(postings.length)) {
      router.replace("/dashboard/inspector/select-workspace");
    }
  }, [postings.length, router]);

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
    if (examId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const postingRes = await getMyInspectorPostings(examId);
        if (cancelled) return;
        setPostings(postingRes.items);
        setSelectedPostingId((prev) => pickInspectorPostingId(postingRes.items, prev));
      } catch {
        if (cancelled) return;
        setPostings([]);
        setSelectedPostingId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (examId !== null && (postings.length === 0 || selectedPostingId)) {
      void loadData();
    } else {
      setData(null);
      setDrafts({});
    }
  }, [examId, postings.length, selectedPostingId, loadData]);

  useEffect(() => {
    setOpenAccordionId(null);
    setOpenSeriesKey(null);
    setSlotErrors({});
  }, [examId, selectedPostingId, postings.length]);

  function toggleSeriesAccordion(key: string) {
    setOpenSeriesKey((prev) => (prev === key ? null : key));
  }

  function updateDraft(key: string, field: keyof SlotDraft, raw: string) {
    setSlotErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDrafts((prev) => {
      const cur = prev[key] ?? emptyDraft();
      let value: number | null = null;
      if (raw !== "") {
        const n = parseInt(raw, 10);
        value = Number.isNaN(n) ? null : Math.max(0, n);
      }
      return { ...prev, [key]: { ...cur, [field]: value } };
    });
  }

  async function onSave(subjectId: number, paperNumber: number, seriesNumber: number) {
    if (examId === null) return;
    const key = slotKey(subjectId, paperNumber, seriesNumber);
    const draft = drafts[key] ?? emptyDraft();
    const resolved = resolveDraft(draft);
    if (isDraftAllZero(resolved)) {
      setSlotErrors((prev) => ({
        ...prev,
        [key]: "Enter question paper counts before saving.",
      }));
      return;
    }
    const constraint = countsConstraintMessage(resolved);
    if (constraint) {
      setSlotErrors((prev) => ({ ...prev, [key]: constraint }));
      return;
    }

    setSavingKey(key);
    setSlotErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await upsertQuestionPaperSlot(
        examId,
        {
          subject_id: subjectId,
          paper_number: paperNumber,
          series_number: seriesNumber,
          copies_received: resolved.copies_received,
          copies_used: resolved.copies_used,
          copies_to_library: resolved.copies_to_library,
          copies_remaining: resolved.copies_remaining,
        },
        postings.length > 0 ? selectedPostingId! : undefined,
      );
      await loadData();
    } catch (e) {
      setSlotErrors((prev) => ({
        ...prev,
        [key]: e instanceof Error ? e.message : "Save failed",
      }));
    } finally {
      setSavingKey(null);
    }
  }

  const partitioned =
    data && data.subjects.length > 0
      ? partitionQuestionPaperDueAndUpcoming(data.subjects, localTodayIso())
      : null;
  const dueSubjectGroups = partitioned
    ? sortQuestionPaperSubjectBundleGroups(groupQuestionPaperBundlesBySubject(partitioned.due))
    : [];
  const upcomingSubjectGroups = partitioned
    ? sortQuestionPaperSubjectBundleGroupsAscending(
        groupQuestionPaperBundlesBySubject(partitioned.upcoming),
      )
    : [];
  const listHint = partitioned ? questionPaperDueListHint(partitioned.due, partitioned.upcoming) : null;

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

  function renderSeriesForm(
    subjectId: number,
    paperNumber: number,
    slot: QuestionPaperSeriesSlotResponse,
  ) {
    const key = slotKey(subjectId, paperNumber, slot.series_number);
    const draft = drafts[key] ?? draftFromSlot(slot);
    const resolved = resolveDraft(draft);
    const constraint = countsConstraintMessage(resolved);
    const slotError = slotErrors[key];
    const saving = savingKey === key;
    const paperVisuals = getPaperInspectorVisuals(paperNumber);
    const alloc = allocationTotal(resolved);

    return (
      <div className={`w-full space-y-3 max-lg:pt-2 lg:mt-3 lg:pt-3 ${paperVisuals.editDividerClass}`}>
        {slotError || constraint ? (
          <p className="text-sm text-destructive">{slotError ?? constraint}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-3">
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
              value={draft.copies_received === null ? "" : draft.copies_received}
              onChange={(e) => updateDraft(key, "copies_received", e.target.value)}
              disabled={busy || saving}
              aria-invalid={constraint || slotError ? true : undefined}
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
              value={draft.copies_used === null ? "" : draft.copies_used}
              onChange={(e) => updateDraft(key, "copies_used", e.target.value)}
              disabled={busy || saving}
              aria-invalid={constraint || slotError ? true : undefined}
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
              value={draft.copies_to_library === null ? "" : draft.copies_to_library}
              onChange={(e) => updateDraft(key, "copies_to_library", e.target.value)}
              disabled={busy || saving}
              aria-invalid={constraint || slotError ? true : undefined}
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
              value={draft.copies_remaining === null ? "" : draft.copies_remaining}
              onChange={(e) => updateDraft(key, "copies_remaining", e.target.value)}
              disabled={busy || saving}
              aria-invalid={constraint || slotError ? true : undefined}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Used: <span className="font-medium tabular-nums text-foreground">{alloc}</span>
        </p>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || saving || Boolean(constraint)}
          onClick={() => void onSave(subjectId, paperNumber, slot.series_number)}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  function renderSeriesRow(subjectId: number, paperNumber: number, slot: QuestionPaperSeriesSlotResponse) {
    const paperVisuals = getPaperInspectorVisuals(paperNumber);
    const key = slotKey(subjectId, paperNumber, slot.series_number);
    const seriesOpen = isLgUp || openSeriesKey === key;
    const recorded = isQuestionPaperSeriesRecorded(slot);
    const summaryHint = slot.verified
      ? "Confirmed"
      : recorded
        ? `Rcvd ${slot.copies_received} · Used ${slot.copies_used} · Lib ${slot.copies_to_library} · Rem ${slot.copies_remaining}`
        : "Tap to expand";
    const summaryAction = seriesOpen ? "Tap to collapse" : summaryHint;

    const seriesBody = slot.verified ? (
      <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-3 max-lg:mt-2 lg:mt-3">
        <p className="text-sm font-medium text-foreground">Confirmed by depot keeper</p>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
          Rcvd {slot.copies_received} · Used {slot.copies_used} · Lib {slot.copies_to_library} · Rem{" "}
          {slot.copies_remaining}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">This slot can no longer be edited.</p>
      </div>
    ) : (
      renderSeriesForm(subjectId, paperNumber, slot)
    );

    const mobileOpen = !isLgUp && openSeriesKey === key;

    return (
      <li key={slot.series_number} className={paperVisuals.seriesRowClass}>
        {/* Desktop: always expanded, one series label */}
        <div className="hidden lg:block">
          <span className={seriesInspectorBadgeClass} title="Question paper series">
            Series {slot.series_number}
          </span>
          {seriesBody}
        </div>

        {/* Mobile: collapsible; label lives only in the summary row */}
        <details
          className="w-full rounded-lg border border-border/70 bg-background/40 lg:hidden"
          open={mobileOpen}
        >
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden"
            onClick={(e) => {
              e.preventDefault();
              toggleSeriesAccordion(key);
            }}
          >
            <span className={seriesInspectorBadgeClass} title="Question paper series">
              Series {slot.series_number}
            </span>
            <span className="shrink-0 text-right text-xs font-normal text-muted-foreground">
              {summaryAction}
            </span>
          </summary>
          {mobileOpen ? <div className="border-t border-border/70 px-3 pb-3 pt-2">{seriesBody}</div> : null}
        </details>
      </li>
    );
  }

  function renderPaperBundleCard(bundle: QuestionPaperBundle) {
    const v = getPaperInspectorVisuals(bundle.paperNumber);
    const fullyRecorded = isQuestionPaperBundleFullyRecorded(bundle);
    const paperTitle = questionPaperBundleLabel(bundle);
    const badgeLabel =
      bundle.coversPapers.length > 1
        ? bundle.coversPapers.map((n) => `P${n}`).join("·")
        : v.badgeShortLabel;
    return (
      <div key={`${bundle.subjectId}-${bundle.coversPapers.join("-")}`} className={v.cardClass}>
        <h3 className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {displayQuestionPaperSubjectCode(bundle)} — {bundle.subjectName}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`${v.badgeClass} px-2.5 py-1 text-sm font-bold`}
              title={paperTitle}
            >
              {badgeLabel}
            </span>
            <span className="text-xl font-bold tabular-nums tracking-tight text-card-foreground">
              {paperTitle}
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
    groups: SubjectQuestionPaperBundleGroup[],
    scope: "due" | "upcoming",
  ) {
    return (
      <div className={scope === "upcoming" ? "space-y-4" : "space-y-6"}>
        {groups.map((subjectGroup) => {
          const accordionId = questionPaperAccordionId(scope, subjectGroup.key);
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
                      key={`${bundle.subjectId}-${bundle.coversPapers.join("-")}`}
                      className="flex flex-col gap-1 text-sm text-foreground sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5"
                    >
                      <span className="font-medium">{questionPaperBundleLabel(bundle)}</span>
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
      <DashboardShell title="Question paper control" staffRole="inspector">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            After each paper, record how many question paper copies your centre received, used, sent to the
            school library, and have remaining — for each subject, paper, and series.
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

          {data ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Centre:</span> {data.center_name} ({data.center_code})
            </p>
          ) : null}

          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {busy && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

          {data && data.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subjects in scope for this examination (check registrations and timetable).
            </p>
          ) : null}

          {partitioned ? (
            <div className="space-y-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-foreground">Needs question paper counts</h2>
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
                  No papers due for question paper counts yet.
                </p>
              )}

              {showUpcoming && upcomingSubjectGroups.length > 0 ? (
                <section className="space-y-3 border-t border-border pt-8">
                  <h2 className="text-base font-semibold text-foreground">Upcoming</h2>
                  <p className="text-xs text-muted-foreground">
                    Recording is available on or after each paper&apos;s scheduled date.
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
