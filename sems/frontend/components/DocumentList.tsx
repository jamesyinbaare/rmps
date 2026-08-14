"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  downloadDocument,
  getDocumentDownloadFilename,
} from "@/lib/api";
import type { Document } from "@/types/document";
import { File } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FileGrid } from "./FileGrid";
import { FileListItem } from "./FileListItem";

interface DocumentListProps {
  documents: Document[];
  loading?: boolean;
  loadingMore?: boolean;
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  viewMode?: "grid" | "large-grid" | "list" | "large-list";
  onSelect?: (document: Document) => void;
  onDelete?: (document: Document) => void;
  selectedIds?: Set<number>;
  onSelectionChange?: (id: number, selected: boolean) => void;
  bulkMode?: boolean;
  /** Show checkboxes even when not in bulkMode. Row click still opens the document. */
  enableSelection?: boolean;
  focusedRowIndex?: number;
  onRangeSelect?: (id: number) => void;
  onSelectAll?: () => void;
  infiniteScroll?: boolean;
  hasMore?: boolean;
  /** When true, hide the built-in empty state (parent renders its own). */
  hideEmptyState?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DocumentList({
  documents,
  loading = false,
  loadingMore = false,
  currentPage,
  totalPages,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  viewMode = "grid",
  onSelect,
  onDelete,
  selectedIds = new Set(),
  onSelectionChange,
  bulkMode = false,
  enableSelection,
  focusedRowIndex = -1,
  onRangeSelect,
  onSelectAll,
  infiniteScroll = false,
  hasMore = false,
  hideEmptyState = false,
  emptyTitle = "No documents found",
  emptyDescription = "No documents match the current filters.",
}: DocumentListProps) {
  const selectionOn = enableSelection ?? bulkMode;
  const schoolMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const doc of documents) {
      if (doc.school_id && doc.school_name) {
        map.set(doc.school_id, doc.school_name);
      }
    }
    return map;
  }, [documents]);

  const subjectMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const doc of documents) {
      if (doc.subject_id && doc.subject_name) {
        map.set(doc.subject_id, doc.subject_name);
      }
    }
    return map;
  }, [documents]);

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch (error) {
      console.error("Failed to download document:", error);
      alert("Failed to download document. Please try again.");
    }
  };

  if (loading) {
    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-2 gap-4 p-6 xl:grid-cols-7">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-20 w-20 rounded mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="divide-y divide-border px-6 pt-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-3 w-[200px]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    if (hideEmptyState) return null;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <File className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {(viewMode === "grid" || viewMode === "large-grid") ? (
        <FileGrid
          documents={documents}
          onDownload={handleDownload}
          onSelect={onSelect}
          onDelete={onDelete}
          selectedIds={selectedIds}
          onSelectionChange={onSelectionChange}
          bulkMode={bulkMode}
          enableSelection={selectionOn}
          onRangeSelect={onRangeSelect}
          focusedRowIndex={focusedRowIndex}
          size={viewMode === "large-grid" ? "large-grid" : "grid"}
        />
      ) : (
        <div className="divide-y divide-border px-6">
          {selectionOn && onSelectAll && (
            <div className="flex items-center gap-3 py-2 border-b">
              <Checkbox
                checked={documents.length > 0 && selectedIds.size === documents.length}
                onCheckedChange={() => onSelectAll()}
              />
              <span className="text-sm text-muted-foreground">Select all on this page</span>
            </div>
          )}
          {documents.map((doc, index) => (
            <FileListItem
              key={doc.id}
              document={doc}
              onDownload={handleDownload}
              onSelect={onSelect}
              onDelete={onDelete}
              schoolName={
                doc.school_name ||
                (doc.school_id ? schoolMap.get(doc.school_id) : undefined) ||
                undefined
              }
              subjectName={
                doc.subject_name ||
                (doc.subject_id ? subjectMap.get(doc.subject_id) : undefined) ||
                undefined
              }
              isSelected={selectedIds.has(doc.id)}
              onSelectionChange={onSelectionChange}
              onRangeSelect={onRangeSelect}
              enableSelection={selectionOn}
              focused={index === focusedRowIndex}
              size={viewMode === "large-list" ? "large-list" : "list"}
            />
          ))}
        </div>
      )}

      {infiniteScroll ? (
        <div className="px-6 py-4">
          <div id="infinite-scroll-sentinel" className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-8 w-32" />
            </div>
          )}
          {!hasMore && documents.length > 0 && (
            <p className="text-center text-sm text-muted-foreground py-2">
              End of loaded window
            </p>
          )}
        </div>
      ) : (
        (totalPages > 1 || !!onPageSizeChange) && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
            <div className="flex items-center gap-2">
              {onPageSizeChange && (
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => onPageSizeChange(parseInt(v, 10))}
                >
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[20, 30, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
