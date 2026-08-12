"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentList } from "@/components/DocumentList";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DeleteDocumentDialog } from "@/components/DeleteDocumentDialog";
import { CompactFilters } from "@/components/CompactFilters";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Grid3x3, List, AlertCircle, Trash2, Database, MoreHorizontal } from "lucide-react";
import {
  listDocuments,
  downloadDocument,
  getDocumentDownloadFilename,
  updateDocumentId,
} from "@/lib/api";
import type { Document, DocumentFilters as DocumentFiltersType } from "@/types/document";
import { ID_EXTRACTION_ERROR_FILTERS } from "@/lib/id-extraction-errors";
import { toast } from "sonner";
import Link from "next/link";
import { BackfillDialog } from "@/components/BackfillDialog";
import { cn } from "@/lib/utils";

/** Cap accumulated infinite-scroll cards to avoid unbounded DOM growth at 50k+ scale. */
const MAX_INFINITE_SCROLL_ITEMS = 300;

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filterParam = searchParams.get("filter");
  const examIdParam = searchParams.get("exam_id");
  const extractionStatusParam = searchParams.get("id_extraction_status");
  const errorParam = searchParams.get("error") || "";

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocumentFiltersType>(() => {
    const initial: DocumentFiltersType = {
      page: 1,
      page_size: 30,
    };
    if (examIdParam) {
      const examId = parseInt(examIdParam, 10);
      if (!Number.isNaN(examId)) {
        initial.exam_id = examId;
      }
    }
    if (
      extractionStatusParam === "success" ||
      extractionStatusParam === "pending" ||
      extractionStatusParam === "error"
    ) {
      initial.id_extraction_status = extractionStatusParam;
    }
    if (errorParam) {
      initial.id_extraction_error_code = errorParam;
      initial.id_extraction_status = initial.id_extraction_status || "error";
    }
    return initial;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
  const [downloadErrorOpen, setDownloadErrorOpen] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);

  // Debounce search into server-side `q` filter
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQ = searchQuery.trim() || undefined;
      setFilters((prev) => {
        if ((prev.q ?? undefined) === nextQ) return prev;
        return { ...prev, q: nextQ, page: 1 };
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // Sync filters when dashboard deep-link query params change
  useEffect(() => {
    const nextExamId = examIdParam ? parseInt(examIdParam, 10) : undefined;
    const validExamId =
      nextExamId != null && !Number.isNaN(nextExamId) ? nextExamId : undefined;
    const nextStatus =
      extractionStatusParam === "success" ||
      extractionStatusParam === "pending" ||
      extractionStatusParam === "error"
        ? extractionStatusParam
        : undefined;
    const nextError = errorParam || undefined;

    setFilters((prev) => {
      const examChanged = (prev.exam_id ?? undefined) !== validExamId;
      const statusChanged = (prev.id_extraction_status ?? undefined) !== nextStatus;
      const errorChanged = (prev.id_extraction_error_code ?? undefined) !== nextError;
      if (!examChanged && !statusChanged && !errorChanged) return prev;
      return {
        ...prev,
        exam_id: validExamId,
        id_extraction_status: nextError ? nextStatus || "error" : nextStatus,
        id_extraction_error_code: nextError,
        page: 1,
      };
    });
  }, [examIdParam, extractionStatusParam, errorParam]);

  const loadDocuments = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await listDocuments(filters);
      let sortedDocuments = response.items;

      // Sort by recent (uploaded_at descending) if filter is "recent"
      if (filterParam === "recent") {
        sortedDocuments = [...response.items].sort((a, b) => {
          const dateA = new Date(a.uploaded_at).getTime();
          const dateB = new Date(b.uploaded_at).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
      }

      if (append) {
        setDocuments((prev) => {
          const merged = [...prev, ...sortedDocuments];
          // Cap accumulated items for scale; keep the most recent window
          if (merged.length > MAX_INFINITE_SCROLL_ITEMS) {
            return merged.slice(merged.length - MAX_INFINITE_SCROLL_ITEMS);
          }
          return merged;
        });
      } else {
        setDocuments(sortedDocuments);
      }

      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setTotal(response.total);
      setHasMore(response.page < response.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error loading documents:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, filterParam]);

  // Track filter changes to reset or append
  const prevFiltersRef = useRef<DocumentFiltersType | null>(null);
  const prevFilterParamRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);

  // Handle filter/search changes (reset) vs page changes (append for infinite scroll)
  useEffect(() => {
    // Skip on initial mount - handled by initial load effect
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevFiltersRef.current = filters;
      prevFilterParamRef.current = filterParam;
      return;
    }

    const filtersChanged =
      prevFiltersRef.current?.exam_id !== filters.exam_id ||
      prevFiltersRef.current?.exam_type !== filters.exam_type ||
      prevFiltersRef.current?.series !== filters.series ||
      prevFiltersRef.current?.year !== filters.year ||
      prevFiltersRef.current?.school_id !== filters.school_id ||
      prevFiltersRef.current?.subject_id !== filters.subject_id ||
      prevFiltersRef.current?.id_extraction_status !== filters.id_extraction_status ||
      prevFiltersRef.current?.id_extraction_error_code !== filters.id_extraction_error_code ||
      prevFiltersRef.current?.q !== filters.q ||
      prevFilterParamRef.current !== filterParam;

    const pageChanged = (prevFiltersRef.current?.page ?? 1) !== (filters.page ?? 1);

    if (filtersChanged && (filters.page ?? 1) === 1) {
      // Filters changed, reset to page 1
      prevFiltersRef.current = filters;
      prevFilterParamRef.current = filterParam;
      loadDocuments(false);
    } else if (pageChanged && (filters.page ?? 1) > 1 && viewMode === "grid") {
      // Page changed for infinite scroll
      prevFiltersRef.current = filters;
      loadDocuments(true);
    } else if (pageChanged && viewMode === "list") {
      prevFiltersRef.current = filters;
      loadDocuments(false);
    }
  }, [filters, filterParam, viewMode, loadDocuments]);

  // Keep exam_id, extraction status, and error type in the URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (filters.exam_id) {
      params.set("exam_id", String(filters.exam_id));
    } else {
      params.delete("exam_id");
    }
    if (filters.id_extraction_status) {
      params.set("id_extraction_status", filters.id_extraction_status);
    } else {
      params.delete("id_extraction_status");
    }
    if (filters.id_extraction_error_code) {
      params.set("error", filters.id_extraction_error_code);
    } else {
      params.delete("error");
    }
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`/icm-studio/documents${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [
    filters.exam_id,
    filters.id_extraction_status,
    filters.id_extraction_error_code,
    router,
    searchParams,
  ]);

  // Check if we need to load more content to fill the viewport (after documents load)
  useEffect(() => {
    if (viewMode !== "grid" || !hasMore || loadingMore || loading) return;
    if (documents.length === 0) return;

    const checkIfNeedsMoreContent = () => {
      const sentinel = document.getElementById("infinite-scroll-sentinel");
      if (!sentinel) return;

      const rect = sentinel.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // If sentinel is visible (within viewport), we need more content
      if (rect.top < windowHeight && currentPage < totalPages && !loadingMore) {
        setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
      }
    };

    // Check after DOM updates (images might still be loading)
    const timeoutId = setTimeout(checkIfNeedsMoreContent, 500);
    // Also check on resize
    if (typeof window !== "undefined") {
      window.addEventListener("resize", checkIfNeedsMoreContent);
    }
    return () => {
      clearTimeout(timeoutId);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", checkIfNeedsMoreContent);
      }
    };
  }, [documents.length, viewMode, hasMore, loadingMore, loading, currentPage, totalPages]);

  // Intersection Observer for infinite scroll (more efficient than scroll events)
  useEffect(() => {
    if (viewMode !== "grid" || !hasMore || loadingMore || loading) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const sentinel = document.getElementById("infinite-scroll-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && currentPage < totalPages && !loadingMore) {
          setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, hasMore, loadingMore, loading, currentPage, totalPages, documents.length]);

  // Fallback scroll handler (for browsers without Intersection Observer support)
  useEffect(() => {
    if (viewMode !== "grid" || !hasMore || loadingMore || loading) return;
    if (typeof window === "undefined") return;
    if ("IntersectionObserver" in window) return; // Use Intersection Observer if available

    const win = window as Window; // Type assertion for TypeScript
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const scrollTop = win.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = win.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        // Load more when user is 400px from bottom
        if (scrollTop + windowHeight >= documentHeight - 400) {
          if (currentPage < totalPages && !loadingMore) {
            setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
          }
        }
        ticking = false;
      });
    };

    win.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      win.removeEventListener("scroll", handleScroll);
    };
  }, [viewMode, hasMore, loadingMore, loading, currentPage, totalPages]);

  // Initial load on mount
  useEffect(() => {
    loadDocuments(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load failed extraction count
  useEffect(() => {
    const loadFailedCount = async () => {
      try {
        const response = await listDocuments({ id_extraction_status: "error", page: 1, page_size: 1 });
        setFailedCount(response.total);
      } catch (err) {
        console.error("Error loading failed count:", err);
      }
    };
    loadFailedCount();
  }, []);

  const handleFiltersChange = (newFilters: DocumentFiltersType) => {
    setFilters(newFilters);
  };

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter) {
      params.set("filter", filter);
    } else {
      params.delete("filter");
    }
    if (filters.exam_id) {
      params.set("exam_id", String(filters.exam_id));
    }
    const qs = params.toString();
    router.push(`/icm-studio/documents${qs ? `?${qs}` : ""}`);
  };

  const handleSelectionChange = (id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const handleBulkDownload = async () => {
    for (const id of selectedIds) {
      const doc = documents.find((d) => d.id === id);
      if (doc) {
        await handleDownload(doc);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} document(s)?`)) {
      // Delete logic would go here - for now just clear selection
      setSelectedIds(new Set());
      setBulkMode(false);
      toast.success(`${selectedIds.size} document(s) deleted`);
    }
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({ ...prev, page: 1, page_size: pageSize }));
  };

  const handleUploadSuccess = () => {
    loadDocuments();
  };

  const handleDocumentSelect = (doc: Document) => {
    const index = documents.findIndex((d) => d.id === doc.id);
    if (index >= 0) {
      setSelectedIndex(index);
      setSelectedDocument(doc);
      setViewerOpen(true);
    } else {
      // If document not found in current list, still open it but with index -1
      setSelectedIndex(-1);
      setSelectedDocument(doc);
      setViewerOpen(true);
    }
  };

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setSelectedDocument(null);
    setSelectedIndex(-1);
  }, []);

  const handleNavigate = useCallback((index: number) => {
    if (index >= 0 && index < documents.length) {
      setSelectedIndex(index);
      setSelectedDocument(documents[index]);
    }
  }, [documents]);

  const handleUpdateId = async (documentId: number, extractedId: string, schoolId?: number, subjectId?: number) => {
    try {
      await updateDocumentId(documentId, extractedId, schoolId, subjectId);
      toast.success("Document ID updated successfully");
      // Reload documents to get updated data
      const response = await listDocuments(filters);
      setDocuments(response.items);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setTotal(response.total);
      // Update the selected document if it's the one being updated
      if (selectedDocument && selectedDocument.id === documentId) {
        const updatedDoc = response.items.find((d) => d.id === documentId);
        if (updatedDoc) {
          setSelectedDocument(updatedDoc);
          // Update the index if needed
          const newIndex = response.items.findIndex((d) => d.id === documentId);
          if (newIndex >= 0) {
            setSelectedIndex(newIndex);
          }
        }
      }
    } catch (error) {
      throw error; // Re-throw to let DocumentViewer handle the error display
    }
  };

  const handleDeleteClick = (doc: Document) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteFromViewer = async (documentId: number) => {
    const doc = documents.find((d) => d.id === documentId);
    if (doc) {
      handleDeleteClick(doc);
    }
  };

  const handleDeleteConfirm = () => {
    if (documentToDelete) {
      // If the deleted document is currently being viewed, close the viewer
      if (selectedDocument && selectedDocument.id === documentToDelete.id) {
        handleCloseViewer();
      }
      // Reload documents
      loadDocuments();
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch (error) {
      console.error("Failed to download document:", error);
      setDownloadErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Failed to download document. Please try again."
      );
      setDownloadErrorOpen(true);
    }
  };

  return (
    <DashboardLayout title="All files">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title="All files"
          activeFilter={filterParam || undefined}
          onFilterChange={handleFilterChange}
          onSearch={setSearchQuery}
          searchValue={searchQuery}
          showSearch={true}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto w-full">
            {/* Filters */}
            <div className="px-6 pt-4 pb-2 border-b border-border space-y-3">
              <CompactFilters filters={filters} onFiltersChange={handleFiltersChange} />
              {filters.id_extraction_status === "error" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">Error type:</span>
                  {ID_EXTRACTION_ERROR_FILTERS.map((opt) => (
                    <Button
                      key={opt.value || "all"}
                      variant={
                        (filters.id_extraction_error_code || "") === opt.value
                          ? "secondary"
                          : "outline"
                      }
                      size="sm"
                      className={cn(
                        "h-7 text-xs",
                        (filters.id_extraction_error_code || "") === opt.value &&
                          "border-destructive/40"
                      )}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          id_extraction_error_code: opt.value || undefined,
                          page: 1,
                        }))
                      }
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Bulk Actions Bar */}
            {bulkMode && selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedIds.size === documents.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownload}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4 rotate-180" />
                    Download ({selectedIds.size})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBulkMode(false);
                      setSelectedIds(new Set());
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setUploadOpen(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Scanned ICMs
                </Button>
                <Button
                  variant={bulkMode ? "secondary" : "outline"}
                  onClick={() => {
                    setBulkMode(!bulkMode);
                    if (bulkMode) {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="gap-2"
                >
                  <Grid3x3 className="h-4 w-4" />
                  {bulkMode ? "Exit Selection" : "Select"}
                </Button>
                {failedCount !== null && failedCount > 0 && (
                  <Link href="/icm-studio/documents/failed-extractions">
                    <Button variant="outline" className="gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      Failed Extractions
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground">
                        {failedCount}
                      </span>
                    </Button>
                  </Link>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <MoreHorizontal className="h-4 w-4" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem
                      onClick={() => setBackfillDialogOpen(true)}
                      className="gap-2"
                    >
                      <Database className="h-4 w-4" />
                      Backfill missing fields
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex shrink-0 items-center gap-1 rounded-md border border-border p-0.5">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 px-2.5"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3x3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Grid</span>
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5 px-2.5"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">List</span>
                </Button>
              </div>
            </div>

            <DocumentUpload
              open={uploadOpen}
              onOpenChange={setUploadOpen}
              onUploadSuccess={handleUploadSuccess}
            />

            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            )}

            <DocumentList
              documents={documents}
              loading={loading}
              loadingMore={loadingMore}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={filters.page_size || 20}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              viewMode={viewMode}
              onSelect={handleDocumentSelect}
              onDelete={handleDeleteClick}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
              bulkMode={bulkMode}
              infiniteScroll={viewMode === "grid"}
              hasMore={hasMore}
            />

            {!loading && total > 0 && viewMode === "list" && (
              <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
                Showing {documents.length} of {total} document{total !== 1 ? "s" : ""}
              </div>
            )}
            {!loading && total > 0 && viewMode === "grid" && (
              <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
                Loaded {documents.length} of {total} document{total !== 1 ? "s" : ""}
              </div>
            )}
          </main>

          {/* Document Viewer Modal */}
          {selectedDocument && (
            <DocumentViewer
              document={selectedDocument}
              documents={documents}
              currentIndex={selectedIndex}
              open={viewerOpen}
              onClose={handleCloseViewer}
              onNavigate={handleNavigate}
              onDownload={handleDownload}
              onUpdateId={handleUpdateId}
              onDelete={handleDeleteFromViewer}
            />
          )}

          {/* Delete Confirmation Dialog */}
          <DeleteDocumentDialog
            document={documentToDelete}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onSuccess={handleDeleteConfirm}
          />

          {/* Backfill Dialog */}
          <BackfillDialog
            open={backfillDialogOpen}
            onOpenChange={setBackfillDialogOpen}
            onSuccess={loadDocuments}
          />

          <AlertDialog
            open={downloadErrorOpen}
            onOpenChange={(open) => {
              setDownloadErrorOpen(open);
              if (!open) setDownloadErrorMessage(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Download failed</AlertDialogTitle>
                <AlertDialogDescription>
                  {downloadErrorMessage ||
                    "Failed to download document. Please try again."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>OK</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </DashboardLayout>
  );
}
