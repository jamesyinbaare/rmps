"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  Clock,
  FileText,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Search,
  Send,
  X,
  XCircle,
  ListMinus,
} from "lucide-react";
import type { Document, DocumentScoreExtraction, ExtractionProvider } from "@/types/document";
import {
  DEFAULT_EXTRACTION_PROVIDER,
  extractionFor,
  extractionProviderLabel,
  extractionProviderShortLabel,
} from "@/types/document";
import { ExtractionApplyBadge } from "@/components/data-entry/ExtractionAppliedBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TableSkeleton } from "@/components/certificates/TableSkeleton";
import { QueueSettingsPopover } from "@/components/data-entry/QueueSettingsPopover";
import { paperLabel, RelativeTimestamp } from "@/components/data-entry/score-entry-utils";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  requeueingDocumentId?: number | null;
  statusFilter?: string;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  skipWithoutExtractedId: boolean;
  onSkipWithoutExtractedIdChange: (enabled: boolean) => void;
  extractionProvider: ExtractionProvider;
  onExtractionProviderChange: (provider: ExtractionProvider) => void;
  concurrentWorkers: number;
  workersMax: number;
  rateLimitPerSecond: number;
  onConcurrentWorkersChange: (workers: number) => void;
  updatingWorkers?: boolean;
  queuing?: boolean;
  skipPreview?: { willQueue: number; willSkip: number } | null;
  onQueueSelected: () => void;
  onDequeueSelected?: () => void;
  onQueueAllPending: () => void;
  queueAllPendingDisabled?: boolean;
  pendingReadyCount?: number;
  queueable?: boolean;
  dequeuing?: boolean;
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
      <Badge variant="outline" className="bg-muted text-foreground">
        <Clock className="h-3 w-3" />
        Queued
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge className="bg-muted text-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-primary text-primary-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Success
          </Badge>
        </TooltipTrigger>
        {methodDisplay && (
          <TooltipContent>
            <p>{methodDisplay}</p>
          </TooltipContent>
        )}
      </Tooltip>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

function providerRow(document: Document, provider: ExtractionProvider): DocumentScoreExtraction | undefined {
  return extractionFor(document, provider);
}

function providerQueueStatus(
  document: Document,
  provider: ExtractionProvider
): string | null {
  const row = providerRow(document, provider);
  if (row?.status) return row.status;
  if ((document.extractions ?? []).length > 0) return null;
  return document.scores_extraction_status;
}

