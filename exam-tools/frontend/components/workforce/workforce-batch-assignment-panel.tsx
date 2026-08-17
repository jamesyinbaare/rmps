"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Clock, RefreshCw, Search, X } from "lucide-react";

import { WorkforceAssignBatchModal } from "@/components/workforce/workforce-assign-batch-modal";
import { WorkforceAssignmentMobileCard } from "@/components/workforce/workforce-assignment-mobile-card";
import { WorkforceAssignmentRowActions } from "@/components/workforce/workforce-assignment-row-actions";
import { WorkforceBulkAssignModal } from "@/components/workforce/workforce-bulk-assign-modal";
import {
  WORKFORCE_ASSIGNMENT_FILTER_LABEL,
  WorkforceAssignmentSummaryStats,
  type WorkforceAssignmentStatusFilter,
  type WorkforceAssignmentSummaryCounts,
} from "@/components/workforce/workforce-assignment-summary-stats";
import { WorkforceAvailabilityBadge } from "@/components/workforce/workforce-availability-badge";
import { WorkforcePersonAssignmentsModal } from "@/components/workforce/workforce-person-assignments-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getWorkforceAssignmentRoster,
  listWorkforceExerciseGroups,
  regenerateScriptCheckerPortalLink,
  type Examination,
  type Subject,
  type WorkforceAssignmentBatchRow,
  type WorkforceAssignmentPersonRow,
  type WorkforceExerciseGroupRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { subjectDisplayCode, subjectDisplayLabel } from "@/lib/subject-display";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type Props = {
  config: WorkforceKindConfig;
  exams: Examination[];
  subjects: Subject[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  lockedSubjectIds?: number[];
  canCancelBatch?: boolean;
  showRosterLinks?: boolean;
  /** When false, hide Assign actions (overview-only). Default true. */
  canAssign?: boolean;
  /** Portal regenerate — keep on roster hub, not assignments. Default false. */
  showRegeneratePortal?: boolean;
  hideExamFilter?: boolean;
  formatExamLabel: (exam: Examination) => string;
};

type ScriptScope = {
  subjectId: number | null;
  paperNumber: number | null;
};

type ScopedTotals = {
  assigned_total: number;
  completed_total: number;
  uncompleted_total: number;
  paper1: number;
  paper2: number;
  num_days: number | null;
};

function batchInScope(batch: WorkforceAssignmentBatchRow, scope: ScriptScope): boolean {
  if (scope.subjectId != null && batch.subject_id !== scope.subjectId) return false;
  if (scope.paperNumber != null && batch.paper_number !== scope.paperNumber) return false;
  return true;
}

function scopedTotalsFromBatches(
  batches: WorkforceAssignmentBatchRow[],
  scope: ScriptScope,
): ScopedTotals {
  let completed = 0;
  let uncompleted = 0;
  for (const batch of batches) {
    if (!batchInScope(batch, scope)) continue;
    if (batch.status === "cancelled") continue;
    if (batch.status === "completed") completed += batch.script_count;
    else if (batch.status === "active") uncompleted += batch.script_count;
  }
  return {
    assigned_total: completed + uncompleted,
    completed_total: completed,
    uncompleted_total: uncompleted,
    paper1: 0,
    paper2: 0,
    num_days: null,
  };
}

function subjectBreakdownLabel(
  batches: WorkforceAssignmentBatchRow[],
  subjectsById: Map<number, Subject>,
  scope: ScriptScope,
): string | null {
  const counts = new Map<string, number>();
  for (const batch of batches) {
    if (batch.status === "cancelled") continue;
    if (!batchInScope(batch, scope)) continue;
    const subject = subjectsById.get(batch.subject_id);
    const code = subject ? subjectDisplayCode(subject) : `Subject ${batch.subject_id}`;
    const key = `${code} · P${batch.paper_number}`;
    counts.set(key, (counts.get(key) ?? 0) + batch.script_count);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, n]) => `${label}: ${n.toLocaleString()}`)
    .join(" · ");
}

function rowPriority(row: WorkforceAssignmentPersonRow, uncompleted: number): number {
  if (uncompleted > 0) return 0;
  if (row.availability_status === "pending") return 1;
  if (row.availability_status === "confirmed") return 2;
  return 3;
}

