"use client";

import { useState, Suspense } from "react";
import { FolderBrowser } from "@/components/FolderBrowser";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { DocumentViewer } from "@/components/DocumentViewer";
import { downloadDocument } from "@/lib/api";
import type { Document } from "@/types/document";
import { Loader2 } from "lucide-react";

export default function FoldersPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

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

      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
        const fileExtension = doc.file_name.split(".").pop();
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
    <DashboardLayout title="Folders">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title="Folders"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Main Content Area */}
          <main className={`flex-1 overflow-hidden transition-all ${selectedDocument ? 'md:w-1/2 2xl:w-3/5' : 'w-full'}`}>
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <FolderBrowser
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onSelect={handleDocumentSelect}
              />
            </Suspense>
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
            <div className="fixed inset-0 z-50 md:relative md:z-auto md:w-1/2 2xl:w-2/5 flex flex-col">
              <DocumentViewer
                document={selectedDocument}
                onClose={handleCloseViewer}
                onDownload={handleDownload}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
