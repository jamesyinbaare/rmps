"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, File, Image as ImageIcon, FileText, Download, Trash2, Save, Loader2, X, Eye, RefreshCw, PanelRightClose, Send, Pencil, MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
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
import {
  applyScoresActionLabel,
  extractionFor,
  extractionProviderLabel,
  successfulExtractionProviders,
  type Document,
  type Exam,
  type ExtractionProvider,
  type IdExtractionConflictItem,
  type School,
  type Subject,
  type ReductoDataResponse,
} from "@/types/document";
import { ExtractionApplyBadge } from "@/components/data-entry/ExtractionAppliedBadge";
import { cn, formatFileSize } from "@/lib/utils";
import {
  getIdExtractionErrorBadgeLabel,
  getIdExtractionErrorTitle,
  parseDuplicateConflictDocumentId,
} from "@/lib/id-extraction-errors";
import { DocumentIdBreakdown } from "@/components/DocumentIdBreakdown";
import {
  DocumentPaperIdentity,
  documentHasSheetChangeMarker,
  documentPaperLabel,
} from "@/components/DocumentStatusMeta";
import { ScoreMigrationConfirmDialog } from "@/components/ScoreMigrationConfirmDialog";
import { parseDocumentIdParts, validateDocumentId } from "@/lib/document-id";
import {
  API_BASE_URL,
  downloadDocument,
  extractDocumentId,
  getDocument,
  getDocumentDownloadFilename,
  getDocumentIdExtractionConflicts,
  getDocumentPaperCounterpart,
  getExam,
  getReductoData,
  listSchools,
  listSubjects,
  previewScoreMigration,
  updateDocumentId,
  parseOwnershipConflictDocumentId,
  type ScoreMigrationPreviewResponse,
} from "@/lib/api";
import { toast } from "sonner";
import { DuplicateConflictPanel } from "./DuplicateConflictPanel";
import { PaperCounterpartPanel } from "./PaperCounterpartPanel";

