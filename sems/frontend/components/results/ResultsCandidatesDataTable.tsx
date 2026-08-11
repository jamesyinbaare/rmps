"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CandidateResultSummary, ExamProgrammeSummary } from "@/types/document";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  X,
} from "lucide-react";

type StatusFilter = "all" | "ready" | "pending";

interface ResultsCandidatesDataTableProps {
  candidates: CandidateResultSummary[];
  programmes?: ExamProgrammeSummary[];
  loading?: boolean;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (value: StatusFilter) => void;
  onSelect?: (candidate: CandidateResultSummary) => void;
  onBrowseListChange?: (candidates: CandidateResultSummary[]) => void;
}

function programmeLabel(row: CandidateResultSummary): string {
  if (row.programme_code && row.programme_name) {
    return `${row.programme_code} — ${row.programme_name}`;
  }
  return row.programme_name || row.programme_code || "No programme";
}

function programmeKey(row: CandidateResultSummary): string {
  return row.programme_id != null ? String(row.programme_id) : "none";
}

function subjectProgress(row: CandidateResultSummary): number {
  if (row.subjects_registered <= 0) return 0;
  return Math.round((row.subjects_graded / row.subjects_registered) * 100);
}

export function ResultsCandidatesDataTable({
  candidates,
  programmes,
  loading,
  statusFilter: controlledStatus,
  onStatusFilterChange,
  onSelect,
  onBrowseListChange,
}: ResultsCandidatesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "index_number", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState<string>("all");
  const [uncontrolledStatus, setUncontrolledStatus] = useState<StatusFilter>("all");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 50,
  });

  const statusFilter = controlledStatus ?? uncontrolledStatus;
  const setStatusFilter = (value: StatusFilter) => {
    onStatusFilterChange?.(value);
    if (controlledStatus === undefined) setUncontrolledStatus(value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const programmeOptions = useMemo(() => {
    if (programmes?.length) {
      return programmes.map((p) => [
        String(p.programme_id),
        `${p.programme_code} — ${p.programme_name} (${p.candidate_count})`,
      ] as const);
    }
    const map = new Map<string, string>();
    for (const row of candidates) {
      map.set(programmeKey(row), programmeLabel(row));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [candidates, programmes]);

  const filteredCandidates = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    return candidates.filter((row) => {
      if (programmeFilter !== "all" && programmeKey(row) !== programmeFilter) {
        return false;
      }
      if (statusFilter === "ready" && !row.is_fully_graded) return false;
      if (statusFilter === "pending" && row.is_fully_graded) return false;
      if (!q) return true;
      return (
        row.candidate_name.toLowerCase().includes(q) ||
        row.index_number.toLowerCase().includes(q) ||
        programmeLabel(row).toLowerCase().includes(q)
      );
    });
  }, [candidates, globalFilter, programmeFilter, statusFilter]);

  const columns = useMemo<ColumnDef<CandidateResultSummary>[]>(
    () => [
      {
        accessorKey: "index_number",
        header: "Index",
        cell: ({ row }) => (
          <div className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.index_number}
          </div>
        ),
      },
      {
        accessorKey: "candidate_name",
        header: "Candidate",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.candidate_name}</div>
            <div className="truncate text-xs text-muted-foreground lg:hidden">
              {programmeLabel(row.original)}
            </div>
          </div>
        ),
      },
      {
        id: "programme",
        accessorFn: (row) => programmeLabel(row),
        header: "Programme",
        cell: ({ getValue }) => (
          <div className="max-w-[260px] truncate text-sm text-muted-foreground">
            {getValue<string>()}
          </div>
        ),
      },
      {
        id: "subjects",
        accessorFn: (row) => subjectProgress(row),
        header: "Subjects graded",
        cell: ({ row }) => {
          const pct = subjectProgress(row.original);
          return (
            <div className="w-36">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="tabular-nums font-medium">
                  {row.original.subjects_graded}/{row.original.subjects_registered}
                </span>
                {row.original.subjects_pending > 0 ? (
                  <span className="text-amber-700">{row.original.subjects_pending} left</span>
                ) : (
                  <span className="text-emerald-700">Done</span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    pct === 100 ? "bg-emerald-500" : "bg-amber-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (row) => (row.is_fully_graded ? "Ready" : "Pending"),
        header: "Status",
        cell: ({ row }) =>
          row.original.is_fully_graded ? (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ready</Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-800"
            >
              Pending
            </Badge>
          ),
      },
      {
        id: "open",
        enableSorting: false,
        header: "",
        cell: () => (
          <span className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            View
          </span>
        ),
      },
    ],
    []
  );

  const tableData = useMemo(
    () =>
      [...filteredCandidates].sort((a, b) => {
        const byProgramme = programmeLabel(a).localeCompare(programmeLabel(b));
        if (byProgramme !== 0) return byProgramme;
        return a.index_number.localeCompare(b.index_number);
      }),
    [filteredCandidates]
  );

  useEffect(() => {
    onBrowseListChange?.(tableData);
  }, [tableData, onBrowseListChange]);

  const showGroups =
    programmeFilter === "all" &&
    programmeOptions.length > 1 &&
    (sorting[0]?.id === "index_number" || sorting[0]?.id === "programme");

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
      columnVisibility: { programme: !showGroups },
    },
  });

  const pageRows = table.getRowModel().rows;
  const groupedPage = useMemo(() => {
    const groups: { key: string; label: string; rows: typeof pageRows }[] = [];
    for (const row of pageRows) {
      const key = programmeKey(row.original);
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, label: programmeLabel(row.original), rows: [row] });
      } else {
        last.rows.push(row);
      }
    }
    return groups;
  }, [pageRows]);

  const totalFiltered = filteredCandidates.length;
  const startIndex =
    totalFiltered === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const endIndex = Math.min(
    pagination.pageIndex * pagination.pageSize + pageRows.length,
    totalFiltered
  );
  const hasActiveFilters =
    globalFilter.trim() !== "" || programmeFilter !== "all" || statusFilter !== "all";

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading candidates…
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-1 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Candidates</h2>
          <p className="text-xs text-muted-foreground">
            {totalFiltered} shown
            {totalFiltered !== candidates.length ? ` of ${candidates.length}` : ""}
            {onSelect ? " · click a row for grades and scores" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name or index number"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="h-9 bg-background pl-9"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => setGlobalFilter("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={programmeFilter}
            onValueChange={(value) => {
              setProgrammeFilter(value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          >
            <SelectTrigger className="h-9 w-[240px] bg-background">
              <SelectValue placeholder="Programme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {programmeOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="h-9 w-[150px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-9 w-[92px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setGlobalFilter("");
                setProgrammeFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="bg-muted/30">
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:text-foreground"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                      disabled={!header.column.getCanSort()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {pageRows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-40">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">
                    {candidates.length === 0
                      ? "No candidates at this school"
                      : "No candidates match these filters"}
                  </p>
                  {hasActiveFilters && candidates.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setGlobalFilter("");
                        setProgrammeFilter("all");
                        setStatusFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : showGroups ? (
            groupedPage.map((group, groupIndex) => (
              <GroupRows
                key={`${group.key}-${groupIndex}`}
                label={group.label}
                count={group.rows.length}
                colSpan={columns.length}
              >
                {group.rows.map((row) => (
                  <CandidateRow
                    key={row.id}
                    onSelect={onSelect ? () => onSelect(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </CandidateRow>
                ))}
              </GroupRows>
            ))
          ) : (
            pageRows.map((row) => (
              <CandidateRow
                key={row.id}
                onSelect={onSelect ? () => onSelect(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </CandidateRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalFiltered > 0 && (
        <div className="flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {startIndex}–{endIndex} of {totalFiltered}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CandidateRow({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <TableRow
      className={cn("group", onSelect && "cursor-pointer")}
      onClick={onSelect}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {children}
    </TableRow>
  );
}

function GroupRows({
  label,
  count,
  colSpan,
  children,
}: {
  label: string;
  count: number;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={colSpan}
          className="bg-muted/60 py-2 text-xs font-semibold tracking-wide text-foreground"
        >
          {label}
          <span className="ml-2 font-normal text-muted-foreground">
            {count} on this page
          </span>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