function ExtractionStatusCell({ document }: { document: Document }) {
  const rows = [...(document.extractions ?? [])].sort((a, b) => {
    if (a.provider === DEFAULT_EXTRACTION_PROVIDER) return -1;
    if (b.provider === DEFAULT_EXTRACTION_PROVIDER) return 1;
    return a.provider.localeCompare(b.provider);
  });
  if (rows.length === 0) {
    return getStatusBadge(document);
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {rows.map((row) =>
        row.status === "success" ? (
          <ExtractionApplyBadge key={row.provider} row={row} showProvider compact />
        ) : (
          <div key={row.provider} className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-xs text-muted-foreground">
              {extractionProviderShortLabel(row.provider)}
            </span>
            {getStatusBadge({ ...document, scores_extraction_status: row.status })}
          </div>
        )
      )}
    </div>
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
  requeueingDocumentId,
  statusFilter,
  pageSize,
  onPageSizeChange,
  skipWithoutExtractedId,
  onSkipWithoutExtractedIdChange,
  extractionProvider,
  onExtractionProviderChange,
  concurrentWorkers,
  workersMax,
  rateLimitPerSecond,
  onConcurrentWorkersChange,
  updatingWorkers,
  queuing,
  skipPreview,
  onQueueSelected,
  onDequeueSelected,
  onQueueAllPending,
  queueAllPendingDisabled,
  pendingReadyCount = 0,
  queueable = true,
  dequeuing = false,
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
  const [confirmQueueAllOpen, setConfirmQueueAllOpen] = useState(false);

  const allSelected = documents.length > 0 && selectedDocuments.size === documents.length;
  const pendingOnPage = documents.filter(
    (d) => !d.scores_extraction_status || d.scores_extraction_status === "pending"
  ).length;
  const selectedStatuses = parseExtractionStatuses(statusFilter);
  const selectedCount = selectedDocuments.size;
  const busy = !!queuing || dequeuing;
  const selectedQueuedCount = documents.filter(
    (d) =>
      selectedDocuments.has(d.id) && providerQueueStatus(d, extractionProvider) === "queued"
  ).length;
  const selectedProcessingCount = documents.filter(
    (d) =>
      selectedDocuments.has(d.id) &&
      providerQueueStatus(d, extractionProvider) === "processing"
  ).length;
  const showDequeue = queueable && selectedQueuedCount + selectedProcessingCount > 0;
  const showActionBar = queueable && (selectedCount > 0 || busy);

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
            disabled={!queueable}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedDocuments.has(row.original.id)}
            onCheckedChange={() => onSelectDocument(row.original.id)}
            disabled={!queueable}
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
        cell: ({ row }) => row.original.school_name || "—",
      },
      {
        accessorKey: "subject_name",
        accessorFn: (row) => `${row.subject_code ?? ""} ${row.subject_name ?? ""}`.trim(),
        header: "Subject",
        cell: ({ row }) => {
          const code = row.original.subject_code;
          const name = row.original.subject_name;
          if (!code && !name) return "—";
          return (
            <div className="min-w-0">
              <div className="font-mono text-sm font-medium">{code || "—"}</div>
              {name ? (
                <div className="truncate text-xs text-muted-foreground">{name}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "test_type",
        header: "Paper",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {paperLabel(row.original.test_type)}
          </span>
        ),
      },
      {
        id: "extraction",
        accessorFn: (row) =>
          (row.extractions ?? [])
            .map((e) => `${e.provider} ${e.status}`)
            .join(" ") || row.scores_extraction_status || "",
        header: "Extraction",
        cell: ({ row }) => <ExtractionStatusCell document={row.original} />,
      },
      {
        accessorKey: "scores_extracted_at",
        header: "Extracted",
        cell: ({ row }) => <RelativeTimestamp iso={row.original.scores_extracted_at} />,
      },
      {
        id: "actions",
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const doc = row.original;
          const queuedProvider = providerRow(doc, extractionProvider);
          const anySuccess =
            (doc.extractions ?? []).some((e) => e.status === "success") ||
            doc.scores_extraction_status === "success";
          const status = queuedProvider?.status || doc.scores_extraction_status;
          const canPreview = anySuccess;
          const canRequeue =
            status === "pending" ||
            status === "queued" ||
            status === "processing" ||
            status === "error" ||
            status === "success" ||
            !queuedProvider;
          const requeueLabel = status === "error" ? "Retry" : "Queue";

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    aria-label="Row actions"
                  >
                    {requeueingDocumentId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={!canPreview}
                    onSelect={() => onPreview(doc)}
                  >
                    Preview extraction
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canRequeue || requeueingDocumentId === doc.id || busy}
                    onSelect={() => onRequeue(doc)}
                  >
                    {requeueLabel}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [
      allSelected,
      onPreview,
      onRequeue,
      onSelectAll,
      onSelectDocument,
      queuing,
      dequeuing,
      queueable,
      requeueingDocumentId,
      selectedDocuments,
      extractionProvider,
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
        (doc.subject_name?.toLowerCase().includes(searchValue) ?? false) ||
        (doc.subject_code?.toLowerCase().includes(searchValue) ?? false) ||
        (doc.file_name?.toLowerCase().includes(searchValue) ?? false)
      );
    },
    state: {
      sorting,
      globalFilter,
    },
  });

  const rowClassForStatus = (status: string | null) => {
    if (status === "error") return "bg-destructive/5 hover:bg-destructive/10";
    if (status === "processing") return "bg-muted/60 hover:bg-muted";
    if (status === "queued") return "bg-muted/40 hover:bg-muted/70";
    return "hover:bg-muted/50";
  };

  const showInitialSkeleton = loading && documents.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search ID, school, or subject..."
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

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value, 10))}
            >
              <SelectTrigger size="sm" className="h-8 w-[90px]">
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

          <QueueSettingsPopover
            extractionProvider={extractionProvider}
            onExtractionProviderChange={onExtractionProviderChange}
            skipWithoutExtractedId={skipWithoutExtractedId}
            onSkipWithoutExtractedIdChange={onSkipWithoutExtractedIdChange}
            concurrentWorkers={concurrentWorkers}
            workersMax={workersMax}
            rateLimitPerSecond={rateLimitPerSecond}
            onConcurrentWorkersChange={onConcurrentWorkersChange}
            updatingWorkers={updatingWorkers}
            disabled={queuing || dequeuing}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {documents.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
            {Math.min(currentPage * pageSize, total)} of {total.toLocaleString()}
            {globalFilter ? ` · ${table.getFilteredRowModel().rows.length} match on this page` : ""}
          </span>
          {queueable && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setConfirmQueueAllOpen(true)}
            disabled={queueAllPendingDisabled || busy}
          >
            {queuing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Queue all pending · {extractionProviderLabel(extractionProvider)}
            {pendingReadyCount > 0
              ? ` (${pendingReadyCount.toLocaleString()})`
              : pendingOnPage > 0
                ? ` (${pendingOnPage}+)`
                : ""}
          </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-4 mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className={cn("relative min-h-0 flex-1 overflow-hidden", showActionBar && "pb-2")}>
        {showInitialSkeleton ? (
          <TableSkeleton rows={10} cols={7} className="h-full rounded-none border-0" />
        ) : (
          <>
            {loading && documents.length > 0 && (
              <div className="pointer-events-none absolute inset-0 z-10 bg-background/40" />
            )}
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
                            <Link href={emptyActionHref}>{emptyActionLabel}</Link>
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
          </>
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

      {showActionBar && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {selectedCount} document{selectedCount === 1 ? "" : "s"} selected
              </span>
              {skipPreview && selectedCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  will queue{" "}
                  <span className="font-medium text-foreground">{skipPreview.willQueue}</span>
                  {skipWithoutExtractedId && skipPreview.willSkip > 0 && (
                    <>
                      {" "}
                      · skip{" "}
                      <span className="font-medium text-secondary-foreground">
                        {skipPreview.willSkip}
                      </span>{" "}
                      (no ID)
                    </>
                  )}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={onClearSelection}
                disabled={busy || selectedCount === 0}
              >
                Clear
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Keyboard shortcuts">
                    <Keyboard className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Space toggles · Enter opens · Q queues
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showDequeue && onDequeueSelected && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2"
                  onClick={onDequeueSelected}
                  disabled={busy}
                >
                  {dequeuing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ListMinus className="h-4 w-4" />
                  )}
                  Remove from queue
                  {selectedQueuedCount > 0 ? ` (${selectedQueuedCount})` : ""}
                </Button>
              )}
              <Button
                onClick={onQueueSelected}
                disabled={selectedCount === 0 || busy}
                size="sm"
                className="h-9 gap-2"
              >
                {queuing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Queueing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Queue{selectedCount > 0 ? ` ${selectedCount}` : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmQueueAllOpen} onOpenChange={setConfirmQueueAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Queue {pendingReadyCount.toLocaleString()} pending document
              {pendingReadyCount === 1 ? "" : "s"} for {extractionProviderLabel(extractionProvider)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sheets that need an ID are not included. Cancel leaves the queue unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || pendingReadyCount === 0}
              onClick={() => {
                setConfirmQueueAllOpen(false);
                onQueueAllPending();
              }}
            >
              Queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
