"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Image as ImageIcon, FileText, File, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ScoreEntryForm } from "./ScoreEntryForm";
import type { Document, ScoreDocumentFilters } from "@/types/document";
import { formatFileSize } from "@/lib/utils";
import { API_BASE_URL, getFilteredDocuments } from "@/lib/api";

interface DataEntryModalProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (document: Document) => void;
  filters?: ScoreDocumentFilters;
  onDocumentChange?: (document: Document) => void;
}

export function DataEntryModal({
  document,
  open,
  onOpenChange,
  onDownload,
  filters,
  onDocumentChange,
}: DataEntryModalProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const loadFilteredDocuments = useCallback(async () => {
    if (!filters) return;

    setLoadingDocuments(true);
    try {
      // Load all documents with a large page size
      const allDocuments: Document[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await getFilteredDocuments({
          ...filters,
          page,
          page_size: 100, // Load 100 at a time
        });

        allDocuments.push(...response.items);
        hasMore = response.items.length === 100 && page < response.total_pages;
        page++;

        // Safety limit to prevent infinite loops
        if (page > 50) break;
      }

      setDocuments(allDocuments);
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setLoadingDocuments(false);
    }
  }, [filters]);

  // Load all filtered documents when modal opens
  useEffect(() => {
    if (open && document && filters) {
      loadFilteredDocuments();
    }
  }, [open, document?.id, filters, loadFilteredDocuments]);

  // Find current document index when documents or document changes
  useEffect(() => {
    if (document && documents.length > 0) {
      const index = documents.findIndex((doc) => doc.id === document.id);
      setCurrentIndex(index >= 0 ? index : -1);
    }
  }, [document?.id, documents]);

  // Reset image state when document changes
  useEffect(() => {
    if (document) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [document?.id]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0 && documents.length > 0 && onDocumentChange) {
      const prevDocument = documents[currentIndex - 1];
      onDocumentChange(prevDocument);
    }
  }, [currentIndex, documents, onDocumentChange]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < documents.length - 1 && onDocumentChange) {
      const nextDocument = documents[currentIndex + 1];
      onDocumentChange(nextDocument);
    }
  }, [currentIndex, documents, onDocumentChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || !document || documents.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentIndex > 0) {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight" && currentIndex >= 0 && currentIndex < documents.length - 1) {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, documents.length, document, handlePrevious, handleNext]);

  // Guard against undefined/null document
  if (!document) {
    return null;
  }

  const previewUrl = `${API_BASE_URL}/api/v1/documents/${document.id}/download`;
  const displayText = document.extracted_id || document.file_name;

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }
    if (mimeType === "application/pdf") {
      return FileText;
    }
    return File;
  };

  const getFileType = (mimeType: string, fileName: string) => {
    if (mimeType.startsWith("image/")) {
      const ext = fileName.split(".").pop()?.toUpperCase();
      return ext || "IMAGE";
    }
    if (mimeType === "application/pdf") {
      return "PDF";
    }
    return "FILE";
  };

  const Icon = getFileIcon(document.mime_type);
  const fileType = getFileType(document.mime_type, document.file_name);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleDownload = async () => {
    if (onDownload && document) {
      onDownload(document);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0 flex flex-col" showCloseButton={false}>
        <DialogTitle className="sr-only">
          Data Entry - {displayText}
        </DialogTitle>
        <DialogDescription className="sr-only">
          View document image and enter scores for {displayText}
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {document.extracted_id || document.file_name}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Document ID: {document.id} • {document.file_name}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDownload && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleDownload}
                className="h-8 w-8"
              >
                <FileText className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body: Side-by-side layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Side: Image Viewer */}
          <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-muted/30 p-6 md:p-2 lg:p-2 relative">
              <div className="w-full h-full flex items-center justify-center min-h-0">
                {imageLoading && !imageError && document.mime_type.startsWith("image/") && (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}
                {!imageError && document.mime_type.startsWith("image/") ? (
                  <img
                    src={previewUrl}
                    alt={displayText}
                    className="w-auto h-auto object-contain max-w-[calc(100%-3rem)] max-h-[calc(100%-3rem)] md:max-w-[calc(100%-1rem)] md:max-h-[calc(100%-1rem)] lg:max-w-[calc(100%-1rem)] lg:max-h-[calc(100%-1rem)]"
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageError(true);
                      setImageLoading(false);
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-8 md:p-4 lg:p-4">
                    <Icon className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Preview not available for this file type
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {fileType} • {formatFileSize(document.file_size)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Controls */}
            {documents.length > 1 && currentIndex >= 0 && (
              <div className="border-t border-border px-4 py-3 bg-background shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevious}
                    disabled={currentIndex === 0 || loadingDocuments}
                    className="flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium">
                      {currentIndex + 1} of {documents.length}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    disabled={currentIndex >= documents.length - 1 || loadingDocuments}
                    className="flex items-center gap-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Score Entry Form */}
          <div className="w-full lg:w-1/2 flex flex-col overflow-hidden">
            <ScoreEntryForm
              document={document}
              onClose={handleClose}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
