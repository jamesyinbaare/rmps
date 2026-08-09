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
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
  XCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Document } from "@/types/document";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ExtractionStatusFilter =
  | "pending"
  | "queued"
  | "processing"
  | "success"
  | "error";

interface ReductoDocumentsDataTableProps {
  documents: Document[];
  loading?: boolean;
  error?: string | null;
  selectedDocuments: Set<number>;
  onSelectDocument: (documentId: number) => void;
  onSelectAll: () => void;
  onRowClick: (document: Document) => void;
  statusFilter?: string;
  onStatusFilterChange: (status: ExtractionStatusFilter | undefined) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  verifyEnabled: boolean;
  onVerifyEnabledChange: (enabled: boolean) => void;
  skipWithoutExtractedId: boolean;
  onSkipWithoutExtractedIdChange: (enabled: boolean) => void;
  queuing?: boolean;
  isPolling?: boolean;
  onQueue: () => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

function getStatusBadge(document: Document) {
  const status = document.scores_extraction_status;
  const methods = document.scores_extraction_methods;
  const methodDisplay = methods && methods.length > 0 ? methods.join(", ") : null;

  if (status === "queued") {
    return (
      <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-300">
        <Clock className="h-3 w-3" />
        Queued
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="default" className="flex items-center gap-1 bg-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Badge variant="default" className="flex items-center gap-1 bg-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Success {methodDisplay && `(${methodDisplay})`}
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
      <Clock className="h-3 w-3 mr-1" />
      {status || "Pending"}
    </Badge>
  );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="ml-1 h-3.5 w-3.5 inline" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 h-3.5 w-3.5 inline" />;
  return <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline opacity-40" />;
}

export function ReductoDocumentsDataTable({
  documents,
  loading,
  error,
  selectedDocuments,
  onSelectDocument,
  onSelectAll,
  onRowClick,
  statusFilter,
  onStatusFilterChange,
  pageSize,
  onPageSizeChange,
  verifyEnabled,
  onVerifyEnabledChange,
  skipWithoutExtractedId,
  onSkipWithoutExtractedIdChange,
  queuing,
  isPolling,
  onQueue,
  currentPage,
  totalPages,
  total,
  onPageChange,
}: ReductoDocumentsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const allSelected = documents.length > 0 && selectedDocuments.size === documents.length;

  const columns = useMemo<ColumnDef<Document>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={onSelectAll}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedDocuments.has(row.original.id)}
            onCheckedChange={() => onSelectDocument(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select document ${row.original.id}`}
          />
        ),
      },
      {
        accessorKey: "extracted_id",
        header: "Extracted ID",
        cell: ({ row }) => (
          <div className="font-medium font-mono text-sm">
            {row.original.extracted_id || "-"}
          </div>
        ),
      },
      {
        accessorKey: "school_name",
        header: "School Name",
        cell: ({ row }) => row.original.school_name || "-",
      },
      {
        accessorKey: "scores_extraction_status",
        header: "Extraction Status",
        cell: ({ row }) => getStatusBadge(row.original),
        sortingFn: (a, b) => {
          const sa = a.original.scores_extraction_status || "pending";
          const sb = b.original.scores_extraction_status || "pending";
          return sa.localeCompare(sb);
        },
      },
      {
        accessorKey: "scores_extracted_at",
        header: "Extracted At",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.scores_extracted_at
              ? new Date(row.original.scores_extracted_at).toLocaleString()
              : "-"}
          </div>
        ),
      },
      {
        id: "applied",
        accessorFn: (row) => row.scores_applied_at || "",
        header: "Scores",
        cell: ({ row }) =>
          row.original.scores_applied_at ? (
            <Badge className="border-transparent bg-green-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Applied
            </Badge>
          ) : row.original.scores_extraction_status === "success" ? (
            <Badge variant="secondary" className="border-yellow-300 bg-yellow-100 text-yellow-800">
              <Clock className="mr-1 h-3 w-3" />
              Not applied
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
    ],
    [allSelected, onSelectAll, onSelectDocument, selectedDocuments]
  );

  const table = useReactTable({
    data: documents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const doc = row.original;
      const searchValue = String(filterValue).toLowerCase();
      return (
        (doc.extracted_id?.toLowerCase().includes(searchValue) ?? false) ||
        (doc.school_name?.toLowerCase().includes(searchValue) ?? false) ||
        (doc.file_name?.toLowerCase().includes(searchValue) ?? false)
      );
    },
    state: {
      sorting,
      globalFilter,
    },
  });

  const rowClassForStatus = (status: string | null) => {
    if (status === "error") return "bg-red-50/50 hover:bg-red-100/50";
    if (status === "processing") return "bg-blue-50/50 hover:bg-blue-100/50";
    if (status === "queued") return "bg-yellow-50/50 hover:bg-yellow-100/50";
    return "hover:bg-muted/50";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search ID or school..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-8 pl-8 pr-8"
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

          <Select
            value={statusFilter || "all"}
            onValueChange={(value) =>
              onStatusFilterChange(
                value === "all" ? undefined : (value as ExtractionStatusFilter)
              )
            }
          >
            <SelectTrigger className="h-8 w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value, 10))}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="verify-checkbox"
              checked={verifyEnabled}
              onCheckedChange={(checked) => onVerifyEnabledChange(checked === true)}
            />
            <label htmlFor="verify-checkbox" className="cursor-pointer text-sm font-medium">
              Require score = verify
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-without-extracted-id"
              checked={skipWithoutExtractedId}
              onCheckedChange={(checked) => onSkipWithoutExtractedIdChange(checked === true)}
            />
            <label
              htmlFor="skip-without-extracted-id"
              className="cursor-pointer text-sm font-medium"
            >
              Skip without extracted ID
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedDocuments.size > 0 && (
            <Badge variant="secondary" className="border-blue-300 bg-blue-100 text-blue-800">
              <Users className="mr-1 h-3 w-3" />
              {selectedDocuments.size} selected
            </Badge>
          )}
          {isPolling && (
            <Badge variant="outline" className="text-xs">
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              Auto-refreshing
            </Badge>
          )}
          <Button
            onClick={onQueue}
            disabled={selectedDocuments.size === 0 || queuing}
            size="sm"
            className="h-8"
          >
            {queuing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Queueing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Queue{selectedDocuments.size > 0 ? ` ${selectedDocuments.size}` : ""} for Reducto
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm text-muted-foreground">
        <span>
          Showing {documents.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(currentPage * pageSize, total)} of {total} documents
        </span>
        {globalFilter && (
          <span>
            {table.getFilteredRowModel().rows.length} match on this page
          </span>
        )}
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
            <div className="text-sm text-muted-foreground">Loading documents...</div>
          </div>
        ) : (
          <Table containerClassName="sems-table-scroll h-full overflow-auto">
            <TableHeader className="sticky top-0 z-10 bg-background/95 shadow-[inset_0_-1px_0_0_var(--border)] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 [&_tr]:border-b-0">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.id === "select"
                          ? "w-12 bg-transparent"
                          : "bg-transparent"
                      }
                    >
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
                  <TableCell colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-12 w-12 text-muted-foreground/50" />
                      <p className="font-medium">No documents found</p>
                      <p className="text-sm">Try adjusting your filters or search</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const status = row.original.scores_extraction_status;
                  return (
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer ${rowClassForStatus(status)}`}
                      onClick={() => onRowClick(row.original)}
                      data-state={selectedDocuments.has(row.original.id) ? "selected" : undefined}
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
