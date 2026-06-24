"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  PackagePlus,
  Search,
  Trash2,
} from "lucide-react";

import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type AllocationAssignmentItem,
  type AllocationRunDetail,
  type ExaminerSubjectRunSummary,
  type ExaminerTypeApi,
  type UnassignedEnvelopeItem,
} from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Panel = "assigned" | "add";

type SeriesLoad = {
  seriesNumber: number;
  envelopeCount: number;
  bookletCount: number;
};

function summarizeSeriesLoads(
  rows: Array<{ series_number: number; booklet_count: number }>,
): SeriesLoad[] {
  const map = new Map<number, SeriesLoad>();
  for (const row of rows) {
    const existing = map.get(row.series_number);
    if (existing) {
      existing.envelopeCount += 1;
      existing.bookletCount += row.booklet_count;
    } else {
      map.set(row.series_number, {
        seriesNumber: row.series_number,
        envelopeCount: 1,
        bookletCount: row.booklet_count,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.seriesNumber - b.seriesNumber);
}

function formatSeriesLabel(loads: SeriesLoad[]): string {
  if (loads.length === 0) return "None";
  return loads.map((s) => `Series ${s.seriesNumber}`).join(", ");
}

function examinerTypeLabel(t: ExaminerTypeApi): string {
  if (t === "chief_examiner") return "Chief";
  if (t === "assistant_chief_examiner") return "Asst chief";
  if (t === "team_leader") return "Team leader";
  return "Assistant";
}

type EnvelopeSortRow = {
  school_code: string;
  series_number: number;
  booklet_count: number;
  envelope_number: number;
};

function compareEnvelopesForDisplay(a: EnvelopeSortRow, b: EnvelopeSortRow): number {
  const bySchool = a.school_code.localeCompare(b.school_code, undefined, { sensitivity: "base" });
  if (bySchool !== 0) return bySchool;
  if (a.series_number !== b.series_number) return a.series_number - b.series_number;
  if (a.booklet_count !== b.booklet_count) return b.booklet_count - a.booklet_count;
  return a.envelope_number - b.envelope_number;
}

export function isEnvelopeEligibleForExaminer(
  envelope: UnassignedEnvelopeItem,
  examinerId: string,
): boolean {
  const ids = envelope.eligible_examiner_ids;
  if (!ids || ids.length === 0) return true;
  return ids.includes(examinerId);
}

type Props = {
  examiner: ExaminerSubjectRunSummary | null;
  run: AllocationRunDetail | null;
  subjectId: number;
  paperNumber: number;
  subjectLabel: string;
  assignedRows: AllocationAssignmentItem[];
  unassignedEnvelopes: UnassignedEnvelopeItem[];
  enforceSingleSeriesPerExaminer?: boolean;
  /** Super admin / test admin may assign outside cross-marking rules (marked as manual override). */
  allowCrossMarkingOverride?: boolean;
  /** Ordered list for prev/next navigation (typically the filtered examiner loads table). */
  examinerList?: ExaminerSubjectRunSummary[];
  onSelectExaminer?: (examiner: ExaminerSubjectRunSummary) => void;
  busy: boolean;
  onClose: () => void;
  onRemove: (scriptEnvelopeId: string) => void | Promise<void>;
  onAssign: (scriptEnvelopeIds: string[]) => void | Promise<void>;
};

export function ExaminerAssignmentModal({
  examiner,
  run,
  subjectId,
  paperNumber,
  subjectLabel,
  assignedRows,
  unassignedEnvelopes,
  enforceSingleSeriesPerExaminer = true,
  allowCrossMarkingOverride = false,
  examinerList = [],
  onSelectExaminer,
  busy,
  onClose,
  onRemove,
  onAssign,
}: Props) {
  const open = examiner != null && run != null;

  const [panel, setPanel] = useState<Panel>("assigned");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterZone, setFilterZone] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  useEffect(() => {
    if (!examiner) return;
    setFilterRegion("");
    setFilterZone("");
    setFilterSeries("");
    setSearch("");
    setSelectedIds({});
    setAssignError(null);
    setAssignSuccess(null);
    setPendingRemoveId(null);
    setPanel(assignedRows.length === 0 ? "add" : "assigned");
    // Reset only when opening for a different examiner or run — not after each assign/remove.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignedRows.length intentionally excluded
  }, [examiner?.examiner_id, run?.id]);

  const examinerNavIndex = useMemo(() => {
    if (!examiner || examinerList.length === 0) return -1;
    return examinerList.findIndex(
      (row) => row.examiner_id === examiner.examiner_id && row.subject_id === examiner.subject_id,
    );
  }, [examiner, examinerList]);

  const canGoPrevExaminer = examinerNavIndex > 0;
  const canGoNextExaminer = examinerNavIndex >= 0 && examinerNavIndex < examinerList.length - 1;
  const showExaminerNav = examinerList.length > 1 && examinerNavIndex >= 0 && onSelectExaminer != null;

  const goPrevExaminer = useCallback(() => {
    if (!canGoPrevExaminer || !onSelectExaminer) return;
    onSelectExaminer(examinerList[examinerNavIndex - 1]);
  }, [canGoPrevExaminer, examinerList, examinerNavIndex, onSelectExaminer]);

  const goNextExaminer = useCallback(() => {
    if (!canGoNextExaminer || !onSelectExaminer) return;
    onSelectExaminer(examinerList[examinerNavIndex + 1]);
  }, [canGoNextExaminer, examinerList, examinerNavIndex, onSelectExaminer]);

  useEffect(() => {
    if (!open || busy || !showExaminerNav) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowLeft" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        goPrevExaminer();
      } else if (e.key === "ArrowRight" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        goNextExaminer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, showExaminerNav, goPrevExaminer, goNextExaminer]);

  const assignedBookletTotal = useMemo(
    () => assignedRows.reduce((sum, r) => sum + r.booklet_count, 0),
    [assignedRows],
  );

  const assignedSeriesLoads = useMemo(() => summarizeSeriesLoads(assignedRows), [assignedRows]);

  const sortedAssignedRows = useMemo(
    () => [...assignedRows].sort(compareEnvelopesForDisplay),
    [assignedRows],
  );

  const eligibleUnassigned = useMemo(() => {
    if (!examiner) return [];
    return unassignedEnvelopes.filter(
      (row) =>
        row.subject_id === subjectId &&
        row.paper_number === paperNumber &&
        isEnvelopeEligibleForExaminer(row, examiner.examiner_id),
    );
  }, [unassignedEnvelopes, examiner, subjectId, paperNumber]);

  const ineligibleUnassigned = useMemo(() => {
    if (!examiner || !allowCrossMarkingOverride) return [];
    return unassignedEnvelopes.filter(
      (row) =>
        row.subject_id === subjectId &&
        row.paper_number === paperNumber &&
        !isEnvelopeEligibleForExaminer(row, examiner.examiner_id),
    );
  }, [unassignedEnvelopes, examiner, subjectId, paperNumber, allowCrossMarkingOverride]);

  const addPanelEnvelopes = useMemo(
    () => [...eligibleUnassigned, ...ineligibleUnassigned].sort(compareEnvelopesForDisplay),
    [eligibleUnassigned, ineligibleUnassigned],
  );

  const isEnvelopeOutsideRules = useCallback(
    (envelopeId: string) =>
      ineligibleUnassigned.some((row) => row.script_envelope_id === envelopeId),
    [ineligibleUnassigned],
  );

  const assignedOverrideCount = useMemo(
    () => assignedRows.filter((row) => row.cross_marking_override).length,
    [assignedRows],
  );

  const regionFilterOptions = useMemo(() => {
    const set = new Set(
      addPanelEnvelopes.map((r) => (r.region ?? "").trim()).filter((s) => s.length > 0),
    );
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [addPanelEnvelopes]);

  const zoneFilterOptions = useMemo(() => {
    let rows = addPanelEnvelopes;
    if (filterRegion) rows = rows.filter((r) => (r.region ?? "") === filterRegion);
    const set = new Set(rows.map((r) => r.zone).filter((z) => z && String(z).trim().length > 0));
    return [...set].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
  }, [addPanelEnvelopes, filterRegion]);

  const seriesFilterOptions = useMemo(() => {
    let rows = addPanelEnvelopes;
    if (filterRegion) rows = rows.filter((r) => (r.region ?? "") === filterRegion);
    if (filterZone) rows = rows.filter((r) => r.zone === filterZone);
    const set = new Set(rows.map((r) => r.series_number));
    return [...set].sort((a, b) => a - b);
  }, [addPanelEnvelopes, filterRegion, filterZone]);

  const filteredEligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return addPanelEnvelopes.filter((row) => {
      if (filterRegion && (row.region ?? "") !== filterRegion) return false;
      if (filterZone && row.zone !== filterZone) return false;
      if (filterSeries && String(row.series_number) !== filterSeries) return false;
      if (!q) return true;
      const haystack = [
        row.school_code,
        row.school_name,
        row.region ?? "",
        row.zone,
        String(row.series_number),
        String(row.envelope_number),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }).sort(compareEnvelopesForDisplay);
  }, [addPanelEnvelopes, filterRegion, filterZone, filterSeries, search]);

  const selectedEnvelopeIds = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([id]) => id),
    [selectedIds],
  );

  const selectedBookletTotal = useMemo(() => {
    const byId = new Map(addPanelEnvelopes.map((r) => [r.script_envelope_id, r.booklet_count]));
    return selectedEnvelopeIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
  }, [addPanelEnvelopes, selectedEnvelopeIds]);

  const selectedSeriesLoads = useMemo(() => {
    const rows = addPanelEnvelopes.filter((row) => selectedIds[row.script_envelope_id]);
    return summarizeSeriesLoads(rows);
  }, [addPanelEnvelopes, selectedIds]);

  const resultingSeriesLoads = useMemo(() => {
    const rows = [
      ...assignedRows,
      ...addPanelEnvelopes.filter((row) => selectedIds[row.script_envelope_id]),
    ];
    return summarizeSeriesLoads(rows);
  }, [assignedRows, addPanelEnvelopes, selectedIds]);

  const resultingEnvelopeCount = assignedRows.length + selectedEnvelopeIds.length;
  const resultingBookletTotal = assignedBookletTotal + selectedBookletTotal;

  const resultingDeviation =
    examiner?.quota_booklets != null ? resultingBookletTotal - examiner.quota_booklets : null;

  const resultingQuotaPercent = useMemo(() => {
    if (!examiner?.quota_booklets || examiner.quota_booklets <= 0) return null;
    return Math.min(100, Math.round((resultingBookletTotal / examiner.quota_booklets) * 100));
  }, [examiner?.quota_booklets, resultingBookletTotal]);

  const allFilteredSelected =
    filteredEligible.length > 0 && filteredEligible.every((r) => selectedIds[r.script_envelope_id]);

  const totalUnassignedForPaper = useMemo(
    () =>
      unassignedEnvelopes.filter(
        (row) => row.subject_id === subjectId && row.paper_number === paperNumber,
      ).length,
    [unassignedEnvelopes, subjectId, paperNumber],
  );

  const quotaPercent = useMemo(() => {
    if (!examiner?.quota_booklets || examiner.quota_booklets <= 0) return null;
    return Math.min(100, Math.round((assignedBookletTotal / examiner.quota_booklets) * 100));
  }, [examiner?.quota_booklets, assignedBookletTotal]);

  const showAssignmentPreview = panel === "add" && selectedEnvelopeIds.length > 0;

  const filtersActive = Boolean(filterRegion || filterZone || filterSeries || search.trim());

  /** Manual assign: test/super admin may assign multiple series even when the campaign defaults to one. */
  const blockSingleSeriesManual = enforceSingleSeriesPerExaminer && !allowCrossMarkingOverride;

  const hasMultipleAssignedSeries = assignedSeriesLoads.length > 1;
  const willHaveMultipleSeries =
    resultingSeriesLoads.length > 1 ||
    (assignedSeriesLoads.length > 0 &&
      selectedSeriesLoads.some(
        (s) => !assignedSeriesLoads.some((a) => a.seriesNumber === s.seriesNumber),
      ));

  const seriesConflictBlocked =
    blockSingleSeriesManual &&
    assignedSeriesLoads.length > 0 &&
    selectedSeriesLoads.some(
      (selected) => !assignedSeriesLoads.some((assigned) => assigned.seriesNumber === selected.seriesNumber),
    );

  const selectedSeriesConflictBlocked = blockSingleSeriesManual && selectedSeriesLoads.length > 1;

  if (!examiner || !run) return null;

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const row of filteredEligible) {
        next[row.script_envelope_id] = checked;
      }
      return next;
    });
  }

  function toggleRow(envelopeId: string) {
    setSelectedIds((prev) => ({
      ...prev,
      [envelopeId]: !prev[envelopeId],
    }));
  }

  async function handleAssignSelected() {
    if (selectedEnvelopeIds.length === 0) {
      setAssignError("Select at least one envelope.");
      return;
    }
    if (seriesConflictBlocked || selectedSeriesConflictBlocked) {
      setAssignError(
        `This campaign allows one series per examiner. Assigned series: ${formatSeriesLabel(assignedSeriesLoads)}.`,
      );
      return;
    }
    setAssignError(null);
    setAssignSuccess(null);
    try {
      await onAssign(selectedEnvelopeIds);
      const overrideCount = selectedEnvelopeIds.filter((id) => isEnvelopeOutsideRules(id)).length;
      setSelectedIds({});
      setAssignSuccess(
        overrideCount > 0
          ? `Assigned ${selectedEnvelopeIds.length} envelope${selectedEnvelopeIds.length === 1 ? "" : "s"} (${selectedBookletTotal} booklets). ${overrideCount} marked as manual override.`
          : `Assigned ${selectedEnvelopeIds.length} envelope${selectedEnvelopeIds.length === 1 ? "" : "s"} (${selectedBookletTotal} booklets).`,
      );
      setPanel("assigned");
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Assign failed");
    }
  }

  async function handleConfirmRemove(scriptEnvelopeId: string) {
    setAssignError(null);
    setAssignSuccess(null);
    try {
      await onRemove(scriptEnvelopeId);
      setPendingRemoveId(null);
      setAssignSuccess("Envelope returned to the unassigned pool.");
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Remove failed");
      setPendingRemoveId(null);
    }
  }

  const footer =
    panel === "add" && addPanelEnvelopes.length > 0 ? (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          {selectedEnvelopeIds.length > 0 ? (
            <div className="space-y-1 text-xs leading-snug">
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums text-foreground">
                <span>
                  <span className="text-muted-foreground">Load </span>
                  <span className="font-medium">{assignedBookletTotal}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    bk · {assignedRows.length} env
                  </span>
                </span>
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
                <span>
                  <span className="text-muted-foreground">+</span>
                  <span className="font-medium text-primary">{selectedBookletTotal}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    bk · {selectedEnvelopeIds.length} env
                  </span>
                </span>
                <span className="text-muted-foreground" aria-hidden>
                  =
                </span>
                <span>
                  <span className="font-semibold">{resultingBookletTotal}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    bk · {resultingEnvelopeCount} env
                  </span>
                  {examiner.quota_booklets != null && resultingDeviation != null ? (
                    <span
                      className={cn(
                        "ml-1 font-medium",
                        resultingDeviation > 0
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground",
                      )}
                    >
                      ({resultingDeviation > 0 ? "+" : ""}
                      {resultingDeviation} quota)
                    </span>
                  ) : null}
                </span>
                <span className="hidden text-muted-foreground sm:inline" aria-hidden>
                  ·
                </span>
                <span className="text-muted-foreground">
                  {formatSeriesLabel(resultingSeriesLoads)}
                </span>
              </p>
              {seriesConflictBlocked || selectedSeriesConflictBlocked ? (
                <p className="truncate text-amber-800 dark:text-amber-200">
                  {seriesConflictBlocked
                    ? `Different series than current ${formatSeriesLabel(assignedSeriesLoads)}.`
                    : "Selection spans multiple series; only one allowed per examiner."}
                </p>
              ) : willHaveMultipleSeries && allowCrossMarkingOverride ? (
                <p className="truncate text-amber-800 dark:text-amber-200">
                  Spans multiple series — labelled on the allocation form.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select envelopes below to preview load changes.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {selectedEnvelopeIds.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setSelectedIds({})}
            >
              Clear selection
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy || selectedEnvelopeIds.length === 0 || seriesConflictBlocked || selectedSeriesConflictBlocked}
            onClick={() => void handleAssignSelected()}
          >
            {busy
              ? "Assigning…"
              : `Assign to ${examiner.examiner_name}${selectedEnvelopeIds.length > 0 ? ` (${selectedEnvelopeIds.length})` : ""}`}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
    );

  return (
    <CohortModalShell
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      title={examiner.examiner_name}
      description={[
        examiner.region?.trim() ? examiner.region.trim() : null,
        subjectLabel,
        `Paper ${paperNumber}`,
        examinerTypeLabel(examiner.examiner_type),
      ]
        .filter(Boolean)
        .join(" · ")}
      className="max-w-5xl"
      headerClassName="px-5 py-2.5 sm:px-6"
      titleClassName="text-base sm:text-lg"
      descriptionClassName="text-xs line-clamp-1"
      bodyClassName="!px-0 !py-0"
      footerClassName="px-5 py-2.5 sm:px-6"
      footer={footer}
    >
      <div className="flex h-full min-h-0 flex-col">
        {showExaminerNav ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/25 px-5 py-2 sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5"
              disabled={busy || !canGoPrevExaminer}
              onClick={goPrevExaminer}
              aria-label="Previous examiner"
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {examinerNavIndex + 1} of {examinerList.length}
              </span>
              <span className="hidden sm:inline"> · use ← → keys</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5"
              disabled={busy || !canGoNextExaminer}
              onClick={goNextExaminer}
              aria-label="Next examiner"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
        <div
          className={cn(
            "shrink-0 border-b border-border bg-muted/15 px-5 sm:px-6",
            panel === "add" ? "space-y-2 py-2.5" : "space-y-3 py-3",
          )}
        >
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="h-6 px-2 text-[11px] tabular-nums">
              {assignedRows.length} env
            </Badge>
            <Badge variant="outline" className="h-6 px-2 text-[11px] tabular-nums">
              {assignedBookletTotal} bk
            </Badge>
            {examiner.quota_booklets != null ? (
              <Badge
                variant="outline"
                className={cn(
                  "h-6 px-2 text-[11px] tabular-nums",
                  examiner.deviation != null && examiner.deviation > 0
                    ? "border-amber-500/40 text-amber-800 dark:text-amber-200"
                    : "",
                )}
              >
                Quota {examiner.quota_booklets}
                {examiner.deviation != null ? ` · Δ ${examiner.deviation > 0 ? "+" : ""}${examiner.deviation}` : ""}
              </Badge>
            ) : null}
            {assignedOverrideCount > 0 ? (
              <Badge
                variant="outline"
                className="h-6 border-amber-500/40 bg-amber-500/10 px-2 text-[11px] text-amber-950 dark:text-amber-100"
              >
                {assignedOverrideCount} override{assignedOverrideCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {hasMultipleAssignedSeries ? (
              <Badge
                variant="outline"
                className="h-6 border-amber-500/50 bg-amber-500/15 px-2 text-[11px] text-amber-950 dark:text-amber-100"
              >
                Multi-series
              </Badge>
            ) : null}
            {panel === "add" && eligibleUnassigned.length > 0 ? (
              <Badge variant="outline" className="h-6 border-primary/30 bg-primary/5 px-2 text-[11px] text-foreground">
                {eligibleUnassigned.length} to add
              </Badge>
            ) : null}
            {assignedSeriesLoads.length > 0 ? (
              <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span className="font-medium uppercase tracking-wide">Series:</span>
                {assignedSeriesLoads.map((series) => (
                  <button
                    key={series.seriesNumber}
                    type="button"
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 tabular-nums transition-colors",
                      panel === "add" && filterSeries === String(series.seriesNumber)
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/80 bg-background/80 hover:bg-muted/60",
                      hasMultipleAssignedSeries && "border-amber-500/40",
                    )}
                    onClick={() => {
                      if (panel !== "add") return;
                      setFilterSeries(
                        filterSeries === String(series.seriesNumber) ? "" : String(series.seriesNumber),
                      );
                    }}
                    disabled={panel !== "add"}
                  >
                    S{series.seriesNumber}
                    <span className="text-muted-foreground">
                      {" "}
                      ({series.envelopeCount}/{series.bookletCount})
                    </span>
                  </button>
                ))}
              </span>
            ) : null}
          </div>

          {panel === "assigned" ? (
            <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Assigned series
                    {hasMultipleAssignedSeries ? (
                      <span className="ml-1.5 font-normal normal-case text-amber-800 dark:text-amber-200">
                        (multiple)
                      </span>
                    ) : null}
                  </p>
                  {assignedSeriesLoads.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">No series yet.</p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {assignedSeriesLoads.map((series) => (
                        <span
                          key={series.seriesNumber}
                          className={cn(
                            "inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 text-xs tabular-nums",
                            hasMultipleAssignedSeries
                              ? "border-amber-500/40 bg-amber-500/10"
                              : "border-primary/25 bg-primary/10",
                          )}
                        >
                          <span className="font-semibold">S{series.seriesNumber}</span>
                          <span className="text-muted-foreground">
                            {series.envelopeCount} env · {series.bookletCount} bk
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {blockSingleSeriesManual ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">One series per examiner.</p>
              ) : allowCrossMarkingOverride ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Manual assignment may span multiple series.
                </p>
              ) : null}
            </div>
          ) : null}

          {panel === "assigned" && quotaPercent != null ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Load vs quota</span>
                <span className="tabular-nums">
                  {showAssignmentPreview ? (
                    <>
                      {assignedBookletTotal}
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span
                        className={cn(
                          "font-medium text-foreground",
                          resultingDeviation != null && resultingDeviation > 0
                            ? "text-amber-700 dark:text-amber-300"
                            : "",
                        )}
                      >
                        {resultingBookletTotal}
                      </span>
                      <span className="text-muted-foreground"> / {examiner.quota_booklets}</span>
                    </>
                  ) : (
                    <>
                      {assignedBookletTotal} / {examiner.quota_booklets}
                    </>
                  )}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                {showAssignmentPreview && resultingQuotaPercent != null ? (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/20 transition-all"
                    style={{ width: `${Math.min(100, resultingQuotaPercent)}%` }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all",
                    !showAssignmentPreview && examiner.deviation != null && examiner.deviation > 0
                      ? "bg-amber-500"
                      : "bg-primary",
                  )}
                  style={{ width: `${Math.min(100, quotaPercent ?? 0)}%` }}
                />
                {showAssignmentPreview &&
                resultingQuotaPercent != null &&
                quotaPercent != null &&
                resultingQuotaPercent > quotaPercent ? (
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded-full transition-all",
                      resultingDeviation != null && resultingDeviation > 0
                        ? "bg-amber-500/80"
                        : "bg-primary/70",
                    )}
                    style={{
                      left: `${quotaPercent}%`,
                      width: `${Math.min(100, resultingQuotaPercent) - quotaPercent}%`,
                    }}
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5"
            role="tablist"
            aria-label="Assignment views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={panel === "assigned"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                panel === "assigned"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPanel("assigned")}
            >
              <ClipboardList className="size-3.5 shrink-0 opacity-70 sm:size-4" aria-hidden />
              Assigned
              <span className="rounded bg-muted px-1 py-px text-[10px] tabular-nums sm:text-xs">{assignedRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "add"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                panel === "add"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPanel("add")}
            >
              <PackagePlus className="size-3.5 shrink-0 opacity-70 sm:size-4" aria-hidden />
              Add envelopes
              {addPanelEnvelopes.length > 0 ? (
                <span className="rounded bg-primary/10 px-1 py-px text-[10px] tabular-nums text-primary sm:text-xs">
                  {addPanelEnvelopes.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {assignError ? (
          <p className="mx-5 mt-3 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:mx-6">
            {assignError}
          </p>
        ) : null}
        {assignSuccess ? (
          <p className="mx-5 mt-3 flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100 sm:mx-6">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {assignSuccess}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-3 pt-2 sm:px-6">
          {panel === "assigned" ? (
            assignedRows.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">No envelopes assigned yet.</p>
                  {eligibleUnassigned.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      onClick={() => setPanel("add")}
                    >
                      Add envelopes
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-sm">
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm leading-normal">
                    <thead>
                      <tr className="sticky top-0 z-1 border-b border-border bg-muted/90 backdrop-blur-sm">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          School
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Series / Env
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Booklets
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:nth-child(even)]:bg-muted/15">
                      {sortedAssignedRows.map((item) => {
                        const isPending = pendingRemoveId === item.script_envelope_id;
                        return (
                          <tr key={item.script_envelope_id} className="border-b border-border/70 align-middle">
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-foreground">{item.school_name}</p>
                              <p className="text-xs text-muted-foreground">{item.school_code}</p>
                              {item.cross_marking_override ? (
                                <Badge
                                  variant="outline"
                                  className="mt-1 border-amber-500/40 bg-amber-500/10 text-[10px] font-normal text-amber-950 dark:text-amber-100"
                                >
                                  Manual override
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                              {hasMultipleAssignedSeries ? (
                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/40 bg-amber-500/10 font-mono text-[11px] font-semibold tabular-nums text-amber-950 dark:text-amber-100"
                                  >
                                    Series {item.series_number}
                                  </Badge>
                                  <span>Env {item.envelope_number}</span>
                                </span>
                              ) : (
                                <>S{item.series_number} · E{item.envelope_number}</>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                              {item.booklet_count}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {isPending ? (
                                <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                  <span className="text-xs text-muted-foreground">Remove?</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs"
                                    disabled={busy}
                                    onClick={() => setPendingRemoveId(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 bg-destructive px-2.5 text-xs text-destructive-foreground hover:bg-destructive/90"
                                    disabled={busy}
                                    onClick={() => void handleConfirmRemove(item.script_envelope_id)}
                                  >
                                    Confirm
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                                  disabled={busy}
                                  onClick={() => setPendingRemoveId(item.script_envelope_id)}
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                  Remove
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : totalUnassignedForPaper === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
              All envelopes are assigned for this paper.
            </div>
          ) : addPanelEnvelopes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-950 dark:text-amber-100">
              Unassigned envelopes exist, but none are eligible for this examiner under cross-marking rules.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
              {ineligibleUnassigned.length > 0 && allowCrossMarkingOverride ? (
                <p className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
                  {ineligibleUnassigned.length} envelope{ineligibleUnassigned.length === 1 ? "" : "s"} fall outside
                  cross-marking rules for this examiner. You may assign them manually — they will be labelled{" "}
                  <strong className="font-medium">Manual override</strong> on the assigned list.
                </p>
              ) : null}
              <div className="shrink-0">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label htmlFor="add-env-filter-search" className="sr-only">
                    Search
                  </label>
                  <div className="relative mt-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      id="add-env-filter-search"
                      type="search"
                      autoComplete="off"
                      className={cn(formInputClass, "mt-0 h-8 py-1 pl-9 text-sm")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="School, zone, series…"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="add-env-filter-region" className="sr-only">
                    Region
                  </label>
                  <select
                    id="add-env-filter-region"
                    className={cn(formInputClass, "mt-0 h-8 py-1 text-sm")}
                    value={filterRegion}
                    onChange={(e) => {
                      setFilterRegion(e.target.value);
                      setFilterZone("");
                      setFilterSeries("");
                    }}
                  >
                    <option value="">All regions</option>
                    {regionFilterOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="add-env-filter-zone" className="sr-only">
                    Zone
                  </label>
                  <select
                    id="add-env-filter-zone"
                    className={cn(formInputClass, "mt-0 h-8 py-1 text-sm")}
                    value={filterZone}
                    onChange={(e) => {
                      setFilterZone(e.target.value);
                      setFilterSeries("");
                    }}
                  >
                    <option value="">All zones</option>
                    {zoneFilterOptions.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="add-env-filter-series" className="sr-only">
                    Series
                  </label>
                  <select
                    id="add-env-filter-series"
                    className={cn(formInputClass, "mt-0 h-8 py-1 text-sm")}
                    value={filterSeries}
                    onChange={(e) => setFilterSeries(e.target.value)}
                  >
                    <option value="">All series</option>
                    {seriesFilterOptions.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {filtersActive ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setFilterRegion("");
                      setFilterZone("");
                      setFilterSeries("");
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : null}
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-sm">
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm leading-normal">
                    <thead>
                      <tr className="sticky top-0 z-1 border-b border-border bg-muted/90 backdrop-blur-sm">
                        <th scope="col" className="w-10 px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input-border"
                            checked={allFilteredSelected}
                            onChange={(e) => toggleAll(e.target.checked)}
                            aria-label="Select all visible envelopes"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          School
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Location
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Series / Env
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Booklets
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:nth-child(even)]:bg-muted/15">
                      {filteredEligible.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                            No envelopes match the current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredEligible.map((row) => {
                          const selected = Boolean(selectedIds[row.script_envelope_id]);
                          const outsideRules = isEnvelopeOutsideRules(row.script_envelope_id);
                          const matchesAssignedSeries =
                            assignedSeriesLoads.length > 0 &&
                            assignedSeriesLoads.some((s) => s.seriesNumber === row.series_number);
                          const conflictsAssignedSeries =
                            blockSingleSeriesManual &&
                            assignedSeriesLoads.length > 0 &&
                            !matchesAssignedSeries;
                          return (
                            <tr
                              key={row.script_envelope_id}
                              className={cn(
                                "cursor-pointer border-b border-border/70 align-middle transition-colors hover:bg-muted/30",
                                selected && "bg-primary/5",
                                !selected && matchesAssignedSeries && "bg-primary/[0.03]",
                                conflictsAssignedSeries && "opacity-60",
                              )}
                              onClick={() => toggleRow(row.script_envelope_id)}
                            >
                              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-input-border"
                                  checked={selected}
                                  onChange={(e) =>
                                    setSelectedIds((prev) => ({
                                      ...prev,
                                      [row.script_envelope_id]: e.target.checked,
                                    }))
                                  }
                                  aria-label={`Select envelope ${row.envelope_number} at ${row.school_name}`}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-foreground">{row.school_name}</p>
                                <p className="text-xs text-muted-foreground">{row.school_code}</p>
                                {outsideRules ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 border-amber-500/40 bg-amber-500/10 text-[10px] font-normal text-amber-950 dark:text-amber-100"
                                  >
                                    Outside cross-marking rules
                                  </Badge>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground">
                                <p>{(row.region ?? "").trim() || "—"}</p>
                                <p className="text-xs">Zone {row.zone}</p>
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                                S{row.series_number} · E{row.envelope_number}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                                {row.booklet_count}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </CohortModalShell>
  );
}

export function envelopeEligibleExaminerOptions(
  envelope: UnassignedEnvelopeItem,
  poolRows: Array<{
    examiner_id: string;
    examiner_name: string;
    reference_code: string | null;
    examiner_type: ExaminerTypeApi;
  }>,
  allowCrossMarkingOverride = false,
): Array<{ value: string; label: string }> {
  const eligibleIds = envelope.eligible_examiner_ids;
  return [...poolRows]
    .sort((a, b) => a.examiner_name.localeCompare(b.examiner_name, undefined, { sensitivity: "base" }))
    .map((r) => {
      const eligible =
        !eligibleIds || eligibleIds.length === 0 || eligibleIds.includes(r.examiner_id);
      if (!eligible && !allowCrossMarkingOverride) return null;
      const base = r.reference_code
        ? `${r.reference_code} · ${r.examiner_name} (${examinerTypeLabel(r.examiner_type)})`
        : `${r.examiner_name} (${examinerTypeLabel(r.examiner_type)})`;
      return {
        value: r.examiner_id,
        label: eligible ? base : `${base} — outside cross-marking rules`,
      };
    })
    .filter((row): row is { value: string; label: string } => row != null);
}
