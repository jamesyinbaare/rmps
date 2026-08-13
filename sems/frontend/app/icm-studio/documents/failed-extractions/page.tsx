"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DocumentList } from "@/components/DocumentList";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DeleteDocumentDialog } from "@/components/DeleteDocumentDialog";
import { CompactFilters } from "@/components/CompactFilters";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Grid3x3, List, ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import {
  listDocuments,
  downloadDocument,
  getDocumentDownloadFilename,
  updateDocumentId,
  bulkExtractDocumentIds,
} from "@/lib/api";
import type { Document, DocumentFilters as DocumentFiltersType } from "@/types/document";
import { ID_EXTRACTION_ERROR_FILTERS } from "@/lib/id-extraction-errors";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function FailedExtractionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorParam = searchParams.get("error") || "";
  const examIdParam = searchParams.get("exam_id");

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocumentFiltersType>(() => {
    const initial: DocumentFiltersType = {
      page: 1,
      page_size: 20,
      id_extraction_status: "error",
    };
    if (errorParam) initial.id_extraction_error_code = errorParam;
    if (examIdParam) {
      const examId = parseInt(examIdParam, 10);
      if (!Number.isNaN(examId)) initial.exam_id = examId;
    }
    return initial;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

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

  useEffect(() => {
    setFilters((prev) => {
      const nextCode = errorParam || undefined;
      const nextExam = examIdParam ? parseInt(examIdParam, 10) : undefined;
      const validExam = nextExam != null && !Number.isNaN(nextExam) ? nextExam : undefined;
      if (
        (prev.id_extraction_error_code ?? undefined) === nextCode &&
        (prev.exam_id ?? undefined) === validExam
      ) {
        return prev;
      }
      return {
        ...prev,
        id_extraction_error_code: nextCode,
        exam_id: validExam,
        page: 1,
      };
    });
  }, [errorParam, examIdParam]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (filters.id_extraction_error_code) {
      params.set("error", filters.id_extraction_error_code);
    } else {
      params.delete("error");
    }
    if (filters.exam_id) {
      params.set("exam_id", String(filters.exam_id));
    } else {
      params.delete("exam_id");
    }
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`/icm-studio/documents/failed-extractions${next ? `?${next}` : ""}`, {
        scroll: false,
      });
    }
  }, [filters.id_extraction_error_code, filters.exam_id, router, searchParams]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listDocuments(filters);
      setDocuments(response.items);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error loading documents:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleErrorFilterChange = (code: string) => {
    setFilters((prev) => ({
      ...prev,
      id_extraction_error_code: code || undefined,
      page: 1,
    }));
  };

  const handleFiltersChange = (newFilters: DocumentFiltersType) => {
    setFilters({
      ...newFilters,
      id_extraction_status: "error",
      id_extraction_error_code: filters.id_extraction_error_code,
      q: filters.q,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({ ...prev, page: 1, page_size: pageSize }));
  };

  const handleDocumentSelect = (doc: Document) => {
    const index = documents.findIndex((d) => d.id === doc.id);
    setSelectedIndex(index);
    setSelectedDocument(doc);
    setViewerOpen(true);
  };

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setSelectedDocument(null);
    setSelectedIndex(-1);
  }, []);

  const handleNavigate = useCallback(
    (index: number) => {
      if (index >= 0 && index < documents.length) {
        setSelectedIndex(index);
        setSelectedDocument(documents[index]);
      }
    },
    [documents]
  );

  const handleUpdateId = async (
    documentId: number,
    extractedId: string,
    schoolId?: number,
    subjectId?: number
  ) => {
    await updateDocumentId(documentId, extractedId, schoolId, subjectId);
    toast.success("Document ID updated successfully");
    const response = await listDocuments(filters);
    setDocuments(response.items);
    setTotalPages(response.total_pages);
    setCurrentPage(response.page);
    setTotal(response.total);
    if (selectedDocument && selectedDocument.id === documentId) {
      const updatedDoc = response.items.find((d) => d.id === documentId);
      if (updatedDoc) {
        setSelectedDocument(updatedDoc);
      } else {
        handleCloseViewer();
      }
    }
  };

  const handleBulkRetry = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await bulkExtractDocumentIds(Array.from(selectedIds));
      toast.success(`Queued ${result.queued} document(s) for re-extraction`);
      setSelectedIds(new Set());
      setBulkMode(false);
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    }
  };

  const handleDeleteClick = (doc: Document) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteFromViewer = async (documentId: number) => {
    const doc = documents.find((d) => d.id === documentId);
    if (doc) handleDeleteClick(doc);
  };

  const handleDeleteConfirm = () => {
    if (documentToDelete) {
      if (selectedDocument && selectedDocument.id === documentToDelete.id) {
        handleCloseViewer();
      }
      loadDocuments();
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch (error) {
      console.error("Failed to download document:", error);
      toast.error("Failed to download document. Please try again.");
    }
  };

  const activeErrorCode = filters.id_extraction_error_code || "";

  return (
    <DashboardLayout title="Failed ID Extractions">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            <div className="flex items-center gap-3">
              <Link href="/icm-studio/documents">
                <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <span>Failed ID Extractions</span>
                {!loading && total > 0 && (
                  <span className="text-sm text-muted-foreground font-normal">
                    ({total} {total === 1 ? "document" : "documents"})
                  </span>
                )}
              </div>
            </div>
          }
          showSearch={true}
          searchValue={searchQuery}
          onSearch={setSearchQuery}
        />
        <div className="flex flex-1 overflow-hidden relative">
          <main className="flex-1 overflow-y-auto w-full">
            <div className="px-6 pt-4 pb-2">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive mb-1">
                      Documents requiring manual ID entry
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Filter by exam or error type, then correct IDs or bulk-retry extraction.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pt-2 pb-2 border-b border-border">
              <CompactFilters filters={filters} onFiltersChange={handleFiltersChange} />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b border-border">
              <div className="flex flex-wrap items-center gap-2">
                {ID_EXTRACTION_ERROR_FILTERS.map((opt) => (
                  <Button
                    key={opt.value || "all"}
                    variant={activeErrorCode === opt.value ? "secondary" : "outline"}
                    size="sm"
                    className={cn("h-8", activeErrorCode === opt.value && "border-destructive/40")}
                    onClick={() => handleErrorFilterChange(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={bulkMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setBulkMode(!bulkMode);
                    if (bulkMode) setSelectedIds(new Set());
                  }}
                >
                  {bulkMode ? "Exit selection" : "Select"}
                </Button>
                {bulkMode && selectedIds.size > 0 && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkRetry}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry ({selectedIds.size})
                  </Button>
                )}
                <div className="flex items-center rounded-md border shrink-0">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none"
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-l-none"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            )}

            <DocumentList
              documents={documents}
              loading={loading}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={filters.page_size || 20}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              viewMode={viewMode}
              onSelect={handleDocumentSelect}
              onDelete={handleDeleteClick}
              selectedIds={selectedIds}
              onSelectionChange={(id, selected) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (selected) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
              bulkMode={bulkMode}
              hideEmptyState
            />

            {!loading && total > 0 && (
              <div className="px-6 py-4 text-sm text-muted-foreground text-center border-t border-border">
                Showing {documents.length} of {total} document{total !== 1 ? "s" : ""}
              </div>
            )}

            {!loading && total === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">
                  {activeErrorCode || filters.exam_id || searchQuery.trim()
                    ? "No documents for this filter"
                    : "No failed extractions"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {activeErrorCode || filters.exam_id || searchQuery.trim()
                    ? "Try another error type, exam, or clear search."
                    : "All documents have successfully extracted IDs."}
                </p>
                {activeErrorCode || filters.exam_id || searchQuery.trim() ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setFilters((prev) => ({
                        ...prev,
                        id_extraction_error_code: undefined,
                        exam_id: undefined,
                        q: undefined,
                        page: 1,
                      }));
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/icm-studio/documents">
                    <Button variant="outline">Back to All Documents</Button>
                  </Link>
                )}
              </div>
            )}
          </main>

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

          <DeleteDocumentDialog
            document={documentToDelete}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onSuccess={handleDeleteConfirm}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
