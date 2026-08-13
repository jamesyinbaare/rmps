"use client";

import { useEffect, useMemo, useState } from "react";
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
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Users,
  X,
  XCircle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ExtractionStatusFilter =
  | "pending"
  | "queued"
  | "processing"
  | "success"
  | "error";

export const EXTRACTION_STATUS_OPTIONS: Array<{
  value: ExtractionStatusFilter;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
];

export function parseExtractionStatuses(
  value?: string | null
): ExtractionStatusFilter[] {
  if (!value) return [];
  const allowed = new Set(EXTRACTION_STATUS_OPTIONS.map((o) => o.value));
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ExtractionStatusFilter => allowed.has(s as ExtractionStatusFilter));
}

export function formatExtractionStatuses(
  statuses: ExtractionStatusFilter[]
): string | undefined {
  if (statuses.length === 0) return undefined;
  return statuses.join(",");
}

export type BatchProgress = {
  total: number;
  done: number;
  failed: number;
  processing: number;
  queued: number;
};

interface ReductoDocumentsDataTableProps {
  documents: Document[];
  loading?: boolean;
  error?: string | null;
  selectedDocuments: Set<number>;
  onSelectDocument: (documentId: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRowClick: (document: Document) => void;
  onPreview: (document: Document) => void;
  onRequeue: (document: Document) => void;
  onApply?: (document: Document) => void;
  applyingDocumentId?: number | null;
  requeueingDocumentId?: number | null;
  statusFilter?: string;
  onStatusFilterChange: (statuses: ExtractionStatusFilter[]) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  skipWithoutExtractedId: boolean;
  onSkipWithoutExtractedIdChange: (enabled: boolean) => void;
  concurrentWorkers: number;
  workersMax: number;
  rateLimitPerSecond: number;
  onConcurrentWorkersChange: (workers: number) => void;
  updatingWorkers?: boolean;
  queuing?: boolean;
  isPolling?: boolean;
  batchProgress?: BatchProgress | null;
  skipPreview?: { willQueue: number; willSkip: number } | null;
  onQueueSelected: () => void;
  onQueueAllPending: () => void;
  queueAllPendingDisabled?: boolean;
  focusedRowIndex: number;
  onFocusedRowIndexChange: (index: number) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  emptyActionHref?: string;
  emptyActionLabel?: string;
}

function getStatusBadge(document: Document) {
  const status = document.scores_extraction_status;
  const methods = document.scores_extraction_methods;
  const methodDisplay = methods && methods.length > 0 ? methods.join(", ") : null;

  if (status === "queued") {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
        <Clock className="mr-1 h-3 w-3" />
        Queued
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge className="bg-blue-600 text-white">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-green-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Success
            </Badge>
          </TooltipTrigger>
          {methodDisplay && (
            <TooltipContent>
              <p>{methodDisplay}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="border-yellow-300 bg-yellow-100 text-yellow-800">
      <Clock className="mr-1 h-3 w-3" />
      Pending
    </Badge>
  );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
}

export function ReductoDocumentsDataTable({
  documents,
  loading,
  error,
  selectedDocuments,
  onSelectDocument,
  onSelectAll,
  onClearSelection,
  onRowClick,
  onPreview,
  onRequeue,
  onApply,
  applyingDocumentId,
  requeueingDocumentId,
  statusFilter,
  onStatusFilterChange,
  pageSize,
  onPageSizeChange,
  skipWithoutExtractedId,
  onSkipWithoutExtractedIdChange,
  concurrentWorkers,
  workersMax,
  rateLimitPerSecond,
  onConcurrentWorkersChange,
  updatingWorkers,
  queuing,
  isPolling,
  batchProgress,
  skipPreview,
  onQueueSelected,
  onQueueAllPending,
  queueAllPendingDisabled,
  focusedRowIndex,
  onFocusedRowIndexChange,
  currentPage,
  totalPages,
  total,
  onPageChange,
  emptyActionHref,
  emptyActionLabel,
}: ReductoDocumentsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const allSelected = documents.length > 0 && selectedDocuments.size === documents.length;
  const pendingOnPage = documents.filter(
    (d) => !d.scores_extraction_status || d.scores_extraction_status === "pending"
  ).length;
  const selectedStatuses = parseExtractionStatuses(statusFilter);

  const toggleStatus = (status: ExtractionStatusFilter) => {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status];
    onStatusFilterChange(next);
  };

  const statusTriggerLabel =
    selectedStatuses.length === 0
      ? "All statuses"
      : selectedStatuses.length === 1
        ? EXTRACTION_STATUS_OPTIONS.find((o) => o.value === selectedStatuses[0])?.label ||
          selectedStatuses[0]
        : `${selectedStatuses.length} statuses`;

  useEffect(() => {
    if (documents.length === 0) {
      onFocusedRowIndexChange(-1);
      return;
    }
    if (focusedRowIndex < 0 || focusedRowIndex >= documents.length) {
      onFocusedRowIndexChange(0);
    }
  }, [documents, focusedRowIndex, onFocusedRowIndexChange]);

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
          <div className="font-mono text-sm font-medium">
            {row.original.extracted_id || (
              <span className="text-muted-foreground">No ID</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "school_name",
        header: "School",
        cell: ({ row }) => row.original.school_name || "-",
      },
      {
        accessorKey: "scores_extraction_status",
        header: "Status",
        cell: ({ row }) => (
          <div className="space-y-1">
            {getStatusBadge(row.original)}
            {row.original.scores_extraction_status === "error" && (
              <p className="text-xs text-destructive">Extraction failed · retry</p>
            )}
          </div>
        ),
        sortingFn: (a, b) => {
          const sa = a.original.scores_extraction_status || "pending";
          const sb = b.original.scores_extraction_status || "pending";
          return sa.localeCompare(sb);
        },
      },
      {
        accessorKey: "scores_extracted_at",
        header: "Extracted",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.scores_extracted_at
              ? new Date(row.original.scores_extracted_at).toLocaleString()
              : "—"}
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
      {
        id: "actions",
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const doc = row.original;
          const status = doc.scores_extraction_status;
          const canPreview = status === "success";
          const canRequeue =
            status === "pending" || status === "error" || status === "success";
          const canApply = status === "success" && !!onApply;

          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={!canPreview}
                onClick={() => onPreview(doc)}
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={!canRequeue || requeueingDocumentId === doc.id || queuing}
                onClick={() => onRequeue(doc)}
                title={status === "error" ? "Retry" : "Queue"}
              >
                {requeueingDocumentId === doc.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : status === "error" ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
              {canApply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  disabled={applyingDocumentId === doc.id}
                  onClick={() => onApply?.(doc)}
                  title="Apply scores"
                >
                  {applyingDocumentId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [
      allSelected,
      applyingDocumentId,
      onApply,
      onPreview,
      onRequeue,
      onSelectAll,
      onSelectDocument,
      queuing,
      requeueingDocumentId,
      selectedDocuments,
    ]
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 min-w-[150px] justify-between gap-2">
                <span className="truncate">{statusTriggerLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {EXTRACTION_STATUS_OPTIONS.map((option) => {
                const checked = selectedStatuses.includes(option.value);
                const id = `status-filter-${option.value}`;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    className="gap-2"
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleStatus(option.value);
                    }}
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={() => toggleStatus(option.value)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={option.label}
                    />
                    <label htmlFor={id} className="flex-1 cursor-pointer">
                      {option.label}
                    </label>
                  </DropdownMenuItem>
                );
              })}
              {selectedStatuses.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onStatusFilterChange([])}>
                    Clear status filter
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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
              </SelectContent>
            </Select>
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
              Skip without ID
            </label>
          </div>

          <div className="flex items-center gap-2" title={`API rate limited to ${rateLimitPerSecond}/s`}>
            <span className="text-sm text-muted-foreground whitespace-nowrap">At a time</span>
            <Select
              value={String(concurrentWorkers)}
              onValueChange={(value) => onConcurrentWorkersChange(parseInt(value, 10))}
              disabled={updatingWorkers || queuing}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  new Set([
                    ...Array.from({ length: Math.min(workersMax, 20) }, (_, i) => i + 1),
                    concurrentWorkers,
                  ])
                )
                  .filter((n) => n >= 1 && n <= workersMax)
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {updatingWorkers && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {batchProgress && batchProgress.total > 0 && (
            <Badge variant="outline" className="gap-1 text-xs">
              {isPolling && <RefreshCw className="h-3 w-3 animate-spin" />}
              {batchProgress.done}/{batchProgress.total} done
              {batchProgress.processing > 0 && ` · ${batchProgress.processing} processing`}
              {batchProgress.queued > 0 && ` · ${batchProgress.queued} queued`}
              {batchProgress.failed > 0 && ` · ${batchProgress.failed} failed`}
            </Badge>
          )}
          {!batchProgress && isPolling && (
            <Badge variant="outline" className="text-xs">
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              Auto-refreshing
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onQueueAllPending}
            disabled={queueAllPendingDisabled || queuing}
          >
            {queuing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Queue all pending
            {pendingOnPage > 0 ? ` (${pendingOnPage}+)` : ""}
          </Button>
          <Button
            onClick={onQueueSelected}
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
                Queue{selectedDocuments.size > 0 ? ` ${selectedDocuments.size}` : ""}
              </>
            )}
          </Button>
        </div>
      </div>

      {skipPreview && selectedDocuments.size > 0 && (
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          Will queue{" "}
          <span className="font-medium text-foreground">{skipPreview.willQueue}</span>
          {skipWithoutExtractedId && skipPreview.willSkip > 0 && (
            <>
              {" "}
              · skip{" "}
              <span className="font-medium text-amber-700">{skipPreview.willSkip}</span> (no
              extracted ID)
            </>
          )}
        </div>
      )}

      {selectedDocuments.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-blue-900">
            <Users className="h-4 w-4" />
            <span className="font-medium">{selectedDocuments.size} selected</span>
            <span className="text-blue-700/80">· Space toggles · Enter opens · Q queues</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7" onClick={onClearSelection}>
              Clear
            </Button>
            <Button size="sm" className="h-7" onClick={onQueueSelected} disabled={queuing}>
              Queue selection
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm text-muted-foreground">
        <span>
          Showing {documents.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(currentPage * pageSize, total)} of {total} documents
        </span>
        {globalFilter && (
          <span>{table.getFilteredRowModel().rows.length} match on this page</span>
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
                      className={header.id === "select" ? "w-12 bg-transparent" : "bg-transparent"}
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
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="h-12 w-12 text-muted-foreground/50" />
                      <div>
                        <p className="font-medium text-foreground">No documents found</p>
                        <p className="mt-1 text-sm">
                        {selectedStatuses.includes("pending") && selectedStatuses.length === 1
                          ? "No pending sheets for these filters."
                          : "Try adjusting filters or status."}
                      </p>
                      </div>
                      {emptyActionHref && emptyActionLabel && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={emptyActionHref}>{emptyActionLabel}</a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row, index) => {
                  const status = row.original.scores_extraction_status;
                  const focused = index === focusedRowIndex;
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "cursor-pointer",
                        rowClassForStatus(status),
                        focused && "ring-2 ring-inset ring-primary/40"
                      )}
                      onClick={() => {
                        onFocusedRowIndexChange(index);
                        onRowClick(row.original);
                      }}
                      onMouseEnter={() => onFocusedRowIndexChange(index)}
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