function matchesFilter(
  row: WorkforceAssignmentPersonRow,
  filter: WorkforceAssignmentStatusFilter,
  uncompleted: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return row.availability_status === "confirmed" && uncompleted === 0;
    case "active":
      return uncompleted > 0;
    case "awaiting":
      return row.availability_status === "pending";
    case "declined":
      return row.availability_status === "declined";
    case "no_bank":
      return !row.has_bank_account;
    default:
      return true;
  }
}
function matchesSearch(row: WorkforceAssignmentPersonRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q) ||
    (row.reference_code?.toLowerCase().includes(q) ?? false) ||
    (row.phone_number?.toLowerCase().includes(q) ?? false)
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-2.5">
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border px-3 py-4 last:border-b-0">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyStatePanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function WorkforceBatchAssignmentPanel({
  config,
  exams,
  subjects,
  examId,
  onExamChange,
  lockedSubjectIds,
  canCancelBatch = false,
  showRosterLinks = false,
  canAssign = true,
  showRegeneratePortal = false,
  hideExamFilter = false,
  formatExamLabel,
}: Props) {
  const [rows, setRows] = useState<WorkforceAssignmentPersonRow[]>([]);
  const [cohorts, setCohorts] = useState<WorkforceExerciseGroupRow[]>([]);
  const [cohortId, setCohortId] = useState<string>("");
  const [filterSubjectId, setFilterSubjectId] = useState<string>("");
  const [filterPaperNumber, setFilterPaperNumber] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkforceAssignmentStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignTarget, setAssignTarget] = useState<WorkforceAssignmentPersonRow | null>(null);
  const [viewTarget, setViewTarget] = useState<WorkforceAssignmentPersonRow | null>(null);
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [examId, exams]);
  const canLoad = examId != null;
  const canRegeneratePortal = showRegeneratePortal && config.kind === "script-checker";
  const isBulkChecker = config.kind === "script-checker";
  const showSummaryStats = config.kind !== "script-checker";
  const subjectFilterLocked = (lockedSubjectIds?.length ?? 0) === 1;

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const subjectFilterOptions = useMemo(() => {
    const base =
      lockedSubjectIds && lockedSubjectIds.length > 0
        ? subjects.filter((s) => lockedSubjectIds.includes(s.id))
        : subjects;
    return base
      .slice()
      .sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b)))
      .map((s) => ({ value: String(s.id), label: subjectDisplayLabel(s) }));
  }, [lockedSubjectIds, subjects]);

  const scriptScope = useMemo((): ScriptScope => {
    const locked = lockedSubjectIds?.length === 1 ? lockedSubjectIds[0]! : null;
    const subjectId = locked ?? (filterSubjectId ? Number.parseInt(filterSubjectId, 10) : null);
    const paperNumber =
      filterPaperNumber === "1" || filterPaperNumber === "2"
        ? Number.parseInt(filterPaperNumber, 10)
        : null;
    return {
      subjectId: Number.isFinite(subjectId) ? subjectId : null,
      paperNumber,
    };
  }, [filterPaperNumber, filterSubjectId, lockedSubjectIds]);

  const loadRoster = useCallback(async () => {
    if (examId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getWorkforceAssignmentRoster(config.kind, examId, {
        cohortId: cohortId || null,
      });
      setRows(data.items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load roster");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, config.kind, examId]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (examId == null) {
      setCohorts([]);
      setCohortId("");
      return;
    }
    let cancelled = false;
    void listWorkforceExerciseGroups(config.kind, examId)
      .then((groups) => {
        if (!cancelled) setCohorts(groups);
      })
      .catch(() => {
        if (!cancelled) setCohorts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [config.kind, examId]);

  useEffect(() => {
    setStatusFilter("all");
    setSearchQuery("");
    setCohortId("");
    setFilterSubjectId(subjectFilterLocked ? String(lockedSubjectIds![0]) : "");
    setFilterPaperNumber("");
    setActionError(null);
  }, [examId, lockedSubjectIds, subjectFilterLocked]);

  useEffect(() => {
    if (assignTarget == null) return;
    const updated = rows.find((r) => r.id === assignTarget.id);
    if (updated) setAssignTarget(updated);
  }, [assignTarget, rows]);

  useEffect(() => {
    if (viewTarget == null) return;
    const updated = rows.find((r) => r.id === viewTarget.id);
    if (updated) setViewTarget(updated);
  }, [rows, viewTarget]);

  async function handleRegeneratePortal(row: WorkforceAssignmentPersonRow) {
    if (examId == null || !canRegeneratePortal) return;
    const ok = window.confirm(
      `Regenerate portal link for ${row.name}? The old link will stop working immediately.`,
    );
    if (!ok) return;
    setRegenBusyId(row.id);
    setActionError(null);
    try {
      const result = await regenerateScriptCheckerPortalLink(examId, row.id);
      await navigator.clipboard.writeText(result.portal_url);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to regenerate portal link");
    } finally {
      setRegenBusyId(null);
    }
  }

  const scopedRows = useMemo(() => {
    if (isBulkChecker) {
      return rows.map((row) => {
        const bulk = row.bulk_assignment;
        const paper1 = bulk?.paper1_script_count ?? 0;
        const paper2 = bulk?.paper2_script_count ?? 0;
        return {
          row,
          totals: {
            assigned_total: paper1 + paper2,
            completed_total: paper1 + paper2,
            uncompleted_total: 0,
            paper1,
            paper2,
            num_days: bulk?.num_days ?? null,
          },
          breakdown: null as string | null,
        };
      });
    }
    return rows.map((row) => {
      const totals = scopedTotalsFromBatches(row.batches, scriptScope);
      return {
        row,
        totals,
        breakdown: subjectBreakdownLabel(row.batches, subjectsById, scriptScope),
      };
    });
  }, [isBulkChecker, rows, scriptScope, subjectsById]);

  const summaryCounts = useMemo((): WorkforceAssignmentSummaryCounts => {
    return {
      roster: scopedRows.length,
      ready: scopedRows.filter(
        ({ row, totals }) => row.availability_status === "confirmed" && totals.uncompleted_total === 0,
      ).length,
      active: scopedRows.filter(({ totals }) => totals.uncompleted_total > 0).length,
      awaiting: scopedRows.filter(({ row }) => row.availability_status === "pending").length,
      declined: scopedRows.filter(({ row }) => row.availability_status === "declined").length,
      noBank: scopedRows.filter(({ row }) => !row.has_bank_account).length,
      activeScriptTotal: scopedRows.reduce((sum, { totals }) => sum + totals.uncompleted_total, 0),
      completedTotal: scopedRows.reduce((sum, { totals }) => sum + totals.completed_total, 0),
    };
  }, [scopedRows]);

  const visibleRows = useMemo(() => {
    return scopedRows
      .filter(
        ({ row, totals }) =>
          matchesFilter(row, statusFilter, totals.uncompleted_total) && matchesSearch(row, searchQuery),
      )
      .slice()
      .sort((a, b) => {
        const pd = rowPriority(a.row, a.totals.uncompleted_total) - rowPriority(b.row, b.totals.uncompleted_total);
        if (pd !== 0) return pd;
        return a.row.name.localeCompare(b.row.name);
      });
  }, [scopedRows, searchQuery, statusFilter]);

  const scopeLabel = useMemo(() => {
    if (isBulkChecker) return "Paper 1 and Paper 2";
    if (scriptScope.subjectId == null) return "All subjects";
    const subject = subjectsById.get(scriptScope.subjectId);
    const subjectPart = subject ? subjectDisplayCode(subject) : `Subject ${scriptScope.subjectId}`;
    if (scriptScope.paperNumber == null) return subjectPart;
    return `${subjectPart} · Paper ${scriptScope.paperNumber}`;
  }, [isBulkChecker, scriptScope.paperNumber, scriptScope.subjectId, subjectsById]);

  const contextLine =
    canLoad && selectedExam
      ? isBulkChecker
        ? `${formatExamLabel(selectedExam)} · ${rows.length} ${config.labelPlural.toLowerCase()}`
        : `${formatExamLabel(selectedExam)} · ${scopeLabel} · ${rows.length} ${config.labelPlural.toLowerCase()}`
      : null;

  const activeBatchPeople = useMemo(
    () => scopedRows.filter(({ totals }) => totals.uncompleted_total > 0).length,
    [scopedRows],
  );
  const mobileContextLine =
    canLoad && selectedExam
      ? isBulkChecker
        ? `${rows.length} ${config.labelPlural.toLowerCase()}`
        : `${scopeLabel} · ${rows.length} ${config.labelPlural.toLowerCase()} · ${activeBatchPeople} with active batches`
      : null;

  function renderRow(item: (typeof visibleRows)[number]) {
    const { row, totals, breakdown } = item;
    const hasActive = totals.uncompleted_total > 0;
    return (
      <tr
        key={row.id}
        className={cn("bg-card", hasActive && "border-l-2 border-l-primary bg-primary/3")}
      >
        <td className="px-3 py-2.5 font-medium text-foreground">{row.name}</td>
        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
          {row.phone_number?.trim() || "—"}
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
          {row.reference_code?.trim() || "—"}
        </td>
        <td className="max-w-[10rem] truncate px-3 py-2.5 text-muted-foreground" title={row.cohort_name ?? undefined}>
          {row.cohort_name?.trim() || "—"}
        </td>
        <td className="px-3 py-2.5">
          <WorkforceAvailabilityBadge status={row.availability_status} />
        </td>
        {isBulkChecker ? (
          <>
            <td className="px-3 py-2.5 tabular-nums">{totals.paper1.toLocaleString()}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.paper2.toLocaleString()}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.assigned_total.toLocaleString()}</td>
            <td className="px-3 py-2.5 tabular-nums">
              {totals.num_days != null ? totals.num_days.toLocaleString() : "—"}
            </td>
          </>
        ) : (
          <>
            <td
              className="px-3 py-2.5 tabular-nums"
              title={breakdown ?? `No scripts for ${scopeLabel}`}
            >
              {totals.assigned_total.toLocaleString()}
            </td>
            <td className="px-3 py-2.5 tabular-nums">{totals.completed_total.toLocaleString()}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.uncompleted_total.toLocaleString()}</td>
          </>
        )}
        <td className="px-3 py-2.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  {row.has_bank_account ? (
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="size-3" aria-hidden />
                      Bank
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      No bank
                    </Badge>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>Required before payout export.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-3 py-2.5">
          <WorkforceAssignmentRowActions
            personName={row.name}
            canAssign={canAssign}
            assignLabel={isBulkChecker && row.bulk_assignment ? "Edit" : "Assign"}
            assignDisabled={row.availability_status !== "confirmed"}
            onAssign={() => setAssignTarget(row)}
            onView={() => setViewTarget(row)}
            canRegeneratePortal={canRegeneratePortal}
            regenBusy={regenBusyId === row.id}
            onRegenerate={() => void handleRegeneratePortal(row)}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-3 rounded-xl border border-border bg-background/95 px-3 py-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
        {!hideExamFilter ? (
          <div>
            <label className={formLabelClass} htmlFor="workforce-exam">
              Examination
            </label>
            <select
              id="workforce-exam"
              className={formInputClass}
              value={examId ?? ""}
              onChange={(e) => onExamChange(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select examination…</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {contextLine ? (
          <p className="text-xs text-muted-foreground">
            <Clock className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
            <span className="hidden md:inline">{contextLine}</span>
            <span className="md:hidden">{mobileContextLine}</span>
          </p>
        ) : null}
      </div>

      {!canLoad ? (
        <EmptyStatePanel
          title="Choose an examination"
          description="Select an examination to view the roster and assign work."
        />
      ) : loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <EmptyStatePanel
          title="Could not load roster"
          description={loadError}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadRoster()}>
              <RefreshCw className="mr-1.5 size-4" aria-hidden />
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyStatePanel
          title={
            cohortId
              ? `No confirmed ${config.labelPlural.toLowerCase()} in this cohort`
              : `No confirmed ${config.labelPlural.toLowerCase()} yet`
          }
          description={
            cohortId
              ? "Try another cohort, or clear the cohort filter to see everyone."
              : "Only people who have accepted the SMS invite appear here. Add roster members and send invites before assigning work."
          }
          action={
            cohortId ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setCohortId("")}>
                Clear cohort filter
              </Button>
            ) : showRosterLinks ? (
              <Button type="button" asChild className={officialAccountsBtnPrimary}>
                <Link href={config.adminRosterPath}>Add to roster</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {showSummaryStats ? (
            <div className="hidden md:block">
              <WorkforceAssignmentSummaryStats
                counts={summaryCounts}
                activeFilter={statusFilter}
                onFilterClick={setStatusFilter}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1 sm:min-w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, reference, phone…"
                className={cn(formInputClass, "h-9 pl-9")}
                aria-label="Search roster"
              />
            </div>
            {!isBulkChecker ? (
              <>
                <div className="w-full sm:w-56">
                  <label className="sr-only" htmlFor="workforce-subject-filter">
                    Subject
                  </label>
                  <select
                    id="workforce-subject-filter"
                    className={cn(formInputClass, "h-9")}
                    value={subjectFilterLocked ? String(lockedSubjectIds![0]) : filterSubjectId}
                    disabled={subjectFilterLocked}
                    onChange={(e) => {
                      setFilterSubjectId(e.target.value);
                      setFilterPaperNumber("");
                    }}
                  >
                    {!subjectFilterLocked ? <option value="">All subjects</option> : null}
                    {subjectFilterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-36">
                  <label className="sr-only" htmlFor="workforce-paper-filter">
                    Paper
                  </label>
                  <select
                    id="workforce-paper-filter"
                    className={cn(formInputClass, "h-9")}
                    value={filterPaperNumber}
                    disabled={scriptScope.subjectId == null}
                    onChange={(e) => setFilterPaperNumber(e.target.value)}
                  >
                    <option value="">All papers</option>
                    <option value="1">Paper 1</option>
                    <option value="2">Paper 2</option>
                  </select>
                </div>
              </>
            ) : null}
            <div className="w-full sm:w-56">
              <label className="sr-only" htmlFor="workforce-cohort-filter">
                Cohort
              </label>
              <select
                id="workforce-cohort-filter"
                className={cn(formInputClass, "h-9")}
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
              >
                <option value="">All cohorts</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 md:hidden"
              onClick={() => void loadRoster()}
              disabled={loading}
              aria-label="Refresh roster"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => void loadRoster()}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-1.5 size-4", loading && "animate-spin")} aria-hidden />
              Refresh
            </Button>
          </div>
          {actionError ? (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          {showSummaryStats && statusFilter !== "all" ? (
            <div className="hidden items-center gap-2 md:flex">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
                Showing: {WORKFORCE_ASSIGNMENT_FILTER_LABEL[statusFilter]}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  aria-label="Clear filter"
                  onClick={() => setStatusFilter("all")}
                >
                  <X className="size-3" />
                </button>
              </span>
            </div>
          ) : null}

          {visibleRows.length === 0 ? (
            <EmptyStatePanel
              title="No matches"
              description="Try clearing the search or filter to see more people."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Name</th>
                      <th className="px-3 py-2.5 font-medium">Phone</th>
                      <th className="px-3 py-2.5 font-medium">Reference</th>
                      <th className="px-3 py-2.5 font-medium">Cohort</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      {isBulkChecker ? (
                        <>
                          <th className="px-3 py-2.5 font-medium">P1</th>
                          <th className="px-3 py-2.5 font-medium">P2</th>
                          <th className="px-3 py-2.5 font-medium">Total</th>
                          <th className="px-3 py-2.5 font-medium">Days at post</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2.5 font-medium" title={scopeLabel}>
                            Total
                          </th>
                          <th className="px-3 py-2.5 font-medium" title={scopeLabel}>
                            Completed
                          </th>
                          <th className="px-3 py-2.5 font-medium" title={scopeLabel}>
                            Uncompleted
                          </th>
                        </>
                      )}
                      <th className="px-3 py-2.5 font-medium">Bank</th>
                      <th className="px-3 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">{visibleRows.map(renderRow)}</tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {visibleRows.map(({ row, totals, breakdown }) => (
                  <WorkforceAssignmentMobileCard
                    key={row.id}
                    row={row}
                    assignedTotal={totals.assigned_total}
                    completedTotal={totals.completed_total}
                    uncompletedTotal={totals.uncompleted_total}
                    subjectBreakdown={breakdown}
                    scopeLabel={scopeLabel}
                    canAssign={canAssign}
                    assignLabel={isBulkChecker && row.bulk_assignment ? "Edit" : "Assign"}
                    bulkTotals={
                      isBulkChecker
                        ? { paper1: totals.paper1, paper2: totals.paper2, daysAtPost: totals.num_days }
                        : null
                    }
                    canRegeneratePortal={canRegeneratePortal}
                    regenBusy={regenBusyId === row.id}
                    onRegenerate={() => void handleRegeneratePortal(row)}
                    onAssign={() => setAssignTarget(row)}
                    onViewAssignments={() => setViewTarget(row)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {examId != null ? (
        <>
          {canAssign ? (
            isBulkChecker ? (
              <WorkforceBulkAssignModal
                open={assignTarget != null}
                onClose={() => setAssignTarget(null)}
                examId={examId}
                person={assignTarget}
                onSaved={loadRoster}
              />
            ) : (
              <WorkforceAssignBatchModal
                open={assignTarget != null}
                onClose={() => setAssignTarget(null)}
                config={config}
                examId={examId}
                subjects={subjects}
                lockedSubjectIds={lockedSubjectIds}
                preferredSubjectId={scriptScope.subjectId}
                preferredPaperNumber={scriptScope.paperNumber}
                person={assignTarget}
                onAssigned={loadRoster}
              />
            )
          ) : null}

          <WorkforcePersonAssignmentsModal
            open={viewTarget != null}
            onClose={() => setViewTarget(null)}
            config={config}
            examId={examId}
            subjects={subjects}
            person={viewTarget}
            canCancelBatch={canCancelBatch}
            onUpdated={loadRoster}
          />
        </>
      ) : null}
    </div>
  );
}
