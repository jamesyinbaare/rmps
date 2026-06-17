"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
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
import { formInputClass, formLabelClass } from "@/lib/form-classes";
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

function isEnvelopeEligibleForExaminer(
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

  const assignedBookletTotal = useMemo(
    () => assignedRows.reduce((sum, r) => sum + r.booklet_count, 0),
    [assignedRows],
  );

  const assignedSeriesLoads = useMemo(() => summarizeSeriesLoads(assignedRows), [assignedRows]);

  const eligibleUnassigned = useMemo(() => {
    if (!examiner) return [];
    return unassignedEnvelopes.filter(
      (row) =>
        row.subject_id === subjectId &&
        row.paper_number === paperNumber &&
        isEnvelopeEligibleForExaminer(row, examiner.examiner_id),
    );
  }, [unassignedEnvelopes, examiner, subjectId, paperNumber]);

  const regionFilterOptions = useMemo(() => {
    const set = new Set(
      eligibleUnassigned.map((r) => (r.region ?? "").trim()).filter((s) => s.length > 0),
    );
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [eligibleUnassigned]);

  const zoneFilterOptions = useMemo(() => {
    let rows = eligibleUnassigned;
    if (filterRegion) rows = rows.filter((r) => (r.region ?? "") === filterRegion);
    const set = new Set(rows.map((r) => r.zone).filter((z) => z && String(z).trim().length > 0));
    return [...set].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
  }, [eligibleUnassigned, filterRegion]);

  const seriesFilterOptions = useMemo(() => {
    let rows = eligibleUnassigned;
    if (filterRegion) rows = rows.filter((r) => (r.region ?? "") === filterRegion);
    if (filterZone) rows = rows.filter((r) => r.zone === filterZone);
    const set = new Set(rows.map((r) => r.series_number));
    return [...set].sort((a, b) => a - b);
  }, [eligibleUnassigned, filterRegion, filterZone]);

  const filteredEligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligibleUnassigned.filter((row) => {
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
    });
  }, [eligibleUnassigned, filterRegion, filterZone, filterSeries, search]);

  const selectedEnvelopeIds = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([id]) => id),
    [selectedIds],
  );

  const selectedBookletTotal = useMemo(() => {
    const byId = new Map(eligibleUnassigned.map((r) => [r.script_envelope_id, r.booklet_count]));
    return selectedEnvelopeIds.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
  }, [eligibleUnassigned, selectedEnvelopeIds]);

  const selectedSeriesLoads = useMemo(() => {
    const rows = eligibleUnassigned.filter((row) => selectedIds[row.script_envelope_id]);
    return summarizeSeriesLoads(rows);
  }, [eligibleUnassigned, selectedIds]);

  const resultingSeriesLoads = useMemo(() => {
    const rows = [
      ...assignedRows,
      ...eligibleUnassigned.filter((row) => selectedIds[row.script_envelope_id]),
    ];
    return summarizeSeriesLoads(rows);
  }, [assignedRows, eligibleUnassigned, selectedIds]);

  const seriesConflict =
    enforceSingleSeriesPerExaminer &&
    assignedSeriesLoads.length > 0 &&
    selectedSeriesLoads.some(
      (selected) => !assignedSeriesLoads.some((assigned) => assigned.seriesNumber === selected.seriesNumber),
    );

  const selectedSeriesConflict =
    enforceSingleSeriesPerExaminer && selectedSeriesLoads.length > 1;

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
    if (seriesConflict || selectedSeriesConflict) {
      setAssignError(
        enforceSingleSeriesPerExaminer
          ? `This campaign allows one series per examiner. Assigned series: ${formatSeriesLabel(assignedSeriesLoads)}.`
          : "Selected envelopes span multiple series.",
      );
      return;
    }
    setAssignError(null);
    setAssignSuccess(null);
    try {
      await onAssign(selectedEnvelopeIds);
      setSelectedIds({});
      setAssignSuccess(
        `Assigned ${selectedEnvelopeIds.length} envelope${selectedEnvelopeIds.length === 1 ? "" : "s"} (${selectedBookletTotal} booklets).`,
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
    panel === "add" && eligibleUnassigned.length > 0 ? (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {selectedEnvelopeIds.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
              <dl className="grid gap-2 sm:grid-cols-3 sm:gap-x-4">
                <div>
                  <dt className="text-muted-foreground">Current load</dt>
                  <dd className="mt-0.5 tabular-nums font-medium text-foreground">
                    {assignedBookletTotal} booklets
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {assignedRows.length} envelope{assignedRows.length === 1 ? "" : "s"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Adding</dt>
                  <dd className="mt-0.5 tabular-nums font-medium text-primary">
                    +{selectedBookletTotal} booklets
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {selectedEnvelopeIds.length} envelope{selectedEnvelopeIds.length === 1 ? "" : "s"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">After assigning</dt>
                  <dd className="mt-0.5 tabular-nums font-semibold text-foreground">
                    {resultingBookletTotal} booklets
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {resultingEnvelopeCount} envelope{resultingEnvelopeCount === 1 ? "" : "s"}
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
                        · {resultingDeviation > 0 ? "+" : ""}
                        {resultingDeviation} vs quota
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-muted-foreground">
                Series after assigning:{" "}
                <span className="font-medium text-foreground">{formatSeriesLabel(resultingSeriesLoads)}</span>
              </p>
              {seriesConflict || selectedSeriesConflict ? (
                <p className="mt-2 text-amber-800 dark:text-amber-200">
                  {seriesConflict
                    ? `Selection includes a different series than the examiner’s current ${formatSeriesLabel(assignedSeriesLoads)}.`
                    : "Selection spans multiple series, but this campaign allows one series per examiner."}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select envelopes below to see how this examiner&apos;s load will change.
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
            disabled={busy || selectedEnvelopeIds.length === 0 || seriesConflict || selectedSeriesConflict}
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
      description={`${subjectLabel} · Paper ${paperNumber} · ${examinerTypeLabel(examiner.examiner_type)}`}
      className="max-w-5xl"
      bodyClassName="!px-0 !py-0"
      footer={footer}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-4 border-b border-border bg-muted/15 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {assignedRows.length} envelope{assignedRows.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              {assignedBookletTotal} booklets
            </Badge>
            {examiner.quota_booklets != null ? (
              <Badge
                variant="outline"
                className={cn(
                  "tabular-nums",
                  examiner.deviation != null && examiner.deviation > 0
                    ? "border-amber-500/40 text-amber-800 dark:text-amber-200"
                    : "",
                )}
              >
                Quota {examiner.quota_booklets}
                {examiner.deviation != null ? ` · Δ ${examiner.deviation > 0 ? "+" : ""}${examiner.deviation}` : ""}
              </Badge>
            ) : null}
            {eligibleUnassigned.length > 0 ? (
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-foreground">
                {eligibleUnassigned.length} available to add
              </Badge>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Assigned series
                </p>
                {assignedSeriesLoads.length === 0 ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">No series yet — assign envelopes below.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {assignedSeriesLoads.map((series) => (
                      <span
                        key={series.seriesNumber}
                        className="inline-flex flex-col rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5"
                      >
                        <span className="text-sm font-semibold tabular-nums text-primary">
                          Series {series.seriesNumber}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {series.envelopeCount} envelope{series.envelopeCount === 1 ? "" : "s"} ·{" "}
                          {series.bookletCount} booklets
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {panel === "add" && assignedSeriesLoads.length === 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() =>
                    setFilterSeries(
                      filterSeries === String(assignedSeriesLoads[0].seriesNumber)
                        ? ""
                        : String(assignedSeriesLoads[0].seriesNumber),
                    )
                  }
                >
                  {filterSeries === String(assignedSeriesLoads[0].seriesNumber)
                    ? "Show all series"
                    : `Show series ${assignedSeriesLoads[0].seriesNumber} only`}
                </Button>
              ) : null}
            </div>
            {enforceSingleSeriesPerExaminer ? (
              <p className="mt-2 text-xs text-muted-foreground">
                This campaign allows one series per examiner.
              </p>
            ) : null}
          </div>

          {quotaPercent != null ? (
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
            className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1"
            role="tablist"
            aria-label="Assignment views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={panel === "assigned"}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                panel === "assigned"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPanel("assigned")}
            >
              <ClipboardList className="size-4 shrink-0 opacity-70" aria-hidden />
              Assigned
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{assignedRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "add"}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                panel === "add"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPanel("add")}
            >
              <PackagePlus className="size-4 shrink-0 opacity-70" aria-hidden />
              Add envelopes
              {eligibleUnassigned.length > 0 ? (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs tabular-nums text-primary">
                  {eligibleUnassigned.length}
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-4 pt-4 sm:px-6">
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
                      {assignedRows.map((item) => {
                        const isPending = pendingRemoveId === item.script_envelope_id;
                        return (
                          <tr key={item.script_envelope_id} className="border-b border-border/70 align-middle">
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-foreground">{item.school_name}</p>
                              <p className="text-xs text-muted-foreground">{item.school_code}</p>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                              S{item.series_number} · E{item.envelope_number}
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
          ) : eligibleUnassigned.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-950 dark:text-amber-100">
              Unassigned envelopes exist, but none are eligible for this examiner under cross-marking rules.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              <div className="shrink-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label htmlFor="add-env-filter-search" className={formLabelClass}>
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
                      className={cn(formInputClass, "mt-0 pl-9")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="School, zone, series…"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="add-env-filter-region" className={formLabelClass}>
                    Region
                  </label>
                  <select
                    id="add-env-filter-region"
                    className={`${formInputClass} mt-1`}
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
                  <label htmlFor="add-env-filter-zone" className={formLabelClass}>
                    Zone
                  </label>
                  <select
                    id="add-env-filter-zone"
                    className={`${formInputClass} mt-1`}
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
                  <label htmlFor="add-env-filter-series" className={formLabelClass}>
                    Series
                  </label>
                  <select
                    id="add-env-filter-series"
                    className={`${formInputClass} mt-1`}
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
                <div className="mt-3">
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
                          const matchesAssignedSeries =
                            assignedSeriesLoads.length > 0 &&
                            assignedSeriesLoads.some((s) => s.seriesNumber === row.series_number);
                          const conflictsAssignedSeries =
                            enforceSingleSeriesPerExaminer &&
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
): Array<{ value: string; label: string }> {
  const eligibleIds = envelope.eligible_examiner_ids;
  const filtered =
    eligibleIds && eligibleIds.length > 0
      ? poolRows.filter((r) => eligibleIds.includes(r.examiner_id))
      : poolRows;
  return [...filtered]
    .sort((a, b) => a.examiner_name.localeCompare(b.examiner_name, undefined, { sensitivity: "base" }))
    .map((r) => ({
      value: r.examiner_id,
      label: r.reference_code
        ? `${r.reference_code} · ${r.examiner_name} (${examinerTypeLabel(r.examiner_type)})`
        : `${r.examiner_name} (${examinerTypeLabel(r.examiner_type)})`,
    }));
}
