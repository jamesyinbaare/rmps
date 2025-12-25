"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { ChevronLeft, ChevronRight, File, Image as ImageIcon, FileText, X, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./ui/dialog";
import type { UnmatchedExtractionRecord, Document } from "@/types/document";
import { API_BASE_URL, getDocument, ignoreUnmatchedRecord, markUnmatchedRecordResolved, getUnmatchedRecord } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { format } from "date-fns";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";
import { ScoreEntryForm } from "./ScoreEntryForm";

interface UnmatchedRecordModalProps {
  record: UnmatchedExtractionRecord;
  records: UnmatchedExtractionRecord[];
  open: boolean;
  onClose: () => void;
  onRecordChange: (record: UnmatchedExtractionRecord) => void;
}

export function UnmatchedRecordModal({
  record,
  records,
  open,
  onClose,
  onRecordChange,
}: UnmatchedRecordModalProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [resolving, setResolving] = useState(false);

  // Find current index
  useEffect(() => {
    if (record && records.length > 0) {
      const index = records.findIndex((r) => r.id === record.id);
      setCurrentIndex(index >= 0 ? index : -1);
    }
  }, [record?.id, records]);

  // Load document when record changes
  useEffect(() => {
    if (open && record) {
      loadDocument(record.document_id);
    }
  }, [open, record?.document_id]);

  // Reset image state when document changes
  useEffect(() => {
    if (document) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [document?.id]);

  const loadDocument = async (documentId: number) => {
    setLoadingDocument(true);
    try {
      const doc = await getDocument(documentId);
      setDocument(doc);
    } catch (error) {
      console.error("Failed to load document:", error);
      setImageError(true);
    } finally {
      setLoadingDocument(false);
    }
  };

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0 && records.length > 0) {
      const prevRecord = records[currentIndex - 1];
      onRecordChange(prevRecord);
    }
  }, [currentIndex, records, onRecordChange]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < records.length - 1) {
      const nextRecord = records[currentIndex + 1];
      onRecordChange(nextRecord);
    }
  }, [currentIndex, records, onRecordChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || !record || records.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentIndex > 0) {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight" && currentIndex >= 0 && currentIndex < records.length - 1) {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, records.length, record, handlePrevious, handleNext]);

  if (!record || !document) {
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      case "resolved":
        return <Badge variant="default" className="bg-green-600">Resolved</Badge>;
      case "ignored":
        return <Badge variant="secondary">Ignored</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const handleIgnore = async () => {
    if (!record) return;
    setResolving(true);
    try {
      await ignoreUnmatchedRecord(record.id);
      toast.success("Record ignored successfully");
      // Reload the record to get updated status
      const updatedRecord = await getUnmatchedRecord(record.id);
      onRecordChange(updatedRecord);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ignore record");
      console.error("Error ignoring record:", error);
    } finally {
      setResolving(false);
    }
  };

  const handleResolve = async () => {
    if (!record) return;
    setResolving(true);
    try {
      await markUnmatchedRecordResolved(record.id);
      toast.success("Record marked as resolved successfully");
      // Reload the record to get updated status
      const updatedRecord = await getUnmatchedRecord(record.id);
      onRecordChange(updatedRecord);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark record as resolved");
      console.error("Error marking record as resolved:", error);
    } finally {
      setResolving(false);
    }
  };

  return (
    <Fragment>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="min-w-[95vw] w-full h-[95vh] max-h-[95vh] p-0 flex flex-col" showCloseButton={false}>
        <DialogTitle className="sr-only">
          Unmatched Record - {record.id}
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">
              Unmatched Record #{record.id}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Document: {document.extracted_id || document.file_name}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body: Side-by-side layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Side: Document Viewer */}
          <div className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-muted/30 p-6 relative">
              <div className="w-full h-full flex items-center justify-center min-h-0">
                {loadingDocument && (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}

                {!loadingDocument && imageLoading && !imageError && document.mime_type.startsWith("image/") && (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}

                {!loadingDocument && !imageError && document.mime_type.startsWith("image/") ? (
                  <img
                    src={previewUrl}
                    alt={displayText}
                    className="w-auto h-auto object-contain max-w-[calc(100%-3rem)] max-h-[calc(100%-3rem)]"
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageError(true);
                      setImageLoading(false);
                    }}
                  />
                ) : !loadingDocument ? (
                  <div className="flex flex-col items-center justify-center text-center p-8">
                    <Icon className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Preview not available for this file type
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {fileType}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Side: Unmatched Record Details and Score Entry */}
          <div className="w-full lg:w-1/2 flex flex-col overflow-hidden">
            {/* Record Details Section */}
            <div className="shrink-0 border-b border-border overflow-auto">
              <div className="p-4">
                {/* <h3 className="text-lg font-semibold mb-3">Record Details</h3> */}
                <Accordion>
                  <AccordionItem value="record-details">
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-4 w-full pr-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-12 text-sm font-medium shrink-0">
                            {record.sn ?? "-"}
                          </div>
                          <div className="w-28 font-mono text-xs shrink-0">
                            {record.index_number ?? "-"}
                          </div>
                          <div className="flex-1 text-sm min-w-0 truncate">
                            {record.candidate_name ?? "-"}
                          </div>
                          <div className="shrink-0">
                            {getStatusBadge(record.status)}
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Score</label>
                          <p className="mt-1">{record.score ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Status</label>
                          <div className="mt-1">{getStatusBadge(record.status)}</div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Document ID</label>
                          <p className="mt-1 font-mono text-xs">{record.document_extracted_id ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">School</label>
                          <p className="mt-1">{record.document_school_name ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Subject</label>
                          <p className="mt-1">{record.document_subject_name ?? "-"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Extraction Method</label>
                          <p className="mt-1">{record.extraction_method}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Created At</label>
                          <p className="mt-1">
                            {record.created_at
                              ? format(new Date(record.created_at), "yyyy-MM-dd HH:mm:ss")
                              : "-"}
                          </p>
                        </div>
                        {record.resolved_at && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Resolved At</label>
                            <p className="mt-1">
                              {format(new Date(record.resolved_at), "yyyy-MM-dd HH:mm:ss")}
                            </p>
                          </div>
                        )}
                        {record.raw_data && (
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Raw Data</label>
                            <pre className="mt-1 text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                              {JSON.stringify(record.raw_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Action Buttons */}
                {record.status === "pending" && (
                  <div className="border-t border-border pt-4 mt-4">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="default"
                        onClick={handleResolve}
                        disabled={resolving}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Resolve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleIgnore}
                        disabled={resolving}
                        className="gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        Ignore
                      </Button>
                    </div>
                  </div>
                )}

                {/* Navigation Controls */}
                {records.length > 1 && currentIndex >= 0 && (
                  <div className="border-t border-border pt-4 mt-4">
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevious}
                        disabled={currentIndex === 0}
                        className="gap-2"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        Record {currentIndex + 1} of {records.length}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNext}
                        disabled={currentIndex === records.length - 1}
                        className="gap-2"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Score Entry Section */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <ScoreEntryForm document={document} onClose={onClose} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </Fragment>
  );
}
