"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, MapPin, Phone } from "lucide-react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { CohortScheduleSummary } from "@/components/cohorts/cohort-schedule-fields";
import {
  SO_MASTER_DETAIL_DETAIL_CLASS,
  SO_MASTER_DETAIL_GRID_CLASS,
  SO_MASTER_DETAIL_MASTER_CLASS,
} from "@/components/examiners/constants";
import { MarkedScriptEnvelopeCards } from "@/components/subject-officer/marked-script-envelope-cards";
import { MarkedScriptExaminerPicker } from "@/components/subject-officer/marked-script-examiner-picker";
import { ExaminerRoleBadge } from "@/components/subject-officer/examiner-role-badge";
import { SubjectOfficerExaminerMobilePicker } from "@/components/subject-officer/subject-officer-examiner-mobile-picker";
import { regionLabel } from "@/components/subject-officer/subject-officer-examiner-utils";
import { SubjectOfficerSelectedExaminerBar } from "@/components/subject-officer/subject-officer-selected-examiner-bar";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { SubjectOfficerWorkspaceStrip } from "@/components/subject-officer/subject-officer-workspace-strip";
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
} from "@/lib/api";
import {
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarRowClass,
} from "@/lib/official-accounts-zone";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

const SUBJECT_COMBO_THRESHOLD = 5;

const compactLabelClass = "text-xs font-medium text-muted-foreground";
const comboboxCompactProps = {
  widthClass: "w-full mt-0.5",
  triggerClassName: "h-9 min-h-9 py-0",
  truncateTrigger: true as const,
};
const rowActionButtonClass = "w-24 justify-center";

type Session = {
  examinerId: string | null;
  paperNumber: number | null;
};

type Props = {
  examId: number;
  subjectId: number;
  workspaceLabel: string;
  session: Session;
  onSessionChange: (next: Partial<Session>) => void;
};

function PaperPills({
  papers,
  paperNumber,
  onSelectPaper,
  scrollable = false,
}: {
  papers: MarkedScriptReturnPaperOption[];
  paperNumber: number | null;
  onSelectPaper: (paperNumber: number) => void;
  scrollable?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        scrollable && "flex-nowrap overflow-x-auto overscroll-x-contain pb-0.5",
      )}
    >
      {papers.map((p) => (
        <button
          key={p.paper_number}
          type="button"
          onClick={() => onSelectPaper(p.paper_number)}
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            paperNumber === p.paper_number
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-background hover:border-primary/40",
          )}
        >
          P{p.paper_number}
          {p.pending_count > 0 ? ` · ${p.pending_count} pending` : ""}
        </button>
      ))}
    </div>
  );
}

function MasterDetailSkeleton() {
  return (
    <div className={cn(SO_MASTER_DETAIL_GRID_CLASS, "lg:min-h-[420px]")}>
      <div className="hidden animate-pulse border-b border-border p-4 lg:block lg:border-b-0 lg:border-r">
        <div className="mb-3 h-4 w-32 rounded bg-muted" />
        <div className="mb-2 h-9 rounded bg-muted" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/60" />
          ))}
        </div>
      </div>
      <div className="animate-pulse p-4">
        <div className="mb-4 h-6 w-48 rounded bg-muted" />
        <div className="h-48 rounded bg-muted/60" />
      </div>
    </div>
  );
}

