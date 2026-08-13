"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, File, Image as ImageIcon, FileText, Download, Trash2, Save, Loader2, X, Eye, RefreshCw, PanelRightClose, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import type { Document, Exam, School, Subject, ReductoDataResponse } from "@/types/document";
import { formatFileSize } from "@/lib/utils";
import { schoolPrefixForSheetId } from "@/lib/schoolCode";
import {
  getIdExtractionErrorBadgeLabel,
  getIdExtractionErrorTitle,
} from "@/lib/id-extraction-errors";
import {
  API_BASE_URL,
  downloadDocument,
  extractDocumentId,
  getDocumentDownloadFilename,
  getExam,
  getReductoData,
  listSchools,
  listSubjects,
  updateDocumentId,
} from "@/lib/api";
import { toast } from "sonner";

interface DocumentViewerProps {
  document: Document;
  documents?: Document[];
  currentIndex?: number;
  open?: boolean;
  onClose: () => void;
  onNavigate?: (index: number) => void;
  onDownload?: (document: Document) => void;
  onUpdateId?: (documentId: number, extractedId: string, schoolId?: number, subjectId?: number) => Promise<void>;
  onDelete?: (documentId: number) => Promise<void>;
  /** Show Preview Data toggle that opens extraction panel inside this viewer */
  enableReductoPreview?: boolean;
  onUpdateScores?: (document: Document) => void;
  updatingScores?: boolean;
}

