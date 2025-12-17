"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentList } from "@/components/DocumentList";
import { DocumentViewer } from "@/components/DocumentViewer";
import { CompactFilters } from "@/components/CompactFilters";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, Upload, FolderPlus, Grid3x3, List } from "lucide-react";
import { listDocuments, downloadDocument } from "@/lib/api";
import type { Document, DocumentFilters as DocumentFiltersType } from "@/types/document";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocumentFiltersType>({
    page: 1,
    page_size: 20,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    };

    if (newMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [newMenuOpen]);

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

  const handleFiltersChange = (newFilters: DocumentFiltersType) => {
    setFilters(newFilters);
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleUploadSuccess = () => {
    loadDocuments();
  };

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocument(doc);
  };

  const handleCloseViewer = () => {
    setSelectedDocument(null);
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Use extracted_id as filename if available, otherwise use file_name
      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
        // Extract file extension from original filename
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
    <DashboardLayout title="All files">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title="All files"
          filters={<CompactFilters filters={filters} onFiltersChange={handleFiltersChange} />}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Main Content Area */}
          <main className={`flex-1 overflow-y-auto transition-all ${selectedDocument ? 'md:w-1/2 2xl:w-3/5' : 'w-full'}`}>
            {/* Action Buttons */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                {/* New Button with Dropdown */}
                <div className="relative" ref={menuRef}>
                  <Button
                    variant="secondary"
                    onClick={() => setNewMenuOpen(!newMenuOpen)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {newMenuOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover shadow-md">
                      <button
                        onClick={() => {
                          setUploadOpen(true);
                          setNewMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <Upload className="h-4 w-4" />
                        Upload files
                      </button>
                      <button
                        onClick={() => {
                          // TODO: Implement new folder functionality
                          setNewMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <FolderPlus className="h-4 w-4" />
                        New folder
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* View Toggle */}
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
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              viewMode={viewMode}
              onSelect={handleDocumentSelect}
            />

            {!loading && total > 0 && (
              <div className="px-6 py-4 text-sm text-muted-foreground text-center border-t border-border">
                Showing {documents.length} of {total} document{total !== 1 ? "s" : ""}
              </div>
            )}
          </main>

          {/* Backdrop for small screens */}
          {selectedDocument && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={handleCloseViewer}
            />
          )}

          {/* Document Viewer - Responsive Sizing */}
          {selectedDocument && (
            <>
              <div className="fixed inset-0 z-50 md:relative md:z-auto md:w-1/2 2xl:w-2/5 flex flex-col">
                <DocumentViewer
                  document={selectedDocument}
                  onClose={handleCloseViewer}
                  onDownload={handleDownload}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
