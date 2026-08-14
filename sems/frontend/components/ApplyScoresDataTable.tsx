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
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Document } from "@/types/document";
import { extractionProviderLabel } from "@/types/document";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TableSkeleton } from "@/components/certificates/TableSkeleton";
import { paperLabel, formatRelativeDate, RelativeTimestamp } from "@/components/data-entry/score-entry-utils";
import { cn } from "@/lib/utils";

export type AppliedView = "ready" | "applied";

interface ApplyScoresDataTableProps {
  documents: Document[];
  loading?: boolean;
  error?: string | null;
  selectedDocuments: Set<number>;
  onSelectDocument: (documentId: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRowClick: (document: Document) => void;
  onApplyRow?: (document: Document) => void;
  applyingDocumentId?: number | null;
  view: AppliedView;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  verifyEnabled: boolean;
  onVerifyEnabledChange: (enabled: boolean) => void;
  applying?: boolean;
  applyProgress?: { done: number; total: number } | null;
  onApplySelected: () => void;
  focusedRowIndex: number;
  onFocusedRowIndexChange: (index: number) => void;
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

function AppliedBadge({ document }: { document: Document }) {
  if (document.scores_applied_at) {
    const appliedAt = new Date(document.scores_applied_at);
    return (
      <div className="space-y-0.5">
        <Badge className="bg-primary text-primary-foreground">
          <CheckCircle2 className="h-3 w-3" />
          Applied
        </Badge>
        <div className="text-xs text-muted-foreground" title={appliedAt.toLocaleString()}>
          {formatRelativeDate(document.scores_applied_at)}
          {document.scores_applied_count != null && ` · ${document.scores_applied_count} scores`}
        </div>
      </div>
    );
  }
  return (
    <Badge variant="secondary">
      <Clock className="h-3 w-3" />
      Ready
    </Badge>
  );
}

export function ApplyScoresDataTable({
  documents,
  loading,
  error,
  selectedDocuments,
  onSelectDocument,
  onSelectAll,
  onClearSelection,
  onRowClick,
  onApplyRow,
  applyingDocumentId,
  view,
  pageSize,
  onPageSizeChange,
  verifyEnabled,
  onVerifyEnabledChange,
  applying,
  applyProgress,
  onApplySelected,
  focusedRowIndex,
  onFocusedRowIndexChange,
  currentPage,
  totalPages,
  total,
  onPageChange,
}: ApplyScoresDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const allSelected = documents.length > 0 && selectedDocuments.size === documents.length;
  const selectedCount = selectedDocuments.size;
  const showActionBar = selectedCount > 0 || !!applying;
  const showInitialSkeleton = loading && documents.length === 0;

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
            {row.original.extracted_id || "—"}
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
        header: "Subject",
        cell: ({ row }) => row.original.subject_name || "—",
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
        id: "provider",
        accessorFn: (row) => row.scores_extraction_provider || "reducto",
        header: "Provider",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {extractionProviderLabel(row.original.scores_extraction_provider || "reducto")}
          </span>
        ),
      },
      {
        accessorKey: "scores_extracted_at",
        header: "Extracted",
        cell: ({ row }) => <RelativeTimestamp iso={row.original.scores_extracted_at} />,
      },
      {
        id: "applied",
        accessorFn: (row) => row.scores_applied_at || "",
        header: "Scores",
        cell: ({ row }) => (
          <div className="space-y-1">
            <AppliedBadge document={row.original} />
            {(row.original.scores_unmatched_count ?? 0) > 0 && (
              <p className="text-xs text-destructive">
                {row.original.scores_unmatched_count} unmatched
              </p>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: "",
        cell: ({ row }) => {
          if (view !== "ready" || !onApplyRow) return null;
          const doc = row.original;
          const isApplying = applyingDocumentId === doc.id;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={isApplying || applying}
                onClick={() => onApplyRow(doc)}
              >
                {isApplying ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3.5 w-3.5" />
                )}
                Apply
              </Button>
            </div>
          );
        },
      },
    ],
    [
      allSelected,
      applying,
      applyingDocumentId,
      onApplyRow,
      onSelectAll,
      onSelectDocument,
      selectedDocuments,
      view,
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
        (doc.file_name?.toLowerCase().includes(searchValue) ?? false)
      );
    },
    state: { sorting, globalFilter },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[260px]">
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
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1">
            {verifyEnabled ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            )}
            <label
              htmlFor="verify-apply-switch"
              className="cursor-pointer text-sm font-medium"
            >
              Require score = verify
            </label>
            <Switch
              id="verify-apply-switch"
              checked={verifyEnabled}
              onCheckedChange={onVerifyEnabledChange}
              disabled={applying}
            />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Showing {documents.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
          {Math.min(currentPage * pageSize, total)} of {total.toLocaleString()}
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
                    <TableCell colSpan={columns.length} className="py-14 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-12 w-12 text-muted-foreground/50" />
                        {view === "ready" ? (
                          <>
                            <p className="font-medium text-foreground">No documents waiting to apply</p>
                            <p className="max-w-sm text-sm">
                              Successful extractions that have not been applied yet will show
                              up here.
                            </p>
                            <Button variant="outline" size="sm" className="mt-2" asChild>
                              <Link href="/scores/data-entry/extraction">
                                Go to Score Extraction
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-foreground">
                              No applied documents for these filters
                            </p>
                            <p className="text-sm">
                              Try a different examination, school, or subject.
                            </p>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row, index) => {
                    const isSelected = selectedDocuments.has(row.original.id);
                    const focused = index === focusedRowIndex;
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "cursor-pointer",
                          isSelected
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-muted/50",
                          focused && "ring-2 ring-inset ring-primary/40"
                        )}
                        onClick={() => {
                          onFocusedRowIndexChange(index);
                          onRowClick(row.original);
                        }}
                        onMouseEnter={() => onFocusedRowIndexChange(index)}
                        data-state={isSelected ? "selected" : undefined}
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
              disabled={currentPage === 1 || applying}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages || applying}
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
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={onClearSelection}
                disabled={applying || selectedCount === 0}
              >
                Clear
              </Button>
              {!verifyEnabled && (
                <p className="text-sm text-destructive">
                  Scores will be written without matching verify
                </p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Keyboard shortcuts">
                    <Keyboard className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Space toggles · Enter opens · A applies
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {applying && applyProgress && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying {applyProgress.done}/{applyProgress.total}…
                </span>
              )}
              <Button
                onClick={onApplySelected}
                disabled={selectedCount === 0 || applying}
                className="h-9 gap-2"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Apply scores to {selectedCount}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