function parseCandidatesFromData(data: Record<string, any>): any[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  let candidates: any[] = [];

  const extractCandidatesFromRows = (rows: any[]): any[] => {
    const result: any[] = [];
    if (!Array.isArray(rows)) {
      return result;
    }
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      if (row && typeof row === "object") {
        result.push({
          index_number: row.index_number || row.indexNumber || null,
          candidate_name: row.candidate_name || row.candidateName || row.name || null,
          score: row.raw_score ?? row.rawScore ?? row.score ?? null,
          attend: row.attend || null,
          verify: row.verify ?? null,
          sn: row.sn || row.serial_number || row.serialNumber || row.row_number || row.rowNumber || idx + 1,
        });
      }
    }
    return result;
  };

  if (Array.isArray(data.candidates)) {
    candidates = data.candidates;
    if (candidates.length > 0) return candidates;
  }

  if (candidates.length === 0 && Array.isArray(data.tables)) {
    for (const table of data.tables) {
      if (table && typeof table === "object" && Array.isArray(table.rows)) {
        candidates.push(...extractCandidatesFromRows(table.rows));
      }
    }
    if (candidates.length > 0) return candidates;
  }

  if (candidates.length === 0 && data.data && typeof data.data === "object") {
    const nestedData = data.data;
    if (Array.isArray(nestedData.candidates)) {
      candidates = nestedData.candidates;
      if (candidates.length > 0) return candidates;
    }
    if (candidates.length === 0 && Array.isArray(nestedData.tables)) {
      for (const table of nestedData.tables) {
        if (table && typeof table === "object" && Array.isArray(table.rows)) {
          candidates.push(...extractCandidatesFromRows(table.rows));
        }
      }
      if (candidates.length > 0) return candidates;
    }
  }

  return candidates;
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
  enableReductoPreview,
  onUpdateScores,
  updatingScores,
}: DocumentViewerProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [examName, setExamName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [savingId, setSavingId] = useState(false);
  const [retryingExtract, setRetryingExtract] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showExtractionPanel, setShowExtractionPanel] = useState(false);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [extractionData, setExtractionData] = useState<ReductoDataResponse | null>(null);
  const [extractionViewMode, setExtractionViewMode] = useState<"table" | "json">("table");

  // Guard against undefined/null document
  if (!document) {
    return null;
  }

  const previewUrl = `${API_BASE_URL}/api/v1/documents/${document.id}/download`;
  const displayText = document.extracted_id || document.file_name;
  // Allow manual correction for any failed extraction (including duplicates that still have a candidate ID)
  const isPendingExtraction = document.id_extraction_status === "pending";
  const needsManualId =
    !isPendingExtraction &&
    (document.id_extraction_status === "error" || !document.extracted_id);
  const canPreviewExtraction =
    enableReductoPreview &&
    (document.scores_extraction_status === "success" ||
      document.scores_extraction_status === "processing") &&
    !!document.scores_extraction_data;

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

  // Reset per-document UI when the document changes (keep Preview Data open across next/prev)
  useEffect(() => {
    setManualId(document.extracted_id || "");
    setImageError(false);
    setImageLoading(true);
    setIdError(null);
    setExtractionData(null);
  }, [document.id, document.extracted_id]);

  // Close preview only when the dialog itself closes
  useEffect(() => {
    if (open === false) {
      setShowExtractionPanel(false);
      setExtractionData(null);
      setExtractionViewMode("table");
    }
  }, [open]);

  // Reload extraction data when navigating while Preview Data is open
  useEffect(() => {
    if (!showExtractionPanel || open === false) {
      return;
    }

    const hasExtractionData = !!document.scores_extraction_data;
    if (!hasExtractionData) {
      setExtractionData(null);
      setLoadingExtraction(false);
      return;
    }

    let cancelled = false;
    setLoadingExtraction(true);
    setExtractionData(null);

    void getReductoData(document.id)
      .then((data) => {
        if (!cancelled) {
          setExtractionData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to load preview data";
          toast.error(errorMessage);
          console.error("Error loading preview:", err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExtraction(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document.id, document.scores_extraction_data, showExtractionPanel, open]);

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
    if (open === false || !document) return;
    if (!documents || !onNavigate || currentIndex === undefined) return;

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
  }, [open, currentIndex, documents, onNavigate, onClose, document]);

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
        await downloadDocument(document.id, getDocumentDownloadFilename(document));
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

    // Parse ID components: SCHOOL_NUMERIC_PREFIX(6) + SUBJECT_CODE(3) + SUBJECT_SERIES(1) + TEST_TYPE(1) + SHEET_NUMBER(2)
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

    // Match sheet ID school segment to `School.s_code` (same padding as backend `generate_sheet_id`)
    const school = schools.find((s) => schoolPrefixForSheetId(s.s_code) === schoolCode);
    if (!school) {
      return { error: `School numeric prefix ${schoolCode} not found` };
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

  const handleRetryExtract = async () => {
    setRetryingExtract(true);
    try {
      const result = await extractDocumentId(document.id);
      if (result.is_valid) {
        toast.success(`Extracted ID: ${result.extracted_id}`);
        if (onUpdateId && result.extracted_id) {
          // Parent refresh path — pass extracted values so list updates
          await onUpdateId(document.id, result.extracted_id);
        }
      } else {
        toast.error(result.error_message || "Extraction failed again");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry extraction failed");
    } finally {
      setRetryingExtract(false);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(document.id);
    }
  };

  const handleToggleExtractionPanel = () => {
    if (showExtractionPanel) {
      setShowExtractionPanel(false);
      return;
    }

    if (!document.scores_extraction_data) {
      toast.error("No extraction data available for this document");
      return;
    }

    setShowExtractionPanel(true);
  };

  const handlePrevious = () => {
    if (documents && onNavigate && currentIndex !== undefined && currentIndex > 0 && currentIndex < documents.length) {
      onNavigate(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (documents && onNavigate && currentIndex !== undefined && currentIndex >= 0 && currentIndex < documents.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  return (
    <Dialog open={open !== false} onOpenChange={onClose}>
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
              {needsManualId && document.id_extraction_status === "error" && (
                <span className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">
                  {getIdExtractionErrorBadgeLabel(document.id_extraction_error_code)}
                </span>
              )}
              {needsManualId && document.id_extraction_status !== "error" && (
                <span className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">
                  ID Extraction Failed
                </span>
              )}
            </div>
            {document.id_extraction_status === "error" && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {getIdExtractionErrorTitle(document.id_extraction_error_code)}
                    </p>
                    {document.id_extraction_error && (
                      <p className="mt-0.5 text-muted-foreground">{document.id_extraction_error}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5"
                    onClick={handleRetryExtract}
                    disabled={retryingExtract}
                  >
                    {retryingExtract ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {isPendingExtraction && (
              <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                ID extraction is still processing. Manual entry is available after it finishes or fails.
              </div>
            )}
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
            {document.scores_applied_at && (
              <Badge className="border-transparent bg-green-600 text-white">
                Applied
                {document.scores_applied_count != null ? ` · ${document.scores_applied_count}` : ""}
              </Badge>
            )}
            {(canPreviewExtraction || showExtractionPanel) && (
              <Button
                variant={showExtractionPanel ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleToggleExtractionPanel}
                disabled={loadingExtraction || (!showExtractionPanel && !canPreviewExtraction)}
              >
                {loadingExtraction ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : showExtractionPanel ? (
                  <>
                    <PanelRightClose className="h-4 w-4" />
                    Hide Data
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Preview Data
                  </>
                )}
              </Button>
            )}
            {onUpdateScores &&
              document.scores_extraction_status === "success" &&
              !showExtractionPanel && (
              <Button
                variant={document.scores_applied_at ? "outline" : "default"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => onUpdateScores(document)}
                disabled={updatingScores}
              >
                {updatingScores ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    {document.scores_applied_at ? "Re-apply Scores" : "Apply Scores"}
                  </>
                )}
              </Button>
            )}
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
        <div className={`flex-1 min-h-0 overflow-hidden bg-muted/30 relative flex ${showExtractionPanel ? "flex-row" : "flex-col"}`}>
          <div className={`relative overflow-auto p-6 ${showExtractionPanel ? "flex-1 border-r border-border" : "flex-1"}`}>
            {/* Navigation Buttons */}
            {documents && documents.length > 1 && currentIndex !== undefined && currentIndex >= 0 && (
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
            {documents && documents.length > 1 && currentIndex !== undefined && currentIndex >= 0 && (
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

          {showExtractionPanel && (
            <div className="flex w-full max-w-xl flex-col overflow-hidden bg-background sm:w-1/2">
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">Extracted Data</h3>
                  <p className="truncate text-xs text-muted-foreground">{document.file_name}</p>
                  {document.scores_applied_at && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Applied {new Date(document.scores_applied_at).toLocaleString()}
                      {document.scores_applied_count != null
                        ? ` · ${document.scores_applied_count} scores`
                        : ""}
                    </p>
                  )}
                </div>
                {onUpdateScores && document.scores_extraction_status === "success" && (
                  <Button
                    variant={document.scores_applied_at ? "outline" : "default"}
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    onClick={() => onUpdateScores(document)}
                    disabled={updatingScores}
                  >
                    {updatingScores ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        {document.scores_applied_at ? "Re-apply" : "Apply Scores"}
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {loadingExtraction ? (
                  <div className="flex h-48 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : extractionData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-medium">Status:</span> {extractionData.status}
                      </div>
                      <div>
                        <span className="font-medium">Confidence:</span>{" "}
                        {extractionData.confidence
                          ? `${(extractionData.confidence * 100).toFixed(1)}%`
                          : "N/A"}
                      </div>
                      {extractionData.extracted_at && (
                        <div className="col-span-2">
                          <span className="font-medium">Extracted At:</span>{" "}
                          {new Date(extractionData.extracted_at).toLocaleString()}
                        </div>
                      )}
                    </div>

                    <Tabs
                      value={extractionViewMode}
                      onValueChange={(value) => setExtractionViewMode(value as "table" | "json")}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="table">Table View</TabsTrigger>
                        <TabsTrigger value="json">JSON / Raw</TabsTrigger>
                      </TabsList>

                      <TabsContent value="table" className="mt-4">
                        {(() => {
                          const candidates = parseCandidatesFromData(extractionData.data);
                          if (candidates.length > 0) {
                            return (
                              <div>
                                <h4 className="mb-2 text-sm font-medium">
                                  Candidates ({candidates.length})
                                </h4>
                                <div className="max-h-[calc(95vh-22rem)] overflow-auto rounded-lg border">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>SN</TableHead>
                                        <TableHead>Index Number</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Attendance</TableHead>
                                        <TableHead>Score</TableHead>
                                        <TableHead>Verify</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {candidates.map((candidate: any, idx: number) => (
                                        <TableRow key={idx}>
                                          <TableCell>{candidate.sn || idx + 1}</TableCell>
                                          <TableCell>{candidate.index_number || "-"}</TableCell>
                                          <TableCell>{candidate.candidate_name || "-"}</TableCell>
                                          <TableCell>
                                            {candidate.attend
                                              ? typeof candidate.attend === "string" &&
                                                (candidate.attend === "A" || candidate.attend === "AA")
                                                ? candidate.attend
                                                : "✓"
                                              : "-"}
                                          </TableCell>
                                          <TableCell>
                                            {candidate.score === null || candidate.score === undefined || candidate.score === ""
                                              ? "-"
                                              : String(candidate.score)}
                                          </TableCell>
                                          <TableCell>
                                            {candidate.verify === null ||
                                            candidate.verify === undefined ||
                                            candidate.verify === ""
                                              ? "-"
                                              : typeof candidate.verify === "string" &&
                                                  (candidate.verify === "A" || candidate.verify === "AA")
                                                ? candidate.verify
                                                : candidate.verify === true ||
                                                    candidate.verify === "✓" ||
                                                    candidate.verify === "✔" ||
                                                    candidate.verify === "√"
                                                  ? "✓"
                                                  : String(candidate.verify)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="text-sm text-muted-foreground">
                              <p>No candidate data available in table format.</p>
                              <p className="mt-2 text-xs">
                                Try the JSON view for the raw extraction payload.
                              </p>
                            </div>
                          );
                        })()}
                      </TabsContent>

                      <TabsContent value="json" className="mt-4">
                        <pre className="max-h-[calc(95vh-22rem)] overflow-auto rounded bg-muted p-3 text-xs">
                          {JSON.stringify(extractionData.data, null, 2)}
                        </pre>
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No preview data available</p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