export function MarkedScriptReturnsVerificationShell({
  examId,
  subjectId,
  workspaceLabel,
  session,
  onSessionChange,
}: Props) {
  const { examinerId, paperNumber } = session;

  const [examiners, setExaminers] = useState<MarkedScriptReturnExaminerOption[]>([]);
  const [papers, setPapers] = useState<MarkedScriptReturnPaperOption[]>([]);
  const [grid, setGrid] = useState<MarkedScriptReturnGridResponse | null>(null);
  const [loadingExaminers, setLoadingExaminers] = useState(false);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [verifyAllBusy, setVerifyAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examinerListSearch, setExaminerListSearch] = useState("");
  const [pendingExaminersOnly, setPendingExaminersOnly] = useState(false);

  const subjectLabel = workspaceLabel.split(" · ").slice(-1)[0] ?? workspaceLabel;

  const selectedExaminer = useMemo(
    () => examiners.find((e) => e.examiner_id === examinerId) ?? null,
    [examiners, examinerId],
  );

  const subjectSelected = true;
  const sessionReady =
    subjectSelected && examinerId != null && paperNumber != null;

  useEffect(() => {
    setExaminerListSearch("");
    setPendingExaminersOnly(false);
  }, [subjectId]);

  useEffect(() => {
    if (!subjectSelected || examId == null || subjectId == null) {
      setExaminers([]);
      return;
    }
    let cancelled = false;
    setLoadingExaminers(true);
    setError(null);
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
        if (!cancelled) setLoadingExaminers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, subjectId, subjectSelected]);

  useEffect(() => {
    if (examinerId && examiners.length > 0 && !examiners.some((e) => e.examiner_id === examinerId)) {
      onSessionChange({ examinerId: null, paperNumber: null });
    }
  }, [examinerId, examiners, onSessionChange]);

  useEffect(() => {
    if (!subjectSelected || examId == null || subjectId == null || !examinerId) {
      setPapers([]);
      return;
    }
    let cancelled = false;
    setLoadingPapers(true);
    void getMarkedScriptReturnFilters(examId, subjectId, examinerId)
      .then((data) => {
        if (!cancelled) {
          setPapers(data.papers);
          if (data.papers.length === 1) {
            onSessionChange({ paperNumber: data.papers[0]!.paper_number });
          } else if (
            paperNumber != null &&
            !data.papers.some((p) => p.paper_number === paperNumber)
          ) {
            onSessionChange({ paperNumber: null });
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
        if (!cancelled) setLoadingPapers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, examinerId, onSessionChange, paperNumber, subjectId, subjectSelected]);

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

  const examinerFullyVerified = useMemo(
    () =>
      examinerId != null &&
      papers.length > 0 &&
      papers.every((p) => p.pending_count === 0) &&
      papers.some((p) => p.verified_count > 0),
    [examinerId, papers],
  );

  function clearSelectedExaminer() {
    onSessionChange({ examinerId: null, paperNumber: null });
  }

  function handleExamChange(id: number | null) {
    void id;
  }

  const commandBar = (
    <div className={officialAccountsCommandBarRowClass}>
      <SubjectOfficerWorkspaceStrip workspaceLabel={workspaceLabel} workspace={null} />
    </div>
  );

  const masterDetail = !subjectSelected ? (
    <p className="text-sm text-muted-foreground">
      {examId == null
        ? "Select an examination and subject to verify marked scripts."
        : "Select a subject to view examiners."}
    </p>
  ) : loadingExaminers && examiners.length === 0 ? (
    <MasterDetailSkeleton />
  ) : (
    <>
      {!examinerId ? (
        <div className="max-md:px-3 max-md:py-4 lg:hidden">
          <SubjectOfficerExaminerMobilePicker
            variant="marked-scripts"
            examiners={examiners}
            selectedId={null}
            onSelect={(id) => onSessionChange({ examinerId: id, paperNumber: null })}
            loading={loadingExaminers}
          />
        </div>
      ) : null}

      <div
        className={cn(
          SO_MASTER_DETAIL_GRID_CLASS,
          !examinerId && "hidden lg:grid",
        )}
      >
        <div className={SO_MASTER_DETAIL_MASTER_CLASS}>
          <MarkedScriptExaminerPicker
            examiners={examiners}
            selectedId={examinerId}
            onSelect={(id) => onSessionChange({ examinerId: id, paperNumber: null })}
            searchQuery={examinerListSearch}
            onSearchChange={setExaminerListSearch}
            pendingOnly={pendingExaminersOnly}
            onPendingOnlyChange={setPendingExaminersOnly}
            loading={loadingExaminers}
            className="min-h-0 flex-1"
            listClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          />
        </div>

        <div
          className={cn(
            SO_MASTER_DETAIL_DETAIL_CLASS,
            !examinerId && "hidden lg:flex",
          )}
        >
          {selectedExaminer || examinerId ? (
            <>
              {selectedExaminer ? (
                <SubjectOfficerSelectedExaminerBar
                  className="lg:hidden"
                  name={selectedExaminer.examiner_name}
                  examinerType={selectedExaminer.examiner_type}
                  region={selectedExaminer.region}
                  phone={selectedExaminer.phone_number}
                  statValue={pendingCount > 0 ? pendingCount : undefined}
                  statLabel={pendingCount > 0 ? "pending" : undefined}
                  onChange={clearSelectedExaminer}
                />
              ) : null}

              <div className="shrink-0 border-b border-border bg-muted/15 px-3 py-2.5 lg:hidden">
              {papers.length > 0 ? (
                <PaperPills
                  papers={papers}
                  paperNumber={paperNumber}
                  onSelectPaper={(n) => onSessionChange({ paperNumber: n })}
                  scrollable
                />
              ) : loadingPapers ? (
                <p className="text-xs text-muted-foreground">Loading papers…</p>
              ) : (
                <p className="text-xs text-muted-foreground">No papers for this examiner.</p>
              )}
            </div>

            <div className="hidden shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border bg-gradient-to-b from-muted/35 to-muted/15 px-4 py-4 lg:flex lg:px-5">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {selectedExaminer?.examiner_name ?? grid?.examiner_name ?? "Examiner"}
                  </h3>
                  {(selectedExaminer?.examiner_type ?? grid?.examiner_type) ? (
                    <ExaminerRoleBadge
                      examinerType={selectedExaminer?.examiner_type ?? grid?.examiner_type ?? ""}
                      variant="secondary"
                    />
                  ) : null}
                  {subjectLabel ? (
                    <Badge
                      variant="outline"
                      className="border-border/80 bg-background/80 font-normal text-foreground"
                    >
                      {subjectLabel}
                    </Badge>
                  ) : null}
                </div>
                {selectedExaminer ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      {regionLabel(selectedExaminer.region)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      {selectedExaminer.phone_number?.trim() ? (
                        <a
                          href={`tel:${selectedExaminer.phone_number.trim()}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {selectedExaminer.phone_number.trim()}
                        </a>
                      ) : (
                        <span className="text-muted-foreground/80">No phone on file</span>
                      )}
                    </span>
                  </div>
                ) : null}
                {papers.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-xs font-medium text-muted-foreground">Paper</span>
                    <PaperPills
                      papers={papers}
                      paperNumber={paperNumber}
                      onSelectPaper={(n) => onSessionChange({ paperNumber: n })}
                    />
                  </div>
                ) : loadingPapers ? (
                  <p className="text-xs text-muted-foreground">Loading papers…</p>
                ) : null}
                {grid?.marking_group_name ? (
                  <p className="text-xs text-muted-foreground">
                    Cohort: {grid.marking_group_name}
                    <CohortScheduleSummary
                      coordinationStartDate={grid.coordination_start_date}
                      coordinationStartTime={grid.coordination_start_time}
                      coordinationEndDate={grid.coordination_end_date}
                      coordinationEndTime={grid.coordination_end_time}
                      markingStartDate={grid.marking_start_date}
                      markingEndDate={grid.marking_end_date}
                      markedScriptSubmissionDeadline={grid.marked_script_submission_deadline}
                    />
                  </p>
                ) : null}
              </div>
              {sessionReady && totalCount > 0 ? (
                <div className="flex shrink-0 flex-wrap items-stretch gap-2">
                  <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-center shadow-sm">
                    <p className="text-lg font-semibold tabular-nums leading-none text-amber-700 dark:text-amber-300">
                      {pendingCount}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Pending
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-center shadow-sm">
                    <p className="text-lg font-semibold tabular-nums leading-none text-emerald-700 dark:text-emerald-300">
                      {verifiedCount}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Verified
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {sessionReady && totalCount > 0 ? (
              <div
                className="shrink-0 border-b border-border/60 bg-muted/10 px-3 py-2 lg:px-5 lg:py-2.5"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 sm:min-w-40">
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
                  {pendingCount > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={verifyAllBusy || loadingGrid}
                      onClick={() => void verifyAllPending()}
                    >
                      Verify all<span className="hidden sm:inline"> pending</span> ({pendingCount})
                    </Button>
                  ) : examinerFullyVerified ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      All marked scripts verified for this examiner.
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      All envelopes verified for this paper.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="min-w-0 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:p-4 [&_th]:bg-card [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10">
              {!paperNumber ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground lg:py-12">
                  {papers.length > 0
                    ? "Select a paper above to verify marked scripts."
                    : "Select a paper to verify marked scripts."}
                </div>
              ) : loadingGrid && !grid ? (
                <div className="flex min-h-[200px] items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : grid && grid.rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
                  No scripts were allocated to this examiner for this paper.
                </div>
              ) : grid ? (
                <>
                  <div className="max-md:-mx-3 max-md:px-3 lg:hidden">
                    <MarkedScriptEnvelopeCards
                      rows={grid.rows}
                      busyKey={busyKey}
                      verifyAllBusy={verifyAllBusy}
                      onVerify={(row) => void verifyRow(row)}
                      onUnverify={(row) => void unverifyRow(row)}
                      className="max-md:pb-3"
                    />
                    {examinerFullyVerified ? (
                      <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center">
                        <p className="text-sm text-emerald-800 dark:text-emerald-200">
                          All marked scripts verified for this examiner.
                        </p>
                        <Button type="button" className="mt-3 w-full" onClick={clearSelectedExaminer}>
                          Done
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <table className="hidden w-full min-w-[36rem] border-collapse text-sm lg:table">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-10 px-3 py-2 text-right font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">School</th>
                        <th className="px-3 py-2 text-right font-semibold">Env #</th>
                        <th className="px-3 py-2 text-right font-semibold">Series</th>
                        <th className="px-3 py-2 text-right font-semibold">Booklets</th>
                        <th className="px-3 py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grid.rows.map((row, index) => {
                        const isVerified = row.status === "verified";
                        const isBusy = busyKey === row.allocation_assignment_id;
                        const schoolLabel = `${row.school_code} — ${row.school_name}`;
                        return (
                          <tr
                            key={row.allocation_assignment_id}
                            className={cn(
                              "border-b border-border/40 last:border-0 transition-colors",
                              isVerified
                                ? "bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                                : "bg-background",
                            )}
                          >
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {index + 1}
                            </td>
                            <td className="max-w-0 px-3 py-2">
                              <p className="truncate" title={schoolLabel}>
                                <span className="font-medium">{row.school_code}</span>
                                <span className="text-muted-foreground"> — {row.school_name}</span>
                              </p>
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
                      <tr className="border-t border-border bg-muted/30 font-semibold text-foreground">
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" colSpan={3}>
                          {rowCount.toLocaleString()} envelope{rowCount === 1 ? "" : "s"} · Total booklets
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {totalBooklets.toLocaleString()}
                        </td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  </table>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <p className="hidden p-8 text-sm text-muted-foreground lg:block">
            Select an examiner to verify marked scripts.
          </p>
        )}
        </div>
      </div>
    </>
  );

  return (
    <SubjectOfficerPanelShell commandBar={commandBar} flushMobileContent fillViewport>
      {error ? (
        <p className="mb-4 max-md:mx-3 shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-0">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{masterDetail}</div>
    </SubjectOfficerPanelShell>
  );
}
