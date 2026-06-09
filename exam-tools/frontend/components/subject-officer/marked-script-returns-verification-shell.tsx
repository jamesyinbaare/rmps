"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { CohortScheduleSummary } from "@/components/cohorts/cohort-schedule-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getMarkedScriptReturnFilters,
  getMarkedScriptReturns,
  unverifyMarkedScriptReturn,
  verifyMarkedScriptReturn,
  type MarkedScriptReturnExaminerOption,
  type MarkedScriptReturnGridResponse,
  type MarkedScriptReturnPaperOption,
  type MarkedScriptReturnRow,
  type SubjectOfficerMeAssignmentSubject,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

const SUBJECT_COMBO_THRESHOLD = 5;
const PAPER_PILL_THRESHOLD = 3;

const compactLabelClass = "text-xs font-medium text-muted-foreground";
const compactControlClass =
  "mt-0.5 block w-full min-h-9 rounded-md border border-input-border bg-input px-2.5 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const comboboxCompactProps = {
  widthClass: "w-full mt-0.5",
  triggerClassName: "h-9 min-h-9 py-0",
  truncateTrigger: true as const,
};
const rowActionButtonClass = "w-24 justify-center";

type Session = {
  examId: number | null;
  subjectId: number | null;
  examinerId: string | null;
  paperNumber: number | null;
};

type Props = {
  examAssignments: SubjectOfficerMeExamAssignment[];
  session: Session;
  onSessionChange: (next: Partial<Session>) => void;
};

function examinerOptionLabel(e: MarkedScriptReturnExaminerOption): string {
  const pending =
    e.pending_count > 0 ? ` · ${e.pending_count} pending` : " · all verified";
  return `${e.examiner_name} · ${e.examiner_type}${pending}`;
}

