"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

import { Search, ChevronRight, CalendarDays, Users } from "lucide-react";

import { cohortScheduleSummaryParts } from "@/components/cohorts/cohort-schedule-fields";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { CohortListItem } from "@/components/cohorts/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExaminerTypeApi } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  cohorts: CohortListItem[];
  onSelect: (id: string) => void;
  onNew: () => void;
  newLabel?: string;
  emptyLabel?: string;
  loading?: boolean;
  unassignedCount?: number;
  /** Passive count only — no link (use coverage bar for action). */
  showUnassignedCount?: boolean;
  searchPlaceholder?: string;
  entityLabel?: string;
  /** Hide inline New button when parent provides one in the toolbar */
  hideNewButton?: boolean;
  /** Show schedule column (subject cohorts). */
  showScheduleColumn?: boolean;
};

function roleChipLabel(role: string): string {
  return EXAMINER_TYPE_LABELS[role as ExaminerTypeApi] ?? role;
}

function cohortSearchText(c: CohortListItem, showSchedule: boolean): string {
  const scheduleParts = showSchedule
    ? cohortScheduleSummaryParts({
        coordinationStartDate: c.coordinationStartDate,
        coordinationStartTime: c.coordinationStartTime,
        coordinationEndDate: c.coordinationEndDate,
        coordinationEndTime: c.coordinationEndTime,
        markingStartDate: c.markingStartDate,
        markingEndDate: c.markingEndDate,
        markedScriptSubmissionDeadline: c.markedScriptSubmissionDeadline,
      })
    : [];
  return [
    c.name,
    ...c.source_regions,
    ...(c.source_roles ?? []).map(roleChipLabel),
    ...scheduleParts,
  ]
    .join(" ")
    .toLowerCase();
}

export function CohortListColumn({
  cohorts,
  onSelect,
  onNew,
  newLabel = "New cohort",
  emptyLabel = "No cohorts yet.",
  loading = false,
  unassignedCount = 0,
  showUnassignedCount = false,
  searchPlaceholder = "Search cohorts…",
  entityLabel = "cohort",
  hideNewButton = false,
  showScheduleColumn = false,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cohorts;
    return cohorts.filter((c) => cohortSearchText(c, showScheduleColumn).includes(q));
  }, [cohorts, search, showScheduleColumn]);

  const handleTableKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = filtered.findIndex((c) => document.activeElement?.id === `cohort-row-${c.id}`);
        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(idx < 0 ? 0 : idx + 1, filtered.length - 1)
            : Math.max(idx < 0 ? 0 : idx - 1, 0);
        const next = filtered[nextIdx];
        if (next) document.getElementById(`cohort-row-${next.id}`)?.focus();
      } else if (e.key === "Enter" && document.activeElement instanceof HTMLElement) {
        const id = document.activeElement.id.replace("cohort-row-", "");
        if (filtered.some((c) => c.id === id)) {
          e.preventDefault();
          onSelect(id);
        }
      }
    },
    [filtered, onSelect],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              className={cn(formInputClass, "h-9 pl-9")}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={`Search ${entityLabel}s`}
            />
          </div>
          {!hideNewButton ? (
            <Button type="button" size="sm" onClick={onNew}>
              {newLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 py-3 sm:px-5" onKeyDown={handleTableKeyDown}>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              {cohorts.length === 0 ? emptyLabel : `No ${entityLabel}s match your search.`}
            </p>
            {cohorts.length === 0 ? (
              <Button type="button" size="sm" onClick={onNew}>
                {newLabel}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2 md:hidden" role="list">
              {filtered.map((c) => {
                const scheduleParts = cohortScheduleSummaryParts({
                  coordinationStartDate: c.coordinationStartDate,
                  coordinationStartTime: c.coordinationStartTime,
                  coordinationEndDate: c.coordinationEndDate,
                  coordinationEndTime: c.coordinationEndTime,
                  markingStartDate: c.markingStartDate,
                  markingEndDate: c.markingEndDate,
                  markedScriptSubmissionDeadline: c.markedScriptSubmissionDeadline,
                });
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      id={`cohort-card-${c.id}`}
                      onClick={() => onSelect(c.id)}
                      className="flex w-full items-start gap-3 rounded-xl border border-border/80 bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{c.name}</span>
                          {c.is_default ? (
                            <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wide">
                              Default
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3.5 shrink-0 opacity-70" aria-hidden />
                            {c.examiner_ids.length} examiner{c.examiner_ids.length === 1 ? "" : "s"}
                          </span>
                          {showScheduleColumn && scheduleParts.length > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5 shrink-0 opacity-70" aria-hidden />
                              <span className="line-clamp-1">{scheduleParts[0]}</span>
                            </span>
                          ) : null}
                        </div>
                        {showScheduleColumn && scheduleParts.length > 1 ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {scheduleParts.slice(1).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="hidden h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border md:flex">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="min-w-40">Name</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">Examiners</TableHead>
                      {showScheduleColumn ? (
                        <TableHead className="min-w-48">Schedule</TableHead>
                      ) : null}
                      <TableHead className="min-w-36">Rules</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => {
                      const scheduleParts = cohortScheduleSummaryParts({
                        coordinationStartDate: c.coordinationStartDate,
                        coordinationStartTime: c.coordinationStartTime,
                        coordinationEndDate: c.coordinationEndDate,
                        coordinationEndTime: c.coordinationEndTime,
                        markingStartDate: c.markingStartDate,
                        markingEndDate: c.markingEndDate,
                        markedScriptSubmissionDeadline: c.markedScriptSubmissionDeadline,
                      });
                      return (
                        <TableRow
                          key={c.id}
                          id={`cohort-row-${c.id}`}
                          tabIndex={0}
                          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                          onClick={() => onSelect(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelect(c.id);
                            }
                          }}
                        >
                          <TableCell className="font-medium text-foreground">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              {c.name}
                              {c.is_default ? (
                                <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wide">
                                  Default
                                </Badge>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {c.examiner_ids.length}
                          </TableCell>
                          {showScheduleColumn ? (
                            <TableCell className="max-w-xs text-xs text-muted-foreground">
                              {scheduleParts.length > 0 ? (
                                <span className="line-clamp-2">{scheduleParts.join(" · ")}</span>
                              ) : (
                                <span className="italic">No schedule</span>
                              )}
                            </TableCell>
                          ) : null}
                          <TableCell>
                            {(c.source_regions.length > 0 || (c.source_roles?.length ?? 0) > 0) ? (
                              <div className="flex flex-wrap gap-1">
                                {c.source_regions.slice(0, 2).map((r) => (
                                  <Badge key={r} variant="secondary" className="text-[10px] font-normal">
                                    {r}
                                  </Badge>
                                ))}
                                {c.source_regions.length > 2 ? (
                                  <Badge variant="secondary" className="text-[10px] font-normal">
                                    +{c.source_regions.length - 2}
                                  </Badge>
                                ) : null}
                                {(c.source_roles ?? []).slice(0, 1).map((r) => (
                                  <Badge key={r} variant="outline" className="text-[10px] font-normal">
                                    {roleChipLabel(r)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>

      {showUnassignedCount && unassignedCount > 0 ? (
        <div className="shrink-0 border-t border-border/80 px-4 py-3 sm:px-5">
          <p className="text-xs text-muted-foreground">
            {unassignedCount} examiner{unassignedCount === 1 ? "" : "s"} not in any {entityLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}
