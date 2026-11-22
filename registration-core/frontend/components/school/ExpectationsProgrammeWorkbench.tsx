"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  Target,
} from "lucide-react";
import type {
  ProgrammeExpectationProgress,
  SchoolExamExpectations,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  OtherProgrammesBreakdown,
  programmesWithRegistrationsNoTarget,
} from "@/components/school/OtherProgrammesBreakdown";

type StatusFilter = "all" | "on_track" | "under" | "over";
type SortKey = "programme" | "actual" | "expected" | "remaining" | "progress";
type SortDir = "asc" | "desc";

interface ExpectationsProgrammeWorkbenchProps {
  data: SchoolExamExpectations;
  onEdit: () => void;
  className?: string;
}

function statusOf(p: ProgrammeExpectationProgress): StatusFilter {
  if (p.over) return "over";
  if (p.under) return "under";
  return "on_track";
}

function remainingOf(p: ProgrammeExpectationProgress): number {
  return (p.expected_count ?? 0) - p.actual_count;
}

function progressPct(actual: number, expected: number | null): number {
  if (expected == null || expected <= 0) return 0;
  return Math.min(100, (actual / expected) * 100);
}

export function ExpectationsProgrammeWorkbench({
  data,
  onEdit,
  className,
}: ExpectationsProgrammeWorkbenchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("programme");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const declared = useMemo(
    () => data.programmes.filter((p) => p.expected_count != null),
    [data.programmes]
  );

  const otherProgrammes = useMemo(
    () => programmesWithRegistrationsNoTarget(data.programmes),
    [data.programmes]
  );

  const programmeStats = useMemo(() => {
    let onTrack = 0;
    let under = 0;
    let over = 0;
    for (const p of declared) {
      const s = statusOf(p);
      if (s === "over") over += 1;
      else if (s === "under") under += 1;
      else onTrack += 1;
    }
    return { onTrack, under, over, other: otherProgrammes.length };
  }, [declared, otherProgrammes]);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = [...declared];
    if (q) {
      list = list.filter((p) =>
        `${p.name} ${p.code}`.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((p) => statusOf(p) === statusFilter);
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "programme") {
        cmp = a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
      } else if (sortKey === "actual") {
        cmp = a.actual_count - b.actual_count;
      } else if (sortKey === "expected") {
        cmp = (a.expected_count ?? 0) - (b.expected_count ?? 0);
      } else if (sortKey === "remaining") {
        cmp = remainingOf(a) - remainingOf(b);
      } else {
        cmp =
          progressPct(a.actual_count, a.expected_count) -
          progressPct(b.actual_count, b.expected_count);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [declared, searchQuery, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
    );
  };

  const filterChips: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "on_track", label: "On track" },
    { value: "under", label: "Under" },
    { value: "over", label: "Over" },
  ];

  if (!data.has_declaration) {
    return (
      <div className={cn("space-y-4 p-5 md:p-6", className)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-muted-foreground" />
              By programme
            </div>
            <p className="text-sm text-muted-foreground">
              Set expected numbers to track each programme against a target.
              {data.actual_total > 0
                ? ` ${data.actual_total.toLocaleString()} registered so far.`
                : " No candidates registered yet."}
            </p>
          </div>
          {data.can_edit && (
            <Button size="sm" onClick={onEdit}>
              Set expected numbers
            </Button>
          )}
        </div>
        {otherProgrammes.length > 0 && (
          <OtherProgrammesBreakdown
            programmes={otherProgrammes}
            undeclaredMode={false}
            canEdit={data.can_edit}
            onAddTargets={onEdit}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {declared.length > 0 && (
        <div className="grid grid-cols-3 gap-3 border-b border-border p-4 md:p-5">
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">On track</div>
            <div className="font-mono text-lg font-medium">
              {programmeStats.onTrack}
            </div>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">Under / Over</div>
            <div className="font-mono text-lg font-medium">
              {programmeStats.under} / {programmeStats.over}
            </div>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">Other</div>
            <div className="font-mono text-lg font-medium">
              {programmeStats.other}
            </div>
          </div>
        </div>
      )}

      {declared.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search programmes…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filterChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setStatusFilter(chip.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  statusFilter === chip.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {declared.length > 0 ? (
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No programmes match your search or filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("programme")}
                    >
                      Programme
                      <SortIcon column="programme" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("actual")}
                    >
                      Actual
                      <SortIcon column="actual" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("expected")}
                    >
                      Expected
                      <SortIcon column="expected" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("remaining")}
                    >
                      Remaining
                      <SortIcon column="remaining" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[140px]">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("progress")}
                    >
                      Progress
                      <SortIcon column="progress" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const rem = remainingOf(p);
                  const pct = progressPct(p.actual_count, p.expected_count);
                  const delta =
                    rem === 0
                      ? "0"
                      : rem > 0
                        ? `−${rem}`
                        : `+${Math.abs(rem)}`;
                  return (
                    <TableRow key={p.programme_id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {p.code}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {p.actual_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(p.expected_count ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono",
                          rem < 0 && "text-amber-700 dark:text-amber-300",
                          rem > 0 && "text-muted-foreground"
                        )}
                      >
                        {delta}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress
                            value={pct}
                            className={cn(
                              "h-1.5",
                              p.over && "[&>div]:bg-amber-500"
                            )}
                          />
                          <div className="text-xs text-muted-foreground">
                            {Math.round(pct)}%
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.over ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          >
                            Over
                          </Badge>
                        ) : p.under ? (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Under
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-success/30 bg-success/10 text-success"
                          >
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      ) : (
        <div className="space-y-3 p-5 md:p-6">
          <p className="text-sm text-muted-foreground">
            Targets are set at the exam level, but no programme-level targets
            yet.
          </p>
          {data.can_edit && (
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              Edit targets
            </Button>
          )}
        </div>
      )}

      {otherProgrammes.length > 0 && (
        <div className="border-t border-border p-5 md:p-6">
          <OtherProgrammesBreakdown
            programmes={otherProgrammes}
            undeclaredMode
            canEdit={data.can_edit}
            onAddTargets={onEdit}
          />
        </div>
      )}
    </div>
  );
}