export function MarkedScriptReturnsVerificationShell({
  examAssignments,
  session,
  onSessionChange,
}: Props) {
  const { examId, subjectId, examinerId, paperNumber } = session;

  const [examiners, setExaminers] = useState<MarkedScriptReturnExaminerOption[]>([]);
  const [papers, setPapers] = useState<MarkedScriptReturnPaperOption[]>([]);
  const [grid, setGrid] = useState<MarkedScriptReturnGridResponse | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [verifyAllBusy, setVerifyAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedExam = examAssignments.find((e) => e.examination_id === examId) ?? null;
  const subjectOptions: SubjectOfficerMeAssignmentSubject[] = selectedExam?.subjects ?? [];

  const subjectLabel = useMemo(() => {
    const s = subjectOptions.find((x) => x.subject_id === subjectId);
    return s ? subjectDisplayLabel(s) : "";
  }, [subjectId, subjectOptions]);

  const sessionReady =
    examId != null && subjectId != null && examinerId != null && paperNumber != null;

  useEffect(() => {
    if (examId == null || subjectId == null) {
      setExaminers([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters(true);
    void getMarkedScriptReturnFilters(examId, subjectId)
      .then((data) => {
        if (!cancelled) setExaminers(data.examiners);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load examiners");
          setExaminers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, subjectId]);

  useEffect(() => {
    if (examId == null || subjectId == null || !examinerId) {
      setPapers([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters(true);
    void getMarkedScriptReturnFilters(examId, subjectId, examinerId)
      .then((data) => {
        if (!cancelled) {
          setPapers(data.papers);
          if (data.papers.length === 1) {
            onSessionChange({ paperNumber: data.papers[0]!.paper_number });
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load papers");
          setPapers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, subjectId, examinerId, onSessionChange]);

  const loadGrid = useCallback(async () => {
    if (!sessionReady || examId == null || subjectId == null || !examinerId || paperNumber == null) {
      setGrid(null);
      return;
    }
    setLoadingGrid(true);
    setError(null);
    try {
      const data = await getMarkedScriptReturns(examId, {
        subjectId,
        examinerId,
        paperNumber,
      });
      setGrid(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load envelopes");
      setGrid(null);
    } finally {
      setLoadingGrid(false);
    }
  }, [examId, examinerId, paperNumber, sessionReady, subjectId]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  const refreshFilterCounts = useCallback(async () => {
    if (examId == null || subjectId == null) return;
    const [examinerData, paperData] = await Promise.all([
      getMarkedScriptReturnFilters(examId, subjectId),
      examinerId
        ? getMarkedScriptReturnFilters(examId, subjectId, examinerId)
        : Promise.resolve({ examiners: [], papers: [] }),
    ]);
    setExaminers(examinerData.examiners);
    setPapers(paperData.papers);
  }, [examId, examinerId, subjectId]);

  async function verifyRow(row: MarkedScriptReturnRow) {
    if (examId == null || subjectId == null) return;
    setBusyKey(row.allocation_assignment_id);
    setError(null);
    try {
      await verifyMarkedScriptReturn(examId, row.allocation_assignment_id, subjectId, {});
      await loadGrid();
      await refreshFilterCounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function unverifyRow(row: MarkedScriptReturnRow) {
    if (examId == null || subjectId == null) return;
    setBusyKey(row.allocation_assignment_id);
    setError(null);
    try {
      await unverifyMarkedScriptReturn(examId, row.allocation_assignment_id, subjectId);
      await loadGrid();
      await refreshFilterCounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unverify failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function verifyAllPending() {
    if (!grid || examId == null || subjectId == null) return;
    const pending = grid.rows.filter((r) => r.status !== "verified");
    if (pending.length === 0) return;
    setVerifyAllBusy(true);
    setError(null);
    try {
      for (const row of pending) {
        await verifyMarkedScriptReturn(examId, row.allocation_assignment_id, subjectId, {});
      }
      await loadGrid();
      await refreshFilterCounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify all failed");
    } finally {
      setVerifyAllBusy(false);
    }
  }

  const summary = grid?.summary ?? {};
  const pendingCount = summary.pending ?? 0;
  const verifiedCount = summary.verified ?? 0;
  const totalCount = pendingCount + verifiedCount;
  const progressPct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;
  const totalBooklets = useMemo(
    () => (grid?.rows ?? []).reduce((sum, row) => sum + row.expected_booklets, 0),
    [grid?.rows],
  );
  const rowCount = grid?.rows.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {examId == null ? (
            <p className="w-full pb-1 text-sm text-muted-foreground">
              Select an examination using the selector above to begin verification.
            </p>
          ) : null}

          <div className="min-w-36 flex-1 sm:max-w-xs">
            <label className={compactLabelClass} htmlFor="msr-subject">
              Subject
            </label>
            {subjectOptions.length <= SUBJECT_COMBO_THRESHOLD ? (
              <select
                id="msr-subject"
                className={compactControlClass}
                value={subjectId ?? ""}
                disabled={examId == null}
                onChange={(e) =>
                  onSessionChange({
                    subjectId: e.target.value ? Number(e.target.value) : null,
                    examinerId: null,
                    paperNumber: null,
                  })
                }
              >
                <option value="">Select…</option>
                {subjectOptions.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {subjectDisplayLabel(s)}
                  </option>
                ))}
              </select>
            ) : (
              <SearchableCombobox
                id="msr-subject"
                options={subjectOptions.map((s) => ({
                  value: String(s.subject_id),
                  label: subjectDisplayLabel(s),
                }))}
                value={subjectId != null ? String(subjectId) : ""}
                onChange={(v) =>
                  onSessionChange({
                    subjectId: v ? Number(v) : null,
                    examinerId: null,
                    paperNumber: null,
                  })
                }
                placeholder="Select…"
                searchPlaceholder="Search…"
                showAllOption={false}
                disabled={examId == null}
                {...comboboxCompactProps}
              />
            )}
          </div>

          <div className="min-w-36 flex-1 sm:max-w-md">
            <label className={compactLabelClass} htmlFor="msr-examiner">
              Examiner
            </label>
            <SearchableCombobox
              id="msr-examiner"
              options={examiners.map((e) => ({
                value: e.examiner_id,
                label: examinerOptionLabel(e),
              }))}
              value={examinerId ?? ""}
              onChange={(v) =>
                onSessionChange({
                  examinerId: v || null,
                  paperNumber: null,
                })
              }
              placeholder={loadingFilters ? "Loading…" : "Search…"}
              searchPlaceholder="Name…"
              showAllOption={false}
              disabled={subjectId == null || loadingFilters}
              {...comboboxCompactProps}
            />
          </div>

          <div className="min-w-32">
            <span className={compactLabelClass}>Paper</span>
            {papers.length <= PAPER_PILL_THRESHOLD && papers.length > 0 ? (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {papers.map((p) => (
                  <button
                    key={p.paper_number}
                    type="button"
                    disabled={!examinerId}
                    onClick={() => onSessionChange({ paperNumber: p.paper_number })}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      paperNumber === p.paper_number
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border bg-background hover:border-primary/40",
                    )}
                  >
                    P{p.paper_number}
                    {p.pending_count > 0 ? ` (${p.pending_count})` : ""}
                  </button>
                ))}
              </div>
            ) : (
              <select
                className={compactControlClass}
                value={paperNumber ?? ""}
                disabled={!examinerId || papers.length === 0}
                onChange={(e) =>
                  onSessionChange({
                    paperNumber: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Select…</option>
                {papers.map((p) => (
                  <option key={p.paper_number} value={p.paper_number}>
                    Paper {p.paper_number}
                    {p.pending_count > 0 ? ` (${p.pending_count})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {sessionReady && grid ? (
        <div className="space-y-4">
          <div
            className="rounded-xl border border-border bg-muted/20 p-4"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {grid.examiner_name}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {grid.examiner_type}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {subjectLabel} · Paper {grid.paper_number}
                </p>
                {grid.marking_group_name ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cohort: {grid.marking_group_name}
                    <CohortScheduleSummary
                      coordinationDate={grid.coordination_date}
                      coordinationStartTime={grid.coordination_start_time}
                      coordinationEndTime={grid.coordination_end_time}
                      markingStartDate={grid.marking_start_date}
                      markingEndDate={grid.marking_end_date}
                      markedScriptSubmissionDeadline={grid.marked_script_submission_deadline}
                    />
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{pendingCount} pending</Badge>
                <Badge className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                  {verifiedCount} verified
                </Badge>
                {pendingCount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={verifyAllBusy || loadingGrid}
                    onClick={() => void verifyAllPending()}
                  >
                    Verify all pending ({pendingCount})
                  </Button>
                ) : null}
              </div>
            </div>
            {totalCount > 0 ? (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>
                    {verifiedCount} / {totalCount} verified
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            ) : null}
            {totalCount > 0 && pendingCount === 0 ? (
              <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                All envelopes verified for this paper. Select another paper or examiner to continue.
              </p>
            ) : null}
          </div>

          {loadingGrid ? (
            <p className="text-sm text-muted-foreground">Loading envelopes…</p>
          ) : grid.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scripts were allocated to this examiner for this paper.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 text-right">#</th>
                    <th className="px-3 py-2">School</th>
                    <th className="px-3 py-2 text-right">Env #</th>
                    <th className="px-3 py-2 text-right">Series</th>
                    <th className="px-3 py-2 text-right">Booklets</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row, index) => {
                    const isVerified = row.status === "verified";
                    const isBusy = busyKey === row.allocation_assignment_id;
                    return (
                      <tr
                        key={row.allocation_assignment_id}
                        className={cn(
                          "border-t border-border transition-colors",
                          isVerified
                            ? "bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                            : "bg-background",
                        )}
                      >
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{row.school_code}</span>
                          <span> — {row.school_name}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.envelope_number}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.series_number}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.expected_booklets.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          {isVerified ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={rowActionButtonClass}
                              disabled={isBusy || verifyAllBusy}
                              aria-label={`Unverify envelope ${row.envelope_number}, series ${row.series_number}, ${row.school_code}`}
                              onClick={() => void unverifyRow(row)}
                            >
                              Unverify
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className={rowActionButtonClass}
                              disabled={isBusy || verifyAllBusy}
                              aria-label={`Verify envelope ${row.envelope_number}, series ${row.series_number}, ${row.school_code}`}
                              onClick={() => void verifyRow(row)}
                            >
                              Verify
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40 font-semibold text-foreground">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" colSpan={3}>
                      {rowCount.toLocaleString()} envelope{rowCount === 1 ? "" : "s"} · Total booklets
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {totalBooklets.toLocaleString()}
                    </td>
                    <td className="px-3 py-2" colSpan={1} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : sessionReady && loadingGrid ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}
