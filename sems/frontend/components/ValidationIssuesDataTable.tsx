"use client";

import { useMemo, useState } from "react";
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
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Loader2,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueStatus,
  ValidationIssueType,
} from "@/types/document";
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

interface ValidationIssuesDataTableProps {
  issues: SubjectScoreValidationIssue[];
  loading?: boolean;
  error?: string | null;
  onRowClick: (issue: SubjectScoreValidationIssue, index: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
}

function getStatusBadge(status: ValidationIssueStatus) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-700">
          <AlertCircle className="mr-1 h-3 w-3" />
          Open
        </Badge>
      );
    case "resolved":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Resolved
        </Badge>
      );
    case "ignored":
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-700">
          <XCircle className="mr-1 h-3 w-3" />
          Ignored
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
          <AlertCircle className="mr-1 h-3 w-3" />
          Skipped
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

function getIssueTypeBadge(issueType: ValidationIssueType) {
  switch (issueType) {
    case "missing_score":
      return (
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
          Missing Score
        </Badge>
      );
    case "invalid_score":
      return (
        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
          Invalid Score
        </Badge>
      );
    default:
      return <Badge>{issueType}</Badge>;
  }
}

function getTestTypeLabel(testType: number) {
  switch (testType) {
    case 1:
      return "Objectives";
    case 2:
      return "Essay";
    case 3:
      return "Practical";
    default:
      return `Type ${testType}`;
  }
}

function getFieldNameLabel(fieldName: string) {
  switch (fieldName) {
    case "obj_raw_score":
      return "Objectives";
    case "essay_raw_score":
      return "Essay";
    case "pract_raw_score":
      return "Practical";
    default:
      return fieldName;
  }
}

export function ValidationIssuesDataTable({
  issues,
  loading,
  error,
  onRowClick,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  total,
  onPageChange,
}: ValidationIssuesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<SubjectScoreValidationIssue>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        accessorKey: "issue_type",
        header: "Type",
        cell: ({ row }) => getIssueTypeBadge(row.original.issue_type),
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
        accessorKey: "candidate_index_number",
        header: "Index",
        cell: ({ row }) => (
          <div className="font-mono text-sm font-medium tabular-nums">
            {row.original.candidate_index_number || "—"}
          </div>
        ),
      },
      {
        accessorKey: "candidate_name",
        header: "Candidate",
        cell: ({ row }) => (
          <div className="max-w-[180px] truncate text-sm">
            {row.original.candidate_name || "—"}
          </div>
        ),
      },
      {
        accessorKey: "field_name",
        header: "Field",
        cell: ({ row }) => (
          <span className="text-sm">{getFieldNameLabel(row.original.field_name)}</span>
        ),
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => (
          <div className="max-w-[280px] truncate text-sm text-muted-foreground">
            {row.original.message || "—"}
          </div>
        ),
      },
      {
        accessorKey: "batch_name",
        header: "Batch",
        cell: ({ row }) => (
          <span className="max-w-[120px] truncate text-sm text-muted-foreground">
            {row.original.batch_name ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {format(new Date(row.original.created_at), "MMM d, yyyy")}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: issues,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const issue = row.original;
      const searchValue = String(filterValue).toLowerCase();
      return (
        (issue.candidate_index_number?.toLowerCase().includes(searchValue) ?? false) ||
        (issue.candidate_name?.toLowerCase().includes(searchValue) ?? false) ||
        (issue.message?.toLowerCase().includes(searchValue) ?? false) ||
        (issue.field_name?.toLowerCase().includes(searchValue) ?? false) ||
        (issue.batch_name?.toLowerCase().includes(searchValue) ?? false) ||
        getFieldNameLabel(issue.field_name).toLowerCase().includes(searchValue)
      );
    },
    state: { sorting, globalFilter },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/10 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search index, name, batch, message…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 border-border/70 bg-background pl-9 pr-9 shadow-sm"
            />
            {globalFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                onClick={() => setGlobalFilter("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 py-1 shadow-sm">
            <span className="text-xs font-medium text-muted-foreground">Rows</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value, 10))}
            >
              <SelectTrigger className="h-7 w-[72px] border-0 bg-transparent px-1 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md bg-muted/40 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
          {issues.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
          {Math.min(currentPage * pageSize, total)} of {total.toLocaleString()}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">Loading issues...</div>
          </div>
        ) : (
          <Table containerClassName="sems-table-scroll h-full overflow-auto">
            <TableHeader className="sticky top-0 z-10 bg-background/95 shadow-[inset_0_-1px_0_0_var(--border)] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 [&_tr]:border-b-0">
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
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-14 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
                      <p className="font-medium text-foreground">No issues found</p>
                      <p className="max-w-sm text-sm">
                        Try adjusting your filters, or run validation to check for missing and
                        invalid scores.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const originalIndex = issues.findIndex((i) => i.id === row.original.id);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn("cursor-pointer hover:bg-muted/50")}
                      onClick={() => onRowClick(row.original, originalIndex >= 0 ? originalIndex : row.index)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
