"use client";

import { useMemo, useState, type RefObject } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { AbsentReviewEntry } from "@/types/document";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MarkerBadge,
  PaperChip,
  absentEntryKey,
  paperLabel,
} from "@/components/absent-review-ui";

interface AbsentReviewDataTableProps {
  entries: AbsentReviewEntry[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick: (entry: AbsentReviewEntry, index: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
}

export function AbsentReviewDataTable({
  entries,
  loading,
  error,
  onRetry,
  onRowClick,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  total,
  onPageChange,
  searchInputRef,
}: AbsentReviewDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<AbsentReviewEntry>[]>(
    () => [
      {
        accessorKey: "candidate_index_number",
        header: "Index",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium tabular-nums">
            {row.original.candidate_index_number || "—"}
          </span>
        ),
      },
      {
        accessorKey: "candidate_name",
        header: "Candidate",
        cell: ({ row }) => (
          <span className="max-w-44 truncate text-sm">{row.original.candidate_name || "—"}</span>
        ),
      },
      {
        accessorKey: "school_name",
        header: "School",
        cell: ({ row }) => (
          <span className="max-w-40 truncate text-sm text-muted-foreground">
            {row.original.school_name ?? "—"}
          </span>
        ),
      },
      {
        id: "subject",
        accessorFn: (row) => `${row.subject_code} ${row.subject_name}`,
        header: "Subject",
        cell: ({ row }) => (
          <span className="text-sm">
            <span className="font-medium">{row.original.subject_code}</span>
            <span className="text-muted-foreground"> · {row.original.subject_name}</span>
          </span>
        ),
      },
      {
        accessorKey: "test_type",
        header: "Paper",
        cell: ({ row }) => <PaperChip testType={row.original.test_type} />,
      },
      {
        accessorKey: "absent_marker",
        header: "Marker",
        cell: ({ row }) => <MarkerBadge marker={row.original.absent_marker} />,
      },
      {
        id: "sheet",
        accessorFn: (row) => (row.document_id ? "DOC" : "NOD"),
        header: "Sheet",
        cell: ({ row }) => {
          const hasDoc = !!row.original.document_id;
          return (
            <Badge
              variant={hasDoc ? "default" : "secondary"}
              className="h-5 px-1.5 text-[10px]"
              title={hasDoc ? "Has score sheet" : "No document linked"}
            >
              {hasDoc ? "DOC" : "NOD"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "total_score",
        header: "Total",
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">{row.original.total_score}</span>
        ),
      },
      {
        accessorKey: "grade",
        header: "Grade",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.grade ?? "—"}</span>
        ),
      },
      {
        id: "review",
        header: "",
        enableSorting: false,
        cell: () => (
          <span className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            Review
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const entry = row.original;
      const q = String(filterValue).toLowerCase();
      return (
        entry.candidate_index_number.toLowerCase().includes(q) ||
        entry.candidate_name.toLowerCase().includes(q) ||
        (entry.school_name?.toLowerCase().includes(q) ?? false) ||
        (entry.school_code?.toLowerCase().includes(q) ?? false) ||
        entry.subject_code.toLowerCase().includes(q) ||
        entry.subject_name.toLowerCase().includes(q) ||
        paperLabel(entry.test_type).toLowerCase().includes(q) ||
        entry.absent_marker.toLowerCase().includes(q)
      );
    },
    state: { sorting, globalFilter },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search index, name, school…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 pl-8 pr-8"
          />
          {globalFilter ? (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => setGlobalFilter("")}
            >
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {total} in queue
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs">Show</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(parseInt(value, 10))}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{error}</span>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="mb-3 h-7 w-7 animate-spin text-amber-600" />
            <p className="text-sm text-muted-foreground">Loading absent marks…</p>
          </div>
        ) : (
          <Table containerClassName="sems-table-scroll h-full overflow-auto">
            <TableHeader className="sticky top-0 z-10 bg-background/95 shadow-[inset_0_-1px_0_0_var(--border)] backdrop-blur-sm supports-backdrop-filter:bg-background/80 [&_tr]:border-b-0">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="h-9 bg-transparent">
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon sorted={header.column.getIsSorted()} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-14 text-center text-muted-foreground">
                    No rows match this search.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const originalIndex = entries.findIndex(
                    (entry) => absentEntryKey(entry) === absentEntryKey(row.original)
                  );
                  return (
                    <TableRow
                      key={row.id}
                      className={cn("group h-10 cursor-pointer hover:bg-amber-50/60")}
                      onClick={() =>
                        onRowClick(row.original, originalIndex >= 0 ? originalIndex : row.index)
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-1.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t px-4 py-2.5">
        <p className="text-sm text-muted-foreground tabular-nums">
          {total} absent {total === 1 ? "paper" : "papers"} remaining
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            Page {currentPage} of {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages || totalPages === 0}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
