"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { SheetIdInfo } from "@/types/document";
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

export type TrackICMSTab = "missing" | "uploaded" | "expected" | "extra";

interface TrackICMSDataTableProps {
  sheets: SheetIdInfo[];
  tab: TrackICMSTab;
  loading?: boolean;
  error?: string | null;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  showExport?: boolean;
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
}

function getTestTypeLabel(testType: number | null) {
  if (testType === 1) return "Objectives";
  if (testType === 2) return "Essay";
  if (testType === 3) return "Practicals";
  return "Unknown";
}

export function TrackICMSDataTable({
  sheets,
  tab,
  loading,
  error,
  onExportCsv,
  onExportExcel,
  showExport = false,
}: TrackICMSDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setGlobalFilter("");
    setPageIndex(0);
  }, [tab]);

  useEffect(() => {
    setPageIndex(0);
  }, [globalFilter, pageSize, sheets]);

  const columns = useMemo<ColumnDef<SheetIdInfo>[]>(() => {
    const base: ColumnDef<SheetIdInfo>[] = [
      {
        accessorKey: "sheet_id",
        header: "Sheet ID",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">{row.original.sheet_id}</span>
        ),
      },
      {
        id: "school",
        accessorFn: (row) => row.school_name || row.school_code || "",
        header: "School",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm">{row.original.school_name || "—"}</div>
            {row.original.school_code ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.original.school_code}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "subject",
        accessorFn: (row) => row.subject_name || row.subject_code || "",
        header: "Subject",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm">{row.original.subject_name || "—"}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {row.original.subject_code ? <span>{row.original.subject_code}</span> : null}
              {row.original.subject_type ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {row.original.subject_type}
                </Badge>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "test_type",
        header: "Test",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {getTestTypeLabel(row.original.test_type)}
          </Badge>
        ),
      },
      {
        accessorKey: "series",
        header: "Series",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.series ?? "—"}</span>
        ),
      },
      {
        accessorKey: "sheet_number",
        header: "Sheet #",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.sheet_number ?? "—"}
          </span>
        ),
      },
    ];

    if (tab === "missing" || tab === "expected") {
      base.push({
        accessorKey: "candidate_count",
        header: "Candidates",
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">{row.original.candidate_count ?? "—"}</span>
        ),
      });
    }

    if (tab === "uploaded" || tab === "extra") {
      base.push({
        accessorKey: "file_name",
        header: "File",
        cell: ({ row }) => (
          <span className="max-w-[200px] truncate text-sm text-muted-foreground">
            {row.original.file_name || "—"}
          </span>
        ),
      });
    }

    return base;
  }, [tab]);

  const table = useReactTable({
    data: sheets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize })
          : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const sheet = row.original;
      const q = String(filterValue).toLowerCase();
      return (
        sheet.sheet_id.toLowerCase().includes(q) ||
        (sheet.school_name?.toLowerCase().includes(q) ?? false) ||
        (sheet.school_code?.toLowerCase().includes(q) ?? false) ||
        (sheet.subject_name?.toLowerCase().includes(q) ?? false) ||
        (sheet.subject_code?.toLowerCase().includes(q) ?? false) ||
        (sheet.file_name?.toLowerCase().includes(q) ?? false)
      );
    },
    state: {
      sorting,
      globalFilter,
      pagination: { pageIndex, pageSize },
    },
  });

  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;
  const showingFrom = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
  const showingTo = Math.min((pageIndex + 1) * pageSize, filteredCount);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search sheet, school, subject..."
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

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                const size = parseInt(value, 10);
                setPageSize(size);
                table.setPageSize(size);
              }}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showExport ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={onExportCsv}
                disabled={filteredCount === 0}
              >
                <FileText className="h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={onExportExcel}
                disabled={filteredCount === 0}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
              </Button>
            </div>
          ) : null}
        </div>

        <div className="text-sm text-muted-foreground">
          Showing {showingFrom}–{showingTo} of {filteredCount}
        </div>
      </div>

      {error ? (
        <div className="mx-4 mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">Loading sheet comparison...</div>
          </div>
        ) : null}

        <Table containerClassName="sems-table-scroll h-full overflow-auto">
          <TableHeader className="sticky top-0 z-10 bg-background/95 shadow-[inset_0_-1px_0_0_var(--border)] backdrop-blur-sm supports-backdrop-filter:bg-background/80 [&_tr]:border-b-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="bg-transparent">
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
            {!loading && table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-14 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <FileSearch className="h-12 w-12 text-muted-foreground/50" />
                    <p className="font-medium text-foreground">No sheets in this view</p>
                    <p className="max-w-sm text-sm">
                      Try a different examination, school, subject, or clear filters.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={cn("hover:bg-muted/50")}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
