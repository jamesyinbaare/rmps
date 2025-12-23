"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, File, Image as ImageIcon, FileText, Download, Trash2, Save, Loader2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./ui/dialog";
import type { Document, Exam, School, Subject } from "@/types/document";
import { formatFileSize } from "@/lib/utils";
import { API_BASE_URL, downloadDocument, getExam, listSchools, listSubjects, updateDocumentId } from "@/lib/api";
import { toast } from "sonner";

interface DocumentViewerProps {
  document: Document;
  documents: Document[];
  currentIndex: number;
  open: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDownload?: (document: Document) => void;
  onUpdateId?: (documentId: number, extractedId: string, schoolId?: number, subjectId?: number) => Promise<void>;
  onDelete?: (documentId: number) => Promise<void>;
}

export function DocumentViewer({
  document,
  documents,
  currentIndex,
  open,
  onClose,
  onNavigate,
  onDownload,
  onUpdateId,
  onDelete,
}: DocumentViewerProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [examName, setExamName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [savingId, setSavingId] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Guard against undefined/null document
  if (!document) {
    return null;
  }

  const previewUrl = `${API_BASE_URL}/api/v1/documents/${document.id}/download`;
  const displayText = document.extracted_id || document.file_name;
  // Show manual ID input only if there's no extracted_id (extraction failed or not yet extracted)
  const needsManualId = !document.extracted_id;

  const getExtractionMethodLabel = (method: string | null): string => {
    if (!method) return "Unknown";
    switch (method.toLowerCase()) {
      case "barcode":
        return "Barcode";
      case "ocr":
        return "OCR";
      case "manual":
        return "Manual";
      default:
        return method;
    }
  };

  const getExtractionMethodBadgeClass = (method: string | null): string => {
    if (!method) return "bg-gray-500 text-white";
    switch (method.toLowerCase()) {
      case "barcode":
        return "bg-green-500 text-white";
      case "ocr":
        return "bg-blue-500 text-white";
      case "manual":
        return "bg-purple-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  // Load schools and subjects for validation
  useEffect(() => {
    const loadValidationData = async () => {
      try {
        // Load all schools
        let allSchools: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore && schoolPage <= 10) {
          const schoolsData = await listSchools(schoolPage, 100);
          allSchools = [...allSchools, ...schoolsData];
          schoolHasMore = schoolsData.length === 100;
          schoolPage++;
        }

        // Load all subjects
        let allSubjects: Subject[] = [];
        let subjectPage = 1;
        let subjectHasMore = true;
        while (subjectHasMore && subjectPage <= 10) {
          const subjectsData = await listSubjects(subjectPage, 100);
          allSubjects = [...allSubjects, ...subjectsData];
          subjectHasMore = subjectsData.length === 100;
          subjectPage++;
        }

        setSchools(allSchools);
        setSubjects(allSubjects);
      } catch (error) {
        console.error("Failed to load validation data:", error);
      }
    };

    loadValidationData();
  }, []);

  // Reset manual ID when document changes
  useEffect(() => {
    setManualId(document.extracted_id || "");
    setImageError(false);
    setImageLoading(true);
    setIdError(null);
  }, [document.id, document.extracted_id]);

  // Fetch exam, school, and subject names
  useEffect(() => {
    // Reset names when document changes
    setExamName(null);
    setSchoolName(null);
    setSubjectName(null);

    const fetchNames = async () => {
      try {
        // Fetch exam name (with pagination)
        if (document.exam_id) {
          try {
            const exam = await getExam(document.exam_id);
            setExamName(exam.exam_type);
          } catch (err) {
            console.error("Failed to fetch exam:", err);
          }
        }

        // Fetch school name (with pagination)
        if (document.school_id) {
          try {
            let schoolPage = 1;
            let schoolFound = false;
            while (!schoolFound && schoolPage <= 10) {
              const schools = await listSchools(schoolPage, 100);
              const school = schools.find((s: School) => s.id === document.school_id);
              if (school) {
                setSchoolName(school.name);
                schoolFound = true;
              }
              if (schools.length < 100) break; // No more pages
              schoolPage++;
            }
          } catch (err) {
            console.error("Failed to fetch school:", err);
          }
        }

        // Fetch subject name (with pagination)
        if (document.subject_id) {
          try {
            let subjectPage = 1;
            let subjectFound = false;
            while (!subjectFound && subjectPage <= 10) {
              const subjects = await listSubjects(subjectPage, 100);
              const subject = subjects.find((s: Subject) => s.id === document.subject_id);
              if (subject) {
                setSubjectName(subject.name);
                subjectFound = true;
              }
              if (subjects.length < 100) break; // No more pages
              subjectPage++;
            }
          } catch (err) {
            console.error("Failed to fetch subject:", err);
          }
        }
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
      }
    };

    fetchNames();
  }, [document.exam_id, document.school_id, document.subject_id]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || !document) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation if we have valid documents and index
      if (e.key === "ArrowLeft" && currentIndex > 0 && currentIndex < documents.length) {
        e.preventDefault();
        onNavigate(currentIndex - 1);
      } else if (e.key === "ArrowRight" && currentIndex >= 0 && currentIndex < documents.length - 1) {
        e.preventDefault();
        onNavigate(currentIndex + 1);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, documents.length, onNavigate, onClose, document]);

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

  const handleDownload = async () => {
    if (onDownload) {
      onDownload(document);
    } else {
      // Fallback download handler
      try {
        const blob = await downloadDocument(document.id);
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement("a");
        a.href = url;

        let downloadFilename = document.file_name;
        if (document.extracted_id) {
          const fileExtension = document.file_name.split('.').pop();
          downloadFilename = fileExtension ? `${document.extracted_id}.${fileExtension}` : document.extracted_id;
        }

        a.download = downloadFilename;
        window.document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        window.document.body.removeChild(a);
      } catch (error) {
        console.error("Failed to download document:", error);
        toast.error("Failed to download document. Please try again.");
      }
    }
  };

  const validateId = (id: string): { error: string | null; schoolId?: number; subjectId?: number } => {
    // Check if empty
    if (!id.trim()) {
      return { error: "Please enter a document ID" };
    }

    const trimmedId = id.trim();

    // Check length
    if (trimmedId.length !== 13) {
      return { error: "ID must be exactly 13 characters" };
    }

    // Check if only digits
    if (!/^\d+$/.test(trimmedId)) {
      return { error: "ID must contain only digits" };
    }

    // Parse ID components: SCHOOL_CODE(6) + SUBJECT_CODE(3) + SUBJECT_SERIES(1) + TEST_TYPE(1) + SHEET_NUMBER(2)
    const schoolCode = trimmedId.substring(0, 6);
    const subjectCode = trimmedId.substring(6, 9);
    const subjectSeries = trimmedId.substring(9, 10);
    const testType = trimmedId.substring(10, 11);
    const sheetNumber = trimmedId.substring(11, 13);

    // Validate subject series (1-9)
    const seriesNum = parseInt(subjectSeries, 10);
    if (isNaN(seriesNum) || seriesNum < 1 || seriesNum > 9) {
      return { error: "Subject series must be between 1 and 9" };
    }

    // Validate test type (1 or 2)
    if (testType !== "1" && testType !== "2") {
      return { error: "Test type must be 1 (Objectives) or 2 (Essay)" };
    }

    // Validate sheet number (01-99)
    const sheetNum = parseInt(sheetNumber, 10);
    if (isNaN(sheetNum) || sheetNum < 1 || sheetNum > 99) {
      return { error: "Sheet number must be between 01 and 99" };
    }

    // Validate school code exists and get school ID
    const school = schools.find((s) => s.code === schoolCode);
    if (!school) {
      return { error: `School code ${schoolCode} not found` };
    }

    // Validate subject code exists and get subject ID
    const subject = subjects.find((s) => s.code === subjectCode);
    if (!subject) {
      return { error: `Subject code ${subjectCode} not found` };
    }

    return { error: null, schoolId: school.id, subjectId: subject.id };
  };

  const handleIdChange = (value: string) => {
    // Only allow digits
    const digitsOnly = value.replace(/\D/g, "");
    // Limit to 13 characters
    const limited = digitsOnly.slice(0, 13);
    setManualId(limited);

    // Validate on change if we have 13 characters
    if (limited.length === 13 && schools.length > 0 && subjects.length > 0) {
      const validation = validateId(limited);
      setIdError(validation.error);
    } else {
      setIdError(null);
    }
  };

  const handleSaveId = async () => {
    const trimmedId = manualId.trim();

    if (!trimmedId) {
      setIdError("Please enter a document ID");
      return;
    }

    // Validate before saving
    const validation = validateId(trimmedId);
    if (validation.error) {
      setIdError(validation.error);
      toast.error(validation.error);
      return;
    }

    setSavingId(true);
    setIdError(null);
    try {
      if (onUpdateId) {
        await onUpdateId(document.id, trimmedId, validation.schoolId, validation.subjectId);
      } else {
        await updateDocumentId(document.id, trimmedId, validation.schoolId, validation.subjectId);
        toast.success("Document ID updated successfully");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update document ID";
      setIdError(errorMessage);
      toast.error(errorMessage);
      console.error("Error updating document ID:", error);
    } finally {
      setSavingId(false);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(document.id);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0 && currentIndex < documents.length) {
      onNavigate(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < documents.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-screen h-[95vh] min-w-[80vw] max-h-[95vh] p-0 flex flex-col" showCloseButton={false}>
        {/* DialogTitle for accessibility - visually hidden */}
        <DialogTitle className="sr-only">
          Document Viewer - {displayText}
        </DialogTitle>
        {/* Header with Document Details */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold truncate">
                {document.extracted_id || "-"}
              </h2>
              {needsManualId && (
                <span className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">
                  ID Extraction Failed
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {schoolName && (
                <span className="text-xs text-muted-foreground">School: {schoolName}</span>
              )}
              {subjectName && (
                <>
                  {schoolName && <span className="text-xs text-muted-foreground">•</span>}
                  <span className="text-xs text-muted-foreground">Subject: {subjectName}</span>
                </>
              )}
              {document.id_extraction_method && (
                <>
                  {(schoolName || subjectName) && <span className="text-xs text-muted-foreground">•</span>}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getExtractionMethodBadgeClass(document.id_extraction_method)}`}
                  >
                    {getExtractionMethodLabel(document.id_extraction_method)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleDelete}
                className="h-8 w-8"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleDownload}
              className="h-8 w-8"
            >
              <Download className="h-4 w-4" />
            </Button>
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

        {/* Manual ID Entry Section */}
        {needsManualId && (
          <div className="border-b border-border px-6 py-4 bg-muted/30 shrink-0">
            <div className="space-y-2">
              <label htmlFor="manual-id" className="text-sm font-medium">
                Enter Document ID Manually
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    id="manual-id"
                    type="text"
                    inputMode="numeric"
                    value={manualId}
                    onChange={(e) => handleIdChange(e.target.value)}
                    placeholder="Enter 13-digit document ID"
                    maxLength={13}
                    className="font-mono"
                    aria-invalid={!!idError}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveId();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleSaveId}
                  disabled={savingId || !manualId.trim() || !!idError}
                  className="gap-2"
                >
                  {savingId ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save ID
                    </>
                  )}
                </Button>
              </div>
              {idError && (
                <p className="text-sm text-destructive">{idError}</p>
              )}
              {!idError && manualId.length === 13 && (
                <p className="text-sm text-muted-foreground">
                  Format: School(6) + Subject(3) + Series(1) + Type(1) + Sheet(2)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Document Content Area */}
        <div className="flex-1 overflow-auto bg-muted/30 p-6 relative">
          {/* Navigation Buttons */}
          {documents.length > 1 && currentIndex >= 0 && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="absolute left-6 top-1/2 -translate-y-1/2 z-10 h-10 w-10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={currentIndex === documents.length - 1}
                className="absolute right-6 top-1/2 -translate-y-1/2 z-10 h-10 w-10"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}

          {/* Document Counter */}
          {documents.length > 1 && currentIndex >= 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <div className="px-3 py-1 rounded-full bg-background/90 border border-border text-xs text-muted-foreground">
                {currentIndex + 1} of {documents.length}
              </div>
            </div>
          )}

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
                className="w-auto h-auto object-contain"
                style={{
                  maxWidth: 'calc(100% - 3rem)',
                  maxHeight: 'calc(100% - 3rem)'
                }}
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-8">
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
      </DialogContent>
    </Dialog>
  );
}
