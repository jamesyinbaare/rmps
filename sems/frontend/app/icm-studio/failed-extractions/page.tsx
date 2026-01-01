"use client";

import { useState, useEffect, useCallback } from "react";
import { DocumentList } from "@/components/DocumentList";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DeleteDocumentDialog } from "@/components/DeleteDocumentDialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Grid3x3, List, ArrowLeft, AlertCircle } from "lucide-react";
import { listDocuments, downloadDocument, updateDocumentId } from "@/lib/api";
import type { Document, DocumentFilters as DocumentFiltersType } from "@/types/document";
import { toast } from "sonner";
import Link from "next/link";

export default function FailedExtractionsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocumentFiltersType>({
    page: 1,
    page_size: 20,
    id_extraction_status: "error",
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

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({ ...prev, page: 1, page_size: pageSize }));
  };

  const handleDocumentSelect = (doc: Document) => {
    const index = documents.findIndex((d) => d.id === doc.id);
    if (index >= 0) {
      setSelectedIndex(index);
      setSelectedDocument(doc);
      setViewerOpen(true);
    } else {
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
          const newIndex = response.items.findIndex((d) => d.id === documentId);
          if (newIndex >= 0) {
            setSelectedIndex(newIndex);
          }
        } else {
          // Document was successfully updated and removed from failed list
          handleCloseViewer();
        }
      }
    } catch (error) {
      throw error;
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
      if (selectedDocument && selectedDocument.id === documentToDelete.id) {
        handleCloseViewer();
      }
      loadDocuments();
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
        const fileExtension = doc.file_name.split('.').pop();
        downloadFilename = fileExtension ? `${doc.extracted_id}.${fileExtension}` : doc.extracted_id;
      }

      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download document:", error);
      alert("Failed to download document. Please try again.");
    }
  };

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
        />
        <div className="flex flex-1 overflow-hidden relative">
          <main className="flex-1 overflow-y-auto w-full">
            {/* Info Banner */}
            <div className="px-6 pt-4 pb-2">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive mb-1">
                      Documents requiring manual ID entry
                    </p>
                    <p className="text-sm text-muted-foreground">
                      These documents failed automatic ID extraction. Click on any document to manually enter the ID.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end px-6 py-4 border-b border-border">
              <div className="flex items-center rounded-md border">
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
            />

            {!loading && total > 0 && (
              <div className="px-6 py-4 text-sm text-muted-foreground text-center border-t border-border">
                Showing {documents.length} of {total} document{total !== 1 ? "s" : ""}
              </div>
            )}

            {!loading && total === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No failed extractions</p>
                <p className="text-sm text-muted-foreground mb-4">
                  All documents have successfully extracted IDs.
                </p>
                <Link href="/icm-studio/documents">
                  <Button variant="outline">Back to All Documents</Button>
                </Link>
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
        </div>
      </div>
    </DashboardLayout>
  );
}
