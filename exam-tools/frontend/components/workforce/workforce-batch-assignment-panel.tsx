"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Clock, RefreshCw, Search, X } from "lucide-react";

import { WorkforceAssignBatchModal } from "@/components/workforce/workforce-assign-batch-modal";
import { WorkforceAssignmentMobileCard } from "@/components/workforce/workforce-assignment-mobile-card";
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
  type Examination,
  type Subject,
  type WorkforceAssignmentPersonRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
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
  hideExamFilter?: boolean;
  formatExamLabel: (exam: Examination) => string;
};

function rowPriority(row: WorkforceAssignmentPersonRow): number {
  if (row.uncompleted_total > 0) return 0;
  if (row.availability_status === "pending") return 1;
  if (row.availability_status === "confirmed") return 2;
  return 3;
}

function matchesFilter(row: WorkforceAssignmentPersonRow, filter: WorkforceAssignmentStatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return row.availability_status === "confirmed" && row.uncompleted_total === 0;
    case "active":
      return row.uncompleted_total > 0;
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
  hideExamFilter = false,
  formatExamLabel,
}: Props) {
  const [rows, setRows] = useState<WorkforceAssignmentPersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkforceAssignmentStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignTarget, setAssignTarget] = useState<WorkforceAssignmentPersonRow | null>(null);
  const [viewTarget, setViewTarget] = useState<WorkforceAssignmentPersonRow | null>(null);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [examId, exams]);
  const canLoad = examId != null;

  const loadRoster = useCallback(async () => {
    if (examId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getWorkforceAssignmentRoster(config.kind, examId);
      setRows(data.items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load roster");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [config.kind, examId]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    setStatusFilter("all");
    setSearchQuery("");
  }, [examId]);

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

  const summaryCounts = useMemo((): WorkforceAssignmentSummaryCounts => {
    return {
      roster: rows.length,
      ready: rows.filter((r) => r.availability_status === "confirmed" && r.uncompleted_total === 0).length,
      active: rows.filter((r) => r.uncompleted_total > 0).length,
      awaiting: rows.filter((r) => r.availability_status === "pending").length,
      declined: rows.filter((r) => r.availability_status === "declined").length,
      noBank: rows.filter((r) => !r.has_bank_account).length,
      activeScriptTotal: rows.reduce((sum, r) => sum + r.uncompleted_total, 0),
      completedTotal: rows.reduce((sum, r) => sum + r.completed_total, 0),
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    return rows
      .filter((row) => matchesFilter(row, statusFilter) && matchesSearch(row, searchQuery))
      .slice()
      .sort((a, b) => {
        const pd = rowPriority(a) - rowPriority(b);
        if (pd !== 0) return pd;
        return a.name.localeCompare(b.name);
      });
  }, [rows, searchQuery, statusFilter]);

  const contextLine =
    canLoad && selectedExam
      ? `${formatExamLabel(selectedExam)} · ${rows.length} ${config.labelPlural.toLowerCase()}`
      : null;

  const activeBatchPeople = useMemo(() => rows.filter((r) => r.uncompleted_total > 0).length, [rows]);
  const mobileContextLine =
    canLoad && selectedExam
      ? `${rows.length} ${config.labelPlural.toLowerCase()} · ${activeBatchPeople} with active batches`
      : null;

  function renderRow(row: WorkforceAssignmentPersonRow) {
    const hasActive = row.uncompleted_total > 0;
    return (
      <tr
        key={row.id}
        className={cn("bg-card", hasActive && "border-l-2 border-l-primary bg-primary/3")}
      >
        <td className="px-3 py-2.5">
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[row.reference_code, row.phone_number].filter(Boolean).join(" · ") || "—"}
          </p>
        </td>
        <td className="px-3 py-2.5">
          <WorkforceAvailabilityBadge status={row.availability_status} />
        </td>
        <td className="px-3 py-2.5 tabular-nums">{row.assigned_total.toLocaleString()}</td>
        <td className="px-3 py-2.5 tabular-nums">{row.completed_total.toLocaleString()}</td>
        <td className="px-3 py-2.5 tabular-nums">{row.uncompleted_total.toLocaleString()}</td>
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
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={row.availability_status !== "confirmed"}
              onClick={() => setAssignTarget(row)}
            >
              Assign
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setViewTarget(row)}>
              View assignments
            </Button>
          </div>
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
          description="Select an examination to view the roster and assign batches."
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
          title={`No confirmed ${config.labelPlural.toLowerCase()} yet`}
          description="Only people who have accepted the SMS invite appear here. Add roster members and send invites before assigning work."
          action={
            showRosterLinks ? (
              <Button type="button" asChild className={officialAccountsBtnPrimary}>
                <Link href={config.adminRosterPath}>Add to roster</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <WorkforceAssignmentSummaryStats
              counts={summaryCounts}
              activeFilter={statusFilter}
              onFilterClick={setStatusFilter}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
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

          {statusFilter !== "all" ? (
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
                      <th className="px-3 py-2.5 font-medium">Person</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Total</th>
                      <th className="px-3 py-2.5 font-medium">Completed</th>
                      <th className="px-3 py-2.5 font-medium">Uncompleted</th>
                      <th className="px-3 py-2.5 font-medium">Bank</th>
                      <th className="px-3 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">{visibleRows.map(renderRow)}</tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {visibleRows.map((row) => (
                  <WorkforceAssignmentMobileCard
                    key={row.id}
                    row={row}
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
          <WorkforceAssignBatchModal
            open={assignTarget != null}
            onClose={() => setAssignTarget(null)}
            config={config}
            examId={examId}
            subjects={subjects}
            lockedSubjectIds={lockedSubjectIds}
            person={assignTarget}
            onAssigned={loadRoster}
          />

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