interface DocumentViewerProps {
  document: Document;
  documents?: Document[];
  currentIndex?: number;
  open?: boolean;
  onClose: () => void;
  onNavigate?: (index: number) => void;
  onDownload?: (document: Document) => void;
  onUpdateId?: (
    documentId: number,
    extractedId: string,
    schoolId?: number,
    subjectId?: number,
    options?: { advance?: boolean; overwrite_scores?: boolean }
  ) => Promise<void>;
  onDelete?: (documentId: number) => Promise<void>;
  /** Show Preview Data toggle that opens extraction panel inside this viewer */
  enableReductoPreview?: boolean;
  /** Open the extraction preview panel immediately when the viewer opens */
  initialShowExtractionPanel?: boolean;
  /** Prefer this provider when both extracts exist (e.g. Apply page filter). */
  preferredProvider?: ExtractionProvider;
  onUpdateScores?: (document: Document, provider?: ExtractionProvider) => void;
  updatingScores?: boolean;
  /** Increment to reload duplicate conflict documents (e.g. after deleting one). */
  conflictRefreshKey?: number;
  /** Errors-view resolution queue: show progress and advance after fixes. */
  resolutionQueueMode?: boolean;
  /** Total items in the filtered error queue (from list API). */
  queueTotal?: number;
  /** Label for queue progress, e.g. Duplicate or Error. */
  queueLabel?: string;
  /** After conflict-side delete or ID fix; parent may auto-retry and advance. */
  onConflictSideResolved?: () => Promise<void>;
  /** Side-by-side Paper 1 vs Paper 2 counterpart comparison. */
  paperCompareMode?: boolean;
  /** After counterpart-side ID change or delete; parent may refresh. */
  onPaperCounterpartChanged?: () => Promise<void>;
  /**
   * When set, force DuplicateConflictPanel for ID ownership clashes
   * (even if extraction error_code is not "duplicate").
   */
  ownershipConflictDocs?: Document[] | null;
  /** Called when ownership compare should clear (ID fixed / dismissed). */
  onOwnershipConflictCleared?: () => void;
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
  initialShowExtractionPanel = false,
  preferredProvider,
  onUpdateScores,
  updatingScores,
  conflictRefreshKey = 0,
  resolutionQueueMode = false,
  queueTotal,
  queueLabel = "Error",
  onConflictSideResolved,
  paperCompareMode = false,
  onPaperCounterpartChanged,
  ownershipConflictDocs = null,
  onOwnershipConflictCleared,
}: DocumentViewerProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [examName, setExamName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [editingId, setEditingId] = useState(false);
  const [savingId, setSavingId] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationPreview, setMigrationPreview] =
    useState<ScoreMigrationPreviewResponse | null>(null);
  const [pendingMigration, setPendingMigration] = useState<{
    extractedId: string;
    schoolId?: number;
    subjectId?: number;
    advance?: boolean;
  } | null>(null);
  const [retryingExtract, setRetryingExtract] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showExtractionPanel, setShowExtractionPanel] = useState(initialShowExtractionPanel);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [extractionData, setExtractionData] = useState<ReductoDataResponse | null>(null);
  const [extractionViewMode, setExtractionViewMode] = useState<"table" | "json">("table");
  const [previewProvider, setPreviewProvider] = useState<ExtractionProvider | undefined>();
  const [conflictDocs, setConflictDocs] = useState<Document[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [conflictReloadToken, setConflictReloadToken] = useState(0);
  const [retryStillDuplicate, setRetryStillDuplicate] = useState(false);
  const [paperCounterpart, setPaperCounterpart] = useState<IdExtractionConflictItem | null>(
    null
  );
  const [loadingPaperCounterpart, setLoadingPaperCounterpart] = useState(false);
  const [paperCounterpartReloadToken, setPaperCounterpartReloadToken] = useState(0);
  const [localOwnershipPeers, setLocalOwnershipPeers] = useState<Document[] | null>(null);

  useEffect(() => {
    setLocalOwnershipPeers(null);
  }, [document?.id]);
  const manualIdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open !== false && initialShowExtractionPanel) {
      setShowExtractionPanel(true);
    }
  }, [open, initialShowExtractionPanel, document?.id]);

  // Guard against undefined/null document
  if (!document) {
    return null;
  }

  const previewUrl = `${API_BASE_URL}/api/v1/documents/${document.id}/download`;
  const displayText = document.extracted_id || document.file_name;
  // Allow manual correction for any failed extraction (including duplicates that still have a candidate ID)
  const isPendingExtraction = document.id_extraction_status === "pending";
  const isDuplicateError = document.id_extraction_error_code === "duplicate";
  const ownershipPeers = ownershipConflictDocs ?? localOwnershipPeers;
  const showOwnershipCompare = Boolean(ownershipPeers && ownershipPeers.length > 0);
  const showDuplicateCompare = isDuplicateError || showOwnershipCompare;
  const showPaperCompare = paperCompareMode && !showDuplicateCompare;
  const needsManualId =
    !isPendingExtraction &&
    (document.id_extraction_status === "error" || !document.extracted_id);
  const canEditExtractedId = !isPendingExtraction && !needsManualId && !!document.extracted_id;
  const showIdForm =
    (needsManualId || editingId) && !showDuplicateCompare && !showPaperCompare;
  const idUnchanged =
    canEditExtractedId && manualId.trim() === (document.extracted_id || "");
  // List endpoints omit scores_extraction_data; gate on status and load via getReductoData.
  const providerOptions = successfulExtractionProviders(document);
  const canPreviewExtraction = !!enableReductoPreview && providerOptions.length > 0;
  const activeProvider: ExtractionProvider | undefined =
    (previewProvider && providerOptions.includes(previewProvider)
      ? previewProvider
      : undefined) ||
    (preferredProvider && providerOptions.includes(preferredProvider)
      ? preferredProvider
      : undefined) ||
    providerOptions[0] ||
    (document.scores_extraction_provider === "llama" || document.scores_extraction_provider === "reducto"
      ? document.scores_extraction_provider
      : undefined);
  const activeExtraction = extractionFor(document, activeProvider);

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
    setEditingId(false);
    setImageError(false);
    setImageLoading(true);
    setIdError(null);
    setExtractionData(null);
    setPreviewProvider(undefined);
    setRetryStillDuplicate(false);
  }, [document.id, document.extracted_id]);

  // Autofocus ID field when manual entry is required
  useEffect(() => {
    if (!showIdForm) return;
    const t = window.setTimeout(() => manualIdInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [showIdForm, document.id]);

  useEffect(() => {
    if (open === false || document.id_extraction_error_code !== "duplicate") {
      setConflictDocs([]);
      setLoadingConflicts(false);
      return;
    }

    let cancelled = false;
    setLoadingConflicts(true);

    const loadConflicts = async () => {
      const ids: number[] = [];
      try {
        const response = await getDocumentIdExtractionConflicts(document.id);
        ids.push(...response.items.map((item) => item.id));
      } catch (error) {
        console.error("Failed to load duplicate conflicts:", error);
      }

      const fallback =
        document.id_extraction_conflict_document_id ??
        parseDuplicateConflictDocumentId(document.id_extraction_error);
      if (fallback) {
        ids.push(fallback);
      }

      const uniqueIds = [...new Set(ids.filter((id) => id !== document.id))];
      const loaded = await Promise.all(
        uniqueIds.map((id) => getDocument(id).catch(() => null))
      );
      if (!cancelled) {
        setConflictDocs(loaded.filter((item): item is Document => item != null));
        setLoadingConflicts(false);
      }
    };

    void loadConflicts();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    document.id,
    document.id_extraction_error_code,
    document.id_extraction_conflict_document_id,
    document.id_extraction_error,
    conflictRefreshKey,
    conflictReloadToken,
  ]);

  useEffect(() => {
    if (open === false || !paperCompareMode || document.id_extraction_error_code === "duplicate") {
      setPaperCounterpart(null);
      setLoadingPaperCounterpart(false);
      return;
    }

    let cancelled = false;
    setLoadingPaperCounterpart(true);

    const loadCounterpart = async () => {
      try {
        const response = await getDocumentPaperCounterpart(document.id);
        if (!cancelled) {
          setPaperCounterpart(response.counterpart);
        }
      } catch (error) {
        console.error("Failed to load paper counterpart:", error);
        if (!cancelled) {
          setPaperCounterpart(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPaperCounterpart(false);
        }
      }
    };

    void loadCounterpart();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    document.id,
    paperCompareMode,
    document.id_extraction_error_code,
    conflictRefreshKey,
    paperCounterpartReloadToken,
  ]);

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

    if (document.scores_extraction_status !== "success" && providerOptions.length === 0) {
      setExtractionData(null);
      setLoadingExtraction(false);
      return;
    }

    let cancelled = false;
    setLoadingExtraction(true);
    setExtractionData(null);

    void getReductoData(document.id, activeProvider)
      .then((data) => {
        if (!cancelled) {
          setExtractionData(data);
          if (data.provider === "llama" || data.provider === "reducto") {
            setPreviewProvider(data.provider);
          }
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
  }, [document.id, document.scores_extraction_status, showExtractionPanel, open, activeProvider]);

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
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }

      const goPrev =
        (e.key === "ArrowLeft" || e.key === "k" || e.key === "K") &&
        currentIndex > 0 &&
        currentIndex < documents.length;
      const goNext =
        (e.key === "ArrowRight" || e.key === "j" || e.key === "J") &&
        currentIndex >= 0 &&
        currentIndex < documents.length - 1;

      if (goPrev) {
        e.preventDefault();
        onNavigate(currentIndex - 1);
      } else if (goNext) {
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
    return validateDocumentId(id, schools, subjects);
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

  const openOwnershipCompare = async (
    conflictDocumentId: number,
    options?: { keepSheetChangePending?: boolean }
  ) => {
    try {
      const peer = await getDocument(conflictDocumentId);
      setLocalOwnershipPeers([peer]);
      setMigrationOpen(false);
      if (!options?.keepSheetChangePending) {
        setPendingMigration(null);
        setMigrationPreview(null);
      }
      toast.message("ID already in use — compare sheets side by side");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load conflicting document"
      );
    }
  };

  const clearOwnershipCompare = () => {
    setLocalOwnershipPeers(null);
    onOwnershipConflictCleared?.();
  };

  const resumeSheetChangeReview = async () => {
    if (!pendingMigration) return;
    setLocalOwnershipPeers(null);
    setSavingId(true);
    try {
      const preview = await previewScoreMigration(document.id, {
        extracted_id: pendingMigration.extractedId,
        school_id: pendingMigration.schoolId,
        subject_id: pendingMigration.subjectId,
      });
      setMigrationPreview(preview);
      setMigrationOpen(true);
      toast.message("Back to sheet change review");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to refresh sheet change preview"
      );
      setPendingMigration(null);
      setMigrationPreview(null);
    } finally {
      setSavingId(false);
    }
  };

  const formatSheetUpdatedToast = (
    moved: number,
    meta?: {
      subjectName?: string | null;
      paperLabel?: string | null;
      replaced?: number;
    }
  ) => {
    if (moved <= 0) return "Sheet updated (no applied scores)";
    const dest = [meta?.subjectName, meta?.paperLabel].filter(Boolean).join(" · ");
    let msg = dest
      ? `Sheet updated · moved ${moved} score${moved === 1 ? "" : "s"} to ${dest}`
      : `Sheet updated · moved ${moved} score${moved === 1 ? "" : "s"}`;
    if (meta?.replaced && meta.replaced > 0) {
      msg += ` · replaced ${meta.replaced} existing`;
    }
    return msg;
  };

  const commitIdUpdate = async (
    extractedId: string,
    schoolId: number | undefined,
    subjectId: number | undefined,
    options?: { advance?: boolean; overwrite_scores?: boolean }
  ) => {
    const destSubject =
      migrationPreview?.to_meta.subject_name ||
      subjects.find((s) => s.id === subjectId)?.name ||
      null;
    const destPaper = migrationPreview?.to_meta.paper_label || null;
    const replacedCount = options?.overwrite_scores
      ? migrationPreview?.conflicts.length ?? 0
      : 0;

    if (onUpdateId) {
      await onUpdateId(document.id, extractedId, schoolId, subjectId, options);
    } else {
      const updated = await updateDocumentId(
        document.id,
        extractedId,
        schoolId,
        subjectId,
        { overwrite_scores: options?.overwrite_scores }
      );
      const moved = updated.scores_moved ?? 0;
      toast.success(
        formatSheetUpdatedToast(moved, {
          subjectName: destSubject,
          paperLabel: destPaper,
          replaced: replacedCount,
        })
      );
    }
    setEditingId(false);
    setPendingMigration(null);
    setMigrationPreview(null);
    if (!onUpdateId) {
      clearOwnershipCompare();
    }
  };

  const handleSaveId = async () => {
    const trimmedId = manualId.trim();

    if (!trimmedId) {
      setIdError("Please enter a document ID");
      return;
    }

    if (canEditExtractedId && trimmedId === (document.extracted_id || "")) {
      return;
    }

    const validation = validateId(trimmedId);
    if (validation.error) {
      setIdError(validation.error);
      toast.error(validation.error);
      return;
    }

    const advanceOpt =
      editingId && !needsManualId ? false : undefined;

    const oldId = document.extracted_id || "";
    const oldParts = parseDocumentIdParts(oldId);
    const newParts = parseDocumentIdParts(trimmedId);
    const subjectChanged =
      Boolean(oldParts.subjectCode || newParts.subjectCode) &&
      oldParts.subjectCode !== newParts.subjectCode;
    const oldPaper = document.test_type || oldParts.testType;
    const paperChanged =
      Boolean(oldPaper || newParts.testType) && oldPaper !== newParts.testType;

    setSavingId(true);
    setIdError(null);
    try {
      if (subjectChanged || paperChanged) {
        const preview = await previewScoreMigration(document.id, {
          extracted_id: trimmedId,
          school_id: validation.schoolId,
          subject_id: validation.subjectId,
        });
        // Always open sheet-change review so clerks see before→after (including blockers)
        setMigrationPreview(preview);
        setPendingMigration({
          extractedId: trimmedId,
          schoolId: validation.schoolId,
          subjectId: validation.subjectId,
          advance: advanceOpt,
        });
        setMigrationOpen(true);
        return;
      }

      await commitIdUpdate(trimmedId, validation.schoolId, validation.subjectId, {
        advance: advanceOpt,
      });
    } catch (error) {
      const conflictId = parseOwnershipConflictDocumentId(error);
      if (conflictId != null) {
        await openOwnershipCompare(conflictId);
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update document ID";
      setIdError(errorMessage);
      toast.error(errorMessage);
      console.error("Error updating document ID:", error);
    } finally {
      setSavingId(false);
    }
  };

  const handleConfirmMigration = async (overwrite: boolean) => {
    if (!pendingMigration) return;
    setSavingId(true);
    try {
      await commitIdUpdate(
        pendingMigration.extractedId,
        pendingMigration.schoolId,
        pendingMigration.subjectId,
        {
          advance: pendingMigration.advance,
          overwrite_scores: overwrite,
        }
      );
      setMigrationOpen(false);
    } catch (error) {
      const conflictId = parseOwnershipConflictDocumentId(error);
      if (conflictId != null) {
        await openOwnershipCompare(conflictId, { keepSheetChangePending: true });
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update document ID";
      setIdError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSavingId(false);
    }
  };

  const handleRetryExtract = async (options?: { advance?: boolean }) => {
    setRetryingExtract(true);
    setRetryStillDuplicate(false);
    try {
      const result = await extractDocumentId(document.id);
      if (result.is_valid) {
        toast.success(`Extracted ID: ${result.extracted_id}`);
        if (onUpdateId && result.extracted_id) {
          const shouldAdvance =
            options?.advance ?? (resolutionQueueMode ? true : false);
          await onUpdateId(document.id, result.extracted_id, undefined, undefined, {
            advance: shouldAdvance,
          });
        }
      } else {
        setRetryStillDuplicate(isDuplicateError);
        toast.error(result.error_message || "Extraction failed again");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry extraction failed");
    } finally {
      setRetryingExtract(false);
      if (document.id_extraction_error_code === "duplicate") {
        setConflictReloadToken((n) => n + 1);
      }
    }
  };

  const handleConflictSideResolved = async () => {
    if (onConflictSideResolved) {
      await onConflictSideResolved();
      return;
    }
    setConflictReloadToken((n) => n + 1);
  };

  const handlePaperCounterpartChanged = async () => {
    if (onPaperCounterpartChanged) {
      await onPaperCounterpartChanged();
      return;
    }
    setPaperCounterpartReloadToken((n) => n + 1);
  };

  const handleDelete = (documentId: number = document.id) => {
    if (onDelete) {
      onDelete(documentId);
    }
  };

  const handleToggleExtractionPanel = () => {
    if (showExtractionPanel) {
      setShowExtractionPanel(false);
      return;
    }

    if (!canPreviewExtraction) {
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

  const showQueueChrome =
    resolutionQueueMode &&
    documents &&
    documents.length > 0 &&
    currentIndex !== undefined &&
    currentIndex >= 0;
  const queuePosition = showQueueChrome ? currentIndex + 1 : 0;
  const queueSize = queueTotal ?? documents?.length ?? 0;
  const canQueuePrev = showQueueChrome && currentIndex > 0;
  const canQueueNext =
    showQueueChrome && currentIndex >= 0 && currentIndex < (documents?.length ?? 0) - 1;

  const focusIdSegment = (start: number, end: number) => {
    const input = manualIdInputRef.current;
    if (!input) return;
    input.focus();
    const safeEnd = Math.min(end, manualId.length);
    const safeStart = Math.min(start, safeEnd);
    input.setSelectionRange(safeStart, safeEnd || safeStart);
  };

  const floatingActions = (
    <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/90 p-1 shadow-md backdrop-blur-sm">
      {showQueueChrome && (
        <>
          <span className="hidden px-1.5 text-[11px] tabular-nums text-muted-foreground sm:inline">
            {queueLabel} {queuePosition}/{queueSize.toLocaleString()}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={handlePrevious}
            disabled={!canQueuePrev}
            aria-label="Previous"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={handleNext}
            disabled={!canQueueNext}
            aria-label="Next"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        </>
      )}
      {activeExtraction && <ExtractionApplyBadge row={activeExtraction} />}
      {!activeExtraction && document.scores_applied_at && (
        <Badge className="h-6 border-transparent bg-primary text-[10px] text-primary-foreground">
          Applied
          {document.scores_applied_count != null ? ` · ${document.scores_applied_count}` : ""}
        </Badge>
      )}
      {(canPreviewExtraction || showExtractionPanel) && (
        <Button
          variant={showExtractionPanel ? "secondary" : "ghost"}
          size="icon-sm"
          className="h-7 w-7"
          onClick={handleToggleExtractionPanel}
          disabled={loadingExtraction || (!showExtractionPanel && !canPreviewExtraction)}
          aria-label={showExtractionPanel ? "Hide data" : "Preview data"}
        >
          {loadingExtraction ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : showExtractionPanel ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      {onUpdateScores &&
        (document.scores_extraction_status === "success" || providerOptions.length > 0) &&
        !showExtractionPanel && (
          <Button
            variant={activeExtraction?.current_applied ? "ghost" : "default"}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onUpdateScores(document, activeProvider)}
            disabled={updatingScores}
          >
            {updatingScores ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="hidden lg:inline">
              {applyScoresActionLabel(activeProvider, {
                reapply: !!activeExtraction?.current_applied,
              })}
            </span>
          </Button>
        )}
      {(document.id_extraction_status === "error" ||
        isDuplicateError ||
        (onDelete && !isDuplicateError) ||
        (canEditExtractedId && !editingId)) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="h-7 w-7" aria-label="More actions">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEditExtractedId && !editingId && (
              <DropdownMenuItem
                onClick={() => {
                  setManualId(document.extracted_id || "");
                  setIdError(null);
                  setEditingId(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit ID
              </DropdownMenuItem>
            )}
            {(document.id_extraction_status === "error" || isDuplicateError) && (
              <DropdownMenuItem
                onClick={() => void handleRetryExtract()}
                disabled={retryingExtract}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry extraction
              </DropdownMenuItem>
            )}
            {onDelete && !isDuplicateError && (
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete()}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleDownload}
        className="h-7 w-7"
        aria-label="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        className="h-7 w-7"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <>
    <Dialog open={open !== false} onOpenChange={onClose}>
      <DialogContent
        className="flex h-[95vh] max-h-[95vh] w-screen min-w-[80vw] flex-col overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Document Viewer - {displayText}</DialogTitle>

        {showDuplicateCompare ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  {showOwnershipCompare && !isDuplicateError ? "ID conflict" : "Duplicate"}
                </span>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={document.id_extraction_error || undefined}
                >
                  {showOwnershipCompare && !isDuplicateError
                    ? "Another document already uses this sheet ID"
                    : document.id_extraction_error || "Duplicate sheet ID"}
                </p>
              </div>
              {floatingActions}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <DuplicateConflictPanel
                current={document}
                conflicts={showOwnershipCompare ? ownershipPeers ?? [] : conflictDocs}
                loading={showOwnershipCompare ? false : loadingConflicts}
                schools={schools}
                subjects={subjects}
                currentTitle={
                  showOwnershipCompare && !isDuplicateError
                    ? "This document"
                    : "This upload"
                }
                conflictTitle={
                  showOwnershipCompare && !isDuplicateError
                    ? "Already uses this ID"
                    : "Already in the system"
                }
                emptyConflictHint={
                  showOwnershipCompare && !isDuplicateError
                    ? "Change either document’s ID to resolve the conflict."
                    : undefined
                }
                onDelete={onDelete ? handleDelete : undefined}
                onUpdateId={async (documentId, extractedId, schoolId, subjectId, options) => {
                  if (onUpdateId) {
                    await onUpdateId(
                      documentId,
                      extractedId,
                      schoolId,
                      subjectId,
                      options
                    );
                  } else {
                    await updateDocumentId(
                      documentId,
                      extractedId,
                      schoolId,
                      subjectId
                    );
                    toast.success("Document ID updated successfully");
                  }
                  setConflictReloadToken((n) => n + 1);
                  if (
                    showOwnershipCompare &&
                    !isDuplicateError &&
                    pendingMigration &&
                    documentId === document.id
                  ) {
                    setPendingMigration(null);
                    setMigrationPreview(null);
                    clearOwnershipCompare();
                    return;
                  }
                  if (!onUpdateId && showOwnershipCompare && !isDuplicateError) {
                    clearOwnershipCompare();
                  }
                }}
                onConflictSideResolved={() => {
                  if (showOwnershipCompare && !isDuplicateError) {
                    if (pendingMigration) {
                      void resumeSheetChangeReview();
                      return;
                    }
                    setLocalOwnershipPeers(null);
                    if (onConflictSideResolved) {
                      void onConflictSideResolved();
                    }
                    return;
                  }
                  void handleConflictSideResolved();
                }}
              />
            </div>
          </div>
        ) : showPaperCompare ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  Paper pair
                </span>
                <p className="truncate text-xs text-muted-foreground">
                  Compare Paper 1 (Objectives) and Paper 2 (Essay) for the same sheet
                </p>
              </div>
              {floatingActions}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <PaperCounterpartPanel
                current={document}
                counterpart={paperCounterpart}
                loading={loadingPaperCounterpart}
                schools={schools}
                subjects={subjects}
                onDelete={onDelete ? handleDelete : undefined}
                onUpdateId={
                  onUpdateId ??
                  (async (documentId, extractedId, schoolId, subjectId) => {
                    await updateDocumentId(documentId, extractedId, schoolId, subjectId);
                    toast.success("Document ID updated successfully");
                    setPaperCounterpartReloadToken((n) => n + 1);
                  })
                }
                onCounterpartChanged={() => void handlePaperCounterpartChanged()}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-background px-3 py-2">
              <div className="min-w-0 flex-1 space-y-1">
                {!showIdForm ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-mono text-sm font-semibold tracking-wide">
                        {document.extracted_id || "—"}
                      </p>
                      {document.id_extraction_method && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getExtractionMethodBadgeClass(document.id_extraction_method)}`}
                        >
                          {getExtractionMethodLabel(document.id_extraction_method)}
                        </span>
                      )}
                      {documentHasSheetChangeMarker(document) && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 ring-1 ring-amber-500/25">
                          <DocumentPaperIdentity
                            document={document}
                            textClassName="text-[11px]"
                          />
                        </span>
                      )}
                    </div>
                    {(schoolName || subjectName || documentPaperLabel(document.test_type)) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          schoolName,
                          subjectName,
                          documentPaperLabel(document.test_type),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {needsManualId ? "Enter sheet ID" : "Edit sheet ID"}
                    {document.extracted_id ? (
                      <>
                        {" · "}
                        <span className="font-mono text-foreground">
                          {document.extracted_id}
                        </span>
                      </>
                    ) : null}
                  </p>
                )}
              </div>
              <div className="shrink-0">{floatingActions}</div>
            </div>

            <div
              className={cn(
                "relative flex min-h-0 flex-1",
                showExtractionPanel ? "flex-row" : "flex-col"
              )}
            >
              <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950">

                {documents &&
                  documents.length > 1 &&
                  currentIndex !== undefined &&
                  currentIndex >= 0 &&
                  !showQueueChrome && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handlePrevious}
                        disabled={currentIndex === 0}
                        className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 opacity-90"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleNext}
                        disabled={currentIndex === documents.length - 1}
                        className="absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 opacity-90"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </>
                  )}

                <div className="flex h-full w-full items-center justify-center p-2">
                  {imageLoading && !imageError && document.mime_type.startsWith("image/") && (
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                  )}
                  {!imageError && document.mime_type.startsWith("image/") ? (
                    <img
                      src={previewUrl}
                      alt={displayText}
                      className="max-h-full max-w-full object-contain"
                      onLoad={() => setImageLoading(false)}
                      onError={() => {
                        setImageError(true);
                        setImageLoading(false);
                      }}
                    />
                  ) : (
                    !imageLoading && (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                        <Icon className="mb-4 h-16 w-16" />
                        <p className="text-sm">Preview not available for this file type</p>
                        <p className="mt-2 text-xs">
                          {fileType} • {formatFileSize(document.file_size)}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>

              {showExtractionPanel && (
                <div className="flex w-full max-w-xl flex-col overflow-hidden bg-background sm:w-1/2">
                  <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium">Extracted Data</h3>
                      <p className="truncate text-xs text-muted-foreground">{document.file_name}</p>
                      {providerOptions.length > 1 && (
                        <div className="mt-2 flex gap-1">
                          {providerOptions.map((provider) => (
                            <Button
                              key={provider}
                              type="button"
                              size="sm"
                              variant={activeProvider === provider ? "secondary" : "outline"}
                              className="h-7"
                              onClick={() => setPreviewProvider(provider)}
                            >
                              {extractionProviderLabel(provider)}
                            </Button>
                          ))}
                        </div>
                      )}
                      {providerOptions.length === 1 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {extractionProviderLabel(activeProvider)}
                        </p>
                      )}
                      {activeExtraction && (
                        <div className="mt-1">
                          <ExtractionApplyBadge row={activeExtraction} />
                        </div>
                      )}
                    </div>
                    {onUpdateScores &&
                      (document.scores_extraction_status === "success" || providerOptions.length > 0) && (
                      <Button
                        variant={activeExtraction?.current_applied ? "outline" : "default"}
                        size="sm"
                        className="h-8 shrink-0 gap-1.5"
                        onClick={() => onUpdateScores(document, activeProvider)}
                        disabled={updatingScores}
                      >
                        {updatingScores ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Applying...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            {applyScoresActionLabel(activeProvider, {
                              reapply: !!activeExtraction?.current_applied,
                            })}
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
                          {typeof extractionData.data?.provider === "string" && (
                            <div>
                              <span className="font-medium">Provider:</span>{" "}
                              {extractionProviderLabel(extractionData.data.provider)}
                            </div>
                          )}
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

            {showIdForm && (
              <div className="z-20 shrink-0 border-t border-border bg-background/95 px-3 py-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
                <div className="mb-1.5 flex items-center gap-2">
                  {needsManualId && document.id_extraction_status === "error" && (
                    <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      {getIdExtractionErrorBadgeLabel(document.id_extraction_error_code)}
                    </span>
                  )}
                  {needsManualId && document.id_extraction_status !== "error" && (
                    <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      ID failed
                    </span>
                  )}
                  {document.id_extraction_status === "error" && (
                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                      {getIdExtractionErrorTitle(document.id_extraction_error_code)}
                      {document.id_extraction_error ? (
                        <span className="text-muted-foreground/70">
                          {" "}
                          — {document.id_extraction_error}
                        </span>
                      ) : null}
                    </p>
                  )}
                  {isPendingExtraction && (
                    <p className="text-xs text-muted-foreground">Extraction still running…</p>
                  )}
                  {retryStillDuplicate && (
                    <span className="text-[11px] text-destructive">Still duplicate</span>
                  )}
                  {showQueueChrome && (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      Skip leaves unresolved
                      <span className="hidden sm:inline"> · Ctrl+Enter</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="manual-id" className="sr-only">
                    Document ID
                  </label>
                  <div className="relative min-w-0 flex-1">
                    <Input
                      ref={manualIdInputRef}
                      id="manual-id"
                      type="text"
                      inputMode="numeric"
                      value={manualId}
                      onChange={(e) => handleIdChange(e.target.value)}
                      placeholder="13-digit sheet ID"
                      maxLength={13}
                      className="h-9 pr-12 font-mono text-sm tracking-widest"
                      aria-invalid={!!idError}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          if (showQueueChrome && canQueueNext) {
                            handleNext();
                          }
                          return;
                        }
                        if (e.key === "Enter") {
                          void handleSaveId();
                        }
                      }}
                    />
                    <span
                      className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-[11px] tabular-nums text-muted-foreground"
                      aria-hidden
                    >
                      {manualId.length}/13
                    </span>
                  </div>
                  <Button
                    onClick={() => void handleSaveId()}
                    disabled={savingId || !manualId.trim() || !!idError || idUnchanged}
                    className="h-9 shrink-0 gap-1.5"
                    size="sm"
                  >
                    {savingId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                  {showQueueChrome && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 gap-1"
                      onClick={handleNext}
                      disabled={!canQueueNext || savingId}
                      aria-label="Skip without resolving"
                    >
                      Skip
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {editingId && !needsManualId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => {
                        setManualId(document.extracted_id || "");
                        setIdError(null);
                        setEditingId(false);
                      }}
                      disabled={savingId}
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                {idError ? (
                  <p className="mt-1 text-xs text-destructive">{idError}</p>
                ) : (
                  <DocumentIdBreakdown
                    className="mt-1.5"
                    id={manualId}
                    schools={schools}
                    subjects={subjects}
                    onSegmentClick={focusIdSegment}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    <ScoreMigrationConfirmDialog
      open={migrationOpen}
      onOpenChange={(open) => {
        setMigrationOpen(open);
        if (!open) {
          setPendingMigration(null);
          setMigrationPreview(null);
        }
      }}
      preview={migrationPreview}
      loading={savingId}
      onConfirm={handleConfirmMigration}
      onCompareOwnership={
        migrationPreview?.conflict_document_id
          ? () =>
              void openOwnershipCompare(migrationPreview.conflict_document_id!, {
                keepSheetChangePending: true,
              })
          : undefined
      }
    />
    </>
  );
}
