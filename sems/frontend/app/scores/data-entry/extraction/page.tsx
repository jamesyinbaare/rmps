"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  ReductoDocumentsDataTable,
  type ExtractionStatusFilter,
  formatExtractionStatuses,
  parseExtractionStatuses,
} from "@/components/ReductoDocumentsDataTable";
import { DataEntryPipelineNav } from "@/components/DataEntryPipelineNav";
import { ScoreDocumentFiltersBar } from "@/components/data-entry/ScoreDocumentFiltersBar";
import { ExtractionStatusPills } from "@/components/data-entry/ExtractionStatusPills";
import { ExtractionContextStrip } from "@/components/data-entry/ExtractionContextStrip";
import type { SubjectCoverageStats } from "@/components/data-entry/SubjectCoverageBanner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  getFilteredDocuments,
  getScoresExtractionStatusCounts,
  getAllExams,
  listSchools,
  listExamSubjects,
  compareSheetIds,
  queueReductoExtraction,
  dequeueReductoExtraction,
  getReductoQueueStatus,
  updateReductoQueueWorkers,
  downloadDocument,
  getDocumentDownloadFilename,
} from "@/lib/api";
import type {
  Document,
  Exam,
  School,
  Subject,
  ScoreDocumentFilters,
  ExamType,
  ExamSeries,
  ScoresExtractionStatusCounts,
  ExtractionProvider,
} from "@/types/document";
import { DocumentViewer } from "@/components/DocumentViewer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BookOpen, Sparkles } from "lucide-react";
import {
  appendScopeToHref,
  clearResumeScope,
  parseOptionalInt,
  readResumeScope,
  writeResumeScope,
} from "@/lib/extraction-scope";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractionProviderLabel } from "@/types/document";

const EMPTY_COUNTS: ScoresExtractionStatusCounts = {
  total: 0,
  pending: 0,
  queued: 0,
  processing: 0,
  success: 0,
  error: 0,
  needs_id: 0,
};

function formatExamLabel(exam: Exam) {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${exam.year} ${exam.series} ${typeLabel}`;
}

export default function ReductoExtractionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status");
  const examIdFromUrl = parseOptionalInt(searchParams.get("exam_id"));
  const subjectIdFromUrl = parseOptionalInt(searchParams.get("subject_id"));
  const schoolIdFromUrl = parseOptionalInt(searchParams.get("school_id"));
  const initialStatuses = parseExtractionStatuses(statusFromUrl);
  const initialStatus =
    initialStatuses.length > 0 ? formatExtractionStatuses(initialStatuses) : "pending";

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>(() => {
    const initial: ScoreDocumentFilters = {
      page: 1,
      page_size: 50,
      extraction_status: initialStatus,
      id_ready: true,
    };
    if (examIdFromUrl) initial.exam_id = examIdFromUrl;
    if (subjectIdFromUrl) initial.subject_id = subjectIdFromUrl;
    if (schoolIdFromUrl) initial.school_id = schoolIdFromUrl;
    return initial;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<ScoresExtractionStatusCounts>(EMPTY_COUNTS);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());
  const [queuing, setQueuing] = useState(false);
  const [dequeuing, setDequeuing] = useState(false);
  const [requeueingDocumentId, setRequeueingDocumentId] = useState<number | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [countsLoaded, setCountsLoaded] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(examIdFromUrl);
  const resumeHydratedRef = useRef(false);

  const [coverageStats, setCoverageStats] = useState<SubjectCoverageStats | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [skipWithoutExtractedId, setSkipWithoutExtractedId] = useState(true);
  const [extractionProvider, setExtractionProvider] = useState<ExtractionProvider | null>(
    null
  );
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [queueDialogMode, setQueueDialogMode] = useState<"selected" | "all" | "requeue">(
    "selected"
  );
  const [queueDialogProvider, setQueueDialogProvider] = useState<ExtractionProvider | "">(
    ""
  );
  const [requeueDocumentId, setRequeueDocumentId] = useState<number | null>(null);
  const [concurrentWorkers, setConcurrentWorkers] = useState(4);
  const [workersMax, setWorkersMax] = useState(50);
  const [rateLimitPerSecond, setRateLimitPerSecond] = useState(10);
  const [updatingWorkers, setUpdatingWorkers] = useState(false);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [openPreviewPanel, setOpenPreviewPanel] = useState(false);

  const scopeReady = !!filters.exam_id && !!filters.subject_id;

  // Resume last exam+subject from localStorage when URL has no scope
  useEffect(() => {
    if (resumeHydratedRef.current) return;
    resumeHydratedRef.current = true;
    if (examIdFromUrl != null || subjectIdFromUrl != null) return;
    const resume = readResumeScope();
    if (!resume) return;
    setSelectedExamId(resume.exam_id);
    setFilters((prev) => ({
      ...prev,
      exam_id: resume.exam_id,
      subject_id: resume.subject_id,
      page: 1,
    }));
  }, [examIdFromUrl, subjectIdFromUrl]);

  useEffect(() => {
    const fromUrl = parseExtractionStatuses(statusFromUrl);
    if (fromUrl.length === 0) return;
    const serialized = formatExtractionStatuses(fromUrl);
    setFilters((prev) =>
      prev.extraction_status === serialized
        ? prev
        : { ...prev, extraction_status: serialized, page: 1 }
    );
  }, [statusFromUrl]);

  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        const [examsData, schoolsData] = await Promise.all([
          getAllExams(),
          listSchools(1, 100),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSubjectsForExam() {
      if (!selectedExamId) {
        setSubjects([]);
        return;
      }
      setLoadingSubjects(true);
      try {
        const examSubjects = await listExamSubjects(selectedExamId);
        if (cancelled) return;
        const mapped: Subject[] = examSubjects.map((es) => ({
          id: es.subject_id,
          code: es.subject_code,
          original_code: es.original_code,
          name: es.subject_name,
          subject_type: es.subject_type,
          exam_type: "Certificate II Examinations",
          created_at: es.created_at,
          updated_at: es.updated_at,
        }));
        setSubjects(mapped.sort((a, b) => a.code.localeCompare(b.code)));
      } catch (err) {
        console.error("Error loading exam subjects:", err);
        if (!cancelled) setSubjects([]);
      } finally {
        if (!cancelled) setLoadingSubjects(false);
      }
    }
    void loadSubjectsForExam();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  useEffect(() => {
    async function loadQueueStatus() {
      try {
        const status = await getReductoQueueStatus();
        setConcurrentWorkers(status.target_workers || status.active_workers || 4);
        setWorkersMax(status.workers_max || 50);
        setRateLimitPerSecond(status.rate_limit_per_second || 10);
      } catch (err) {
        console.warn("Reducto queue status unavailable:", err instanceof Error ? err.message : err);
      }
    }
    loadQueueStatus();
  }, []);

  const lastUrlQueryRef = useRef<string | null>(null);

  useEffect(() => {
    // Drive URL from filter state only. Do not put searchParams in deps —
    // router.replace updates searchParams and can re-enter forever when
    // encoding differs (e.g. comma in status=queued,processing).
    const params = new URLSearchParams();
    if (filters.exam_id) params.set("exam_id", String(filters.exam_id));
    if (filters.subject_id) params.set("subject_id", String(filters.subject_id));
    if (filters.school_id) params.set("school_id", String(filters.school_id));
    if (filters.extraction_status) params.set("status", filters.extraction_status);
    const next = params.toString();
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/scores/data-entry/extraction${next ? `?${next}` : ""}`, {
      scroll: false,
    });
  }, [
    filters.exam_id,
    filters.subject_id,
    filters.school_id,
    filters.extraction_status,
    router,
  ]);

  useEffect(() => {
    if (filters.exam_id && filters.subject_id) {
      writeResumeScope(filters.exam_id, filters.subject_id);
    }
  }, [filters.exam_id, filters.subject_id]);

  const handleConcurrentWorkersChange = async (workers: number) => {
    if (workers === concurrentWorkers) return;
    setUpdatingWorkers(true);
    try {
      const status = await updateReductoQueueWorkers(workers);
      setConcurrentWorkers(status.target_workers);
      setWorkersMax(status.workers_max);
      setRateLimitPerSecond(status.rate_limit_per_second);
      toast.success(`Processing ${status.target_workers} document(s) at a time`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update concurrency (Registrar role required)"
      );
    } finally {
      setUpdatingWorkers(false);
    }
  };

  const loadStatusCounts = useCallback(async () => {
    if (!filters.exam_id || !filters.subject_id) {
      setStatusCounts(EMPTY_COUNTS);
      setCountsLoaded(false);
      return;
    }
    try {
      const { extraction_status: _s, page: _p, page_size: _ps, id_ready: _ready, ...rest } = filters;
      const counts = await getScoresExtractionStatusCounts(rest);
      setStatusCounts(counts);
    } catch (err) {
      console.warn("Status counts unavailable:", err instanceof Error ? err.message : err);
    } finally {
      setCountsLoaded(true);
    }
  }, [filters]);

  const loadDocuments = useCallback(
    async (isPollingUpdate = false) => {
      if (!filters.exam_id || !filters.subject_id) {
        setDocuments([]);
        setTotal(0);
        setTotalPages(1);
        setCurrentPage(1);
        setLoading(false);
        setStatusCounts(EMPTY_COUNTS);
        setCountsLoaded(false);
        return;
      }
      if (!isPollingUpdate) {
        setLoading(true);
        setError(null);
      }
      try {
        const response = await getFilteredDocuments(filters);
        const allDocs = response.items;

        setDocuments((prevDocs) => {
          if (prevDocs.length !== allDocs.length) {
            return allDocs;
          }
          const prevDocsMap = new Map(prevDocs.map((d) => [d.id, d]));
          const hasChanges = allDocs.some((newDoc) => {
            const prevDoc = prevDocsMap.get(newDoc.id);
            return (
              !prevDoc ||
              prevDoc.scores_extraction_status !== newDoc.scores_extraction_status ||
              prevDoc.scores_extracted_at !== newDoc.scores_extracted_at ||
              prevDoc.scores_applied_at !== newDoc.scores_applied_at
            );
          });
          return hasChanges ? allDocs : prevDocs;
        });

        if (!isPollingUpdate) {
          setTotal(response.total);
          setTotalPages(response.total_pages);
          setCurrentPage(response.page);
        }
      } catch (err) {
        if (!isPollingUpdate) {
          setError(err instanceof Error ? err.message : "Failed to load documents");
        }
        console.error("Error loading documents:", err);
      } finally {
        if (!isPollingUpdate) {
          setLoading(false);
        }
        void loadStatusCounts();
      }
    },
    [filters, loadStatusCounts]
  );

  useEffect(() => {
    if (!scopeReady) {
      setDocuments((prev) => (prev.length === 0 ? prev : []));
      setTotal((t) => (t === 0 ? t : 0));
      setTotalPages((p) => (p === 1 ? p : 1));
      setCurrentPage((p) => (p === 1 ? p : 1));
      setLoading(false);
      setError(null);
      setStatusCounts((prev) => (prev === EMPTY_COUNTS ? prev : EMPTY_COUNTS));
      setCountsLoaded(false);
      setSelectedDocuments((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    loadDocuments(false);
  }, [loadDocuments, scopeReady]);

  useEffect(() => {
    let cancelled = false;
    async function loadCoverage() {
      if (!filters.exam_id || !filters.subject_id) {
        setCoverageStats(null);
        setCoverageError(null);
        setCoverageLoading(false);
        return;
      }
      setCoverageLoading(true);
      setCoverageError(null);
      try {
        const testTypeNum = filters.test_type ? parseInt(filters.test_type, 10) : undefined;
        const result = await compareSheetIds(filters.exam_id, {
          subject_id: filters.subject_id,
          school_id: filters.school_id,
          test_type:
            testTypeNum != null && !Number.isNaN(testTypeNum) ? testTypeNum : undefined,
        });
        if (cancelled) return;
        const missing = result.missing_sheet_ids_info ?? [];
        setCoverageStats({
          expected: result.total_expected_sheets,
          uploaded: result.uploaded_sheet_ids_info?.length ?? 0,
          missing: missing.length,
          missingObj: missing.filter((s) => s.test_type === 1).length,
          missingEssay: missing.filter((s) => s.test_type === 2).length,
          missingPract: missing.filter((s) => s.test_type === 3).length,
        });
      } catch (err) {
        if (cancelled) return;
        console.warn("Sheet coverage unavailable:", err instanceof Error ? err.message : err);
        setCoverageStats(null);
        setCoverageError(
          err instanceof Error ? err.message : "Failed to check expected sheets"
        );
      } finally {
        if (!cancelled) setCoverageLoading(false);
      }
    }
    void loadCoverage();
    return () => {
      cancelled = true;
    };
  }, [filters.exam_id, filters.subject_id, filters.school_id, filters.test_type]);

  useEffect(() => {
    if (!scopeReady) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const hasProcessingDocs =
      statusCounts.queued > 0 ||
      statusCounts.processing > 0 ||
      documents.some(
        (doc) =>
          doc.scores_extraction_status === "processing" ||
          doc.scores_extraction_status === "queued"
      );

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (!hasProcessingDocs) {
      return;
    }

    const interval = setInterval(() => {
      loadDocuments(true);
    }, 3000);

    pollingIntervalRef.current = interval;

    return () => {
      if (interval) {
        clearInterval(interval);
        pollingIntervalRef.current = null;
      }
    };
  }, [documents, loadDocuments, scopeReady, statusCounts.processing, statusCounts.queued]);

  useEffect(() => {
    if (!selectedExamId) {
      setFilters((prev) => {
        if (
          prev.exam_id == null &&
          prev.exam_type == null &&
          prev.series == null &&
          prev.year == null &&
          prev.subject_id == null
        ) {
          return prev;
        }
        const next = { ...prev, page: 1 };
        delete next.exam_id;
        delete next.exam_type;
        delete next.series;
        delete next.year;
        delete next.subject_id;
        return next;
      });
      return;
    }
    if (exams.length === 0) return;
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam) return;
    setFilters((prev) => {
      const examChanged = prev.exam_id !== exam.id;
      if (
        !examChanged &&
        prev.exam_type === exam.exam_type &&
        prev.series === exam.series &&
        prev.year === exam.year
      ) {
        return prev;
      }
      const next: ScoreDocumentFilters = {
        ...prev,
        exam_id: exam.id,
        exam_type: exam.exam_type as ExamType,
        series: exam.series as ExamSeries,
        year: exam.year,
        page: 1,
      };
      if (examChanged) {
        delete next.subject_id;
      }
      return next;
    });
  }, [selectedExamId, exams]);

  // Keep selectedExamId aligned when filters.exam_id is cleared/set elsewhere
  useEffect(() => {
    if (filters.exam_id != null && filters.exam_id !== selectedExamId) {
      setSelectedExamId(filters.exam_id);
    } else if (filters.exam_id == null && selectedExamId !== undefined) {
      setSelectedExamId(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.exam_id]);

  const handleFilterChange = (key: keyof ScoreDocumentFilters, value: number | string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      if (value === undefined) {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setSelectedDocuments(new Set());
  };

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSelectedExamId(undefined);
      setSubjects([]);
      setCoverageStats(null);
      setSelectedDocuments(new Set());
      clearResumeScope();
      return;
    }
    const examId = typeof value === "number" ? value : parseInt(String(value), 10);
    setSelectedExamId(examId);
    setCoverageStats(null);
    setSelectedDocuments(new Set());
  };

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return (a.exam_type || "").localeCompare(b.exam_type || "");
        })
        .map((exam) => ({
          value: exam.id,
          label: formatExamLabel(exam),
        })),
    [exams]
  );

  const subjectOptions = useMemo(
    () =>
      subjects.map((subject) => ({
        value: subject.id,
        label: `${subject.code} - ${subject.name}`,
      })),
    [subjects]
  );

  const subjectIndex = useMemo(() => {
    if (!filters.subject_id) return -1;
    return subjects.findIndex((s) => s.id === filters.subject_id);
  }, [subjects, filters.subject_id]);

  const canPrevSubject = subjectIndex > 0;
  const canNextSubject = subjectIndex >= 0 && subjectIndex < subjects.length - 1;

  const goToSubjectOffset = (offset: number) => {
    const next = subjects[subjectIndex + offset];
    if (!next) return;
    handleFilterChange("subject_id", next.id);
  };

  const handleSelectDocument = (documentId: number) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (filters.id_ready === false) return;
    if (selectedDocuments.size === documents.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documents.map((d) => d.id)));
    }
  };

  const navigateToActivity = (provider: ExtractionProvider) => {
    const params = new URLSearchParams();
    if (filters.exam_id) params.set("exam_id", String(filters.exam_id));
    if (filters.subject_id) params.set("subject_id", String(filters.subject_id));
    params.set("provider", provider);
    const qs = params.toString();
    router.push(`/scores/data-entry/activity${qs ? `?${qs}` : ""}`);
  };

  const queueDocuments = async (
    documentIds: number[],
    provider: ExtractionProvider
  ) => {
    if (documentIds.length === 0) {
      toast.message("No documents to queue");
      return;
    }
    setQueuing(true);
    setError(null);
    setExtractionProvider(provider);
    try {
      const response = await queueReductoExtraction(
        documentIds,
        skipWithoutExtractedId,
        provider
      );
      setSelectedDocuments(new Set());
      const parts: string[] = [];
      if (response.queued_count > 0) {
        parts.push(`${response.queued_count} queued`);
      }
      if ((response.skipped_count ?? 0) > 0) {
        parts.push(`${response.skipped_count} skipped (needs ID)`);
      }
      if (parts.length > 0) toast.success(parts.join(" · "));
      else toast.message("No documents were queued");

      if (response.queued_count > 0) {
        navigateToActivity(provider);
      } else {
        await loadDocuments(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue documents");
      toast.error("Failed to queue documents for extraction");
    } finally {
      setQueuing(false);
    }
  };

  const openQueueDialog = (mode: "selected" | "all" | "requeue", documentId?: number) => {
    if (mode === "selected" && selectedDocuments.size === 0) {
      setError("Please select at least one document");
      return;
    }
    setQueueDialogMode(mode);
    setRequeueDocumentId(documentId ?? null);
    setQueueDialogProvider(extractionProvider ?? "");
    setQueueDialogOpen(true);
  };

  const confirmQueueDialog = async () => {
    if (!queueDialogProvider) {
      toast.message("Select a provider to continue");
      return;
    }
    const provider = queueDialogProvider;
    setQueueDialogOpen(false);

    if (queueDialogMode === "selected") {
      await queueDocuments(Array.from(selectedDocuments), provider);
      return;
    }
    if (queueDialogMode === "requeue" && requeueDocumentId != null) {
      setRequeueingDocumentId(requeueDocumentId);
      try {
        await queueDocuments([requeueDocumentId], provider);
      } finally {
        setRequeueingDocumentId(null);
        setRequeueDocumentId(null);
      }
      return;
    }

    // all pending
    if (!scopeReady) return;
    try {
      const { extraction_provider: _listProvider, ...rest } = filters;
      const pendingFilters: ScoreDocumentFilters = {
        ...rest,
        extraction_status: "pending",
        id_ready: true,
        page: 1,
        page_size: 1000,
      };
      const response = await getFilteredDocuments(pendingFilters);
      const ids = response.items
        .filter((d) => !!d.extracted_id && d.id_extraction_status !== "error")
        .map((d) => d.id);
      if (ids.length === 0) {
        toast.message("No pending documents with extracted IDs");
        return;
      }
      await queueDocuments(ids, provider);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue pending documents");
    }
  };

  const handleQueueSelected = () => openQueueDialog("selected");

  const handleQueueAllPending = () => openQueueDialog("all");

  const handleDequeueSelected = async () => {
    if (!extractionProvider) {
      toast.message("Queue with a provider first, then you can remove from that queue");
      return;
    }
    const ids = documents
      .filter((d) => {
        if (!selectedDocuments.has(d.id)) return false;
        const row = d.extractions?.find((e) => e.provider === extractionProvider);
        const status = row?.status ?? ((d.extractions ?? []).length > 0 ? null : d.scores_extraction_status);
        return status === "queued" || status === "processing";
      })
      .map((d) => d.id);
    if (ids.length === 0) {
      toast.message("No queued documents in the selection");
      return;
    }
    setDequeuing(true);
    try {
      const response = await dequeueReductoExtraction(ids, extractionProvider);
      await loadDocuments(false);
      setSelectedDocuments(new Set());
      const parts: string[] = [];
      if (response.removed_count > 0) {
        parts.push(`${response.removed_count} removed`);
      }
      if ((response.skipped_processing ?? 0) > 0) {
        parts.push(`${response.skipped_processing} already processing`);
      }
      if (parts.length > 0) toast.success(parts.join(" · "));
      else toast.message("No documents were removed from the queue");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove documents from the queue");
    } finally {
      setDequeuing(false);
    }
  };

  const handleRequeue = (document: Document) => {
    openQueueDialog("requeue", document.id);
  };

  const handleViewDocument = (document: Document, withPreview = false) => {
    const index = documents.findIndex((d) => d.id === document.id);
    setSelectedIndex(index >= 0 ? index : -1);
    setSelectedDocument(document);
    setOpenPreviewPanel(
      withPreview &&
        (document.scores_extraction_status === "success" ||
          (document.extractions ?? []).some((e) => e.status === "success"))
    );
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
    setSelectedIndex(-1);
    setOpenPreviewPanel(false);
  };

  const handleNavigate = (index: number) => {
    if (index >= 0 && index < documents.length) {
      setSelectedIndex(index);
      setSelectedDocument(documents[index]);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch {
      toast.error("Failed to download document. Please try again.");
    }
  };

  const selectedStatuses = useMemo(
    () => parseExtractionStatuses(filters.extraction_status),
    [filters.extraction_status]
  );

  const needsIdView = filters.id_ready === false;
  const needsIdCount = statusCounts.needs_id ?? 0;

  const handleStatusChipToggle = (status: string | undefined) => {
    if (!status) {
      setFilters((prev) => {
        const next = { ...prev, page: 1, id_ready: true };
        delete next.extraction_status;
        return next;
      });
      setSelectedDocuments(new Set());
      return;
    }
    const value = status as ExtractionStatusFilter;
    const nextStatuses = selectedStatuses.includes(value)
      ? selectedStatuses.filter((s) => s !== value)
      : [...selectedStatuses, value];
    const serialized = formatExtractionStatuses(nextStatuses);
    setFilters((prev) => {
      const updated = { ...prev, page: 1, id_ready: true };
      if (serialized) {
        updated.extraction_status = serialized;
      } else {
        delete updated.extraction_status;
      }
      return updated;
    });
    setSelectedDocuments(new Set());
  };

  const handleNeedsIdToggle = () => {
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      if (prev.id_ready === false) {
        next.id_ready = true;
        next.extraction_status = "pending";
      } else {
        next.id_ready = false;
        delete next.extraction_status;
      }
      return next;
    });
    setSelectedDocuments(new Set());
  };

  const handleClearFilters = () => {
    setSelectedExamId(undefined);
    setSubjects([]);
    setCoverageStats(null);
    clearResumeScope();
    setFilters({
      page: 1,
      page_size: filters.page_size || 50,
      extraction_status: "pending",
      id_ready: true,
    });
    setSelectedDocuments(new Set());
  };

  const skipPreview = useMemo(() => {
    if (selectedDocuments.size === 0) return null;
    const selected = documents.filter((d) => selectedDocuments.has(d.id));
    const willSkip = skipWithoutExtractedId
      ? selected.filter((d) => !d.extracted_id).length
      : 0;
    return {
      willQueue: selected.length - willSkip,
      willSkip,
    };
  }, [documents, selectedDocuments, skipWithoutExtractedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!scopeReady) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (viewerOpen) return;

      if (e.key === "Escape") {
        setSelectedDocuments(new Set());
        return;
      }
      if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (filters.id_ready !== false) handleSelectAll();
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRowIndex((i) => Math.min(documents.length - 1, Math.max(0, i + 1)));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRowIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === " " && documents[focusedRowIndex]) {
        e.preventDefault();
        handleSelectDocument(documents[focusedRowIndex].id);
        return;
      }
      if (e.key === "Enter" && documents[focusedRowIndex]) {
        e.preventDefault();
        handleViewDocument(documents[focusedRowIndex], true);
        return;
      }
      if ((e.key === "q" || e.key === "Q") && selectedDocuments.size > 0) {
        e.preventDefault();
        if (filters.id_ready !== false) handleQueueSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, focusedRowIndex, selectedDocuments, viewerOpen, filters.id_ready, scopeReady]);

  const queueDialogCount =
    queueDialogMode === "selected"
      ? selectedDocuments.size
      : queueDialogMode === "requeue"
        ? 1
        : statusCounts.pending;

  const queueDialogTitle =
    queueDialogMode === "requeue"
      ? "Requeue document"
      : queueDialogMode === "all"
        ? `Queue ${queueDialogCount.toLocaleString()} pending document${queueDialogCount === 1 ? "" : "s"}`
        : `Queue ${queueDialogCount.toLocaleString()} selected document${queueDialogCount === 1 ? "" : "s"}`;

  const parseNumericFilter = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") return undefined;
    return typeof value === "number" ? value : parseInt(String(value), 10);
  };

  const trackHref = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.exam_id) params.set("exam_id", String(filters.exam_id));
    if (filters.subject_id) params.set("subject_id", String(filters.subject_id));
    if (filters.school_id) params.set("school_id", String(filters.school_id));
    if (filters.test_type) params.set("test_type", filters.test_type);
    params.set("tab", "missing");
    return `/icm-studio/track-icms?${params.toString()}`;
  }, [filters.exam_id, filters.subject_id, filters.school_id, filters.test_type]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);
  const selectedSubject = subjects.find((s) => s.id === filters.subject_id);
  const selectedSchool = schools.find((s) => s.id === filters.school_id);

  const examLabel = selectedExam
    ? formatExamLabel(selectedExam)
    : examOptions.find((o) => o.value === selectedExamId)?.label ?? "Examination";
  const subjectLabel = selectedSubject
    ? `${selectedSubject.code} - ${selectedSubject.name}`
    : subjectOptions.find((o) => o.value === filters.subject_id)?.label ?? "Subject";

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            <div className="flex min-w-0 items-baseline gap-3">
              <span>Score Extraction</span>
              <span className="hidden truncate text-sm font-normal text-muted-foreground lg:inline">
                Queue sheets for extraction, then apply on the next step.
              </span>
            </div>
          }
          trailing={
            <div className="flex items-center gap-2">
              <DataEntryPipelineNav
                current={
                  selectedStatuses.length === 1 && selectedStatuses[0] === "success"
                    ? "review"
                    : "extract"
                }
                scope={
                  filters.exam_id && filters.subject_id
                    ? {
                        exam_id: filters.exam_id,
                        subject_id: filters.subject_id,
                        provider: extractionProvider ?? undefined,
                      }
                    : null
                }
              />
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link
                  href={appendScopeToHref("/scores/data-entry/apply-scores", {
                    exam_id: filters.exam_id,
                    subject_id: filters.subject_id,
                  })}
                >
                  Go to Apply
                </Link>
              </Button>
            </div>
          }
        />

        {scopeReady && (
          <ExtractionContextStrip
            examOptions={examOptions}
            subjectOptions={subjectOptions}
            selectedExamId={selectedExamId}
            selectedSubjectId={filters.subject_id}
            onExamChange={handleExamChange}
            onSubjectChange={(value) =>
              handleFilterChange("subject_id", parseNumericFilter(value))
            }
            examLabel={examLabel}
            subjectLabel={subjectLabel}
            schoolLabel={
              selectedSchool
                ? `${selectedSchool.code} - ${selectedSchool.name}`
                : null
            }
            canPrevSubject={canPrevSubject}
            canNextSubject={canNextSubject}
            onPrevSubject={() => goToSubjectOffset(-1)}
            onNextSubject={() => goToSubjectOffset(1)}
            coverage={coverageStats}
            coverageLoading={coverageLoading}
            coverageError={coverageError}
            selectedTestType={filters.test_type}
            onTestTypeFilter={(testType) => handleFilterChange("test_type", testType)}
            trackHref={trackHref}
            pendingReadyCount={statusCounts.pending}
            queuing={queuing}
            queueDisabled={needsIdView || statusCounts.pending === 0}
            onQueueAllReady={() => void handleQueueAllPending()}
            subjectsLoading={loadingSubjects}
          />
        )}

        {scopeReady && (
          <div className="border-b border-border/80 bg-background/80 px-4 py-2 animate-in fade-in-0 slide-in-from-top-1 duration-300 fill-mode-both [animation-delay:60ms]">
            <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <ExtractionStatusPills
                  counts={statusCounts}
                  selected={selectedStatuses}
                  onToggle={handleStatusChipToggle}
                  loading={!countsLoaded}
                  needsIdSelected={needsIdView}
                />
                <button
                  type="button"
                  onClick={handleNeedsIdToggle}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-all duration-200",
                    needsIdView
                      ? "border-foreground/20 bg-background text-foreground shadow-sm"
                      : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-pressed={needsIdView}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full bg-destructive",
                      needsIdCount > 0 && "animate-pulse"
                    )}
                  />
                  Needs ID
                  <span className="tabular-nums text-foreground">
                    {needsIdCount.toLocaleString()}
                  </span>
                </button>
                {needsIdCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs animate-in fade-in-0 duration-200"
                    asChild
                  >
                    <Link href="/icm-studio/documents?id_extraction_status=error">
                      Fix failed IDs
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {scopeReady && (
          <div className="border-b border-border/80 bg-background/80 px-4 py-2 animate-in fade-in-0 slide-in-from-top-1 duration-300 fill-mode-both [animation-delay:100ms]">
            <div className="mx-auto max-w-[2000px]">
              <ScoreDocumentFiltersBar
                examOptions={examOptions}
                selectedExamId={selectedExamId}
                onExamChange={handleExamChange}
                schools={schools}
                subjects={subjects}
                schoolId={filters.school_id}
                subjectId={filters.subject_id}
                testType={filters.test_type}
                extractionProvider={filters.extraction_provider}
                onSchoolChange={(value) =>
                  handleFilterChange("school_id", parseNumericFilter(value))
                }
                onSubjectChange={(value) =>
                  handleFilterChange("subject_id", parseNumericFilter(value))
                }
                onTestTypeChange={(value) => handleFilterChange("test_type", value)}
                onExtractionProviderChange={(value) =>
                  handleFilterChange("extraction_provider", value)
                }
                showProviderFilter
                requireExam
                requireSubject
                hideExamSubject
                subjectDisabled={loadingSubjects}
                loading={loadingFilters || loadingSubjects}
                onRefresh={() => {
                  if (scopeReady) void loadDocuments(false);
                }}
                refreshing={loading}
                onClear={handleClearFilters}
              />
            </div>
          </div>
        )}

        {!scopeReady ? (
          <div className="relative mx-4 mb-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,133,63,0.08),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(0,55,100,0.06),_transparent_50%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] [background-size:28px_28px]"
            />
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-14 animate-in fade-in-0 zoom-in-[0.98] duration-500">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                <BookOpen className="h-6 w-6 text-[color:var(--primary,#00853F)]" />
              </div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm animate-in fade-in-0 duration-500 fill-mode-both [animation-delay:80ms]">
                <Sparkles className="h-3 w-3 text-[color:var(--primary,#00853F)]" />
                Subject-first extraction
              </div>
              <p className="mt-3 text-lg font-semibold tracking-tight animate-in fade-in-0 slide-in-from-bottom-1 duration-500 fill-mode-both [animation-delay:120ms]">
                {!selectedExamId
                  ? "Choose an examination to begin"
                  : "Choose a subject to load sheets"}
              </p>
              <p className="mt-1.5 max-w-md text-center text-sm text-muted-foreground animate-in fade-in-0 duration-500 fill-mode-both [animation-delay:160ms]">
                Sheets load per subject so you can queue extraction and see expected vs missing
                coverage in one place.
              </p>
              <div className="mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row animate-in fade-in-0 slide-in-from-bottom-2 duration-500 fill-mode-both [animation-delay:220ms]">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Examination
                  </label>
                  <SearchableSelect
                    options={examOptions}
                    value={selectedExamId || ""}
                    onValueChange={handleExamChange}
                    placeholder="Select examination…"
                    disabled={loadingFilters}
                    searchPlaceholder="Search examinations..."
                    emptyMessage="No examinations found"
                    triggerClassName="h-11 shadow-sm transition-shadow hover:shadow-md"
                  />
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 space-y-1.5 transition-opacity duration-300",
                    !selectedExamId && "opacity-60"
                  )}
                >
                  <label className="block text-xs font-medium text-muted-foreground">
                    Subject
                  </label>
                  <SearchableSelect
                    options={subjectOptions}
                    value={filters.subject_id || ""}
                    onValueChange={(value) =>
                      handleFilterChange("subject_id", parseNumericFilter(value))
                    }
                    placeholder={
                      selectedExamId ? "Select subject…" : "Select examination first"
                    }
                    disabled={loadingFilters || loadingSubjects || !selectedExamId}
                    searchPlaceholder="Search subject code or name..."
                    emptyMessage={
                      !selectedExamId ? "Select an examination first" : "No subjects found"
                    }
                    triggerClassName="h-11 shadow-sm transition-shadow hover:shadow-md"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            key={`${filters.exam_id}-${filters.subject_id}`}
            className="mx-4 mb-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-background shadow-[0_1px_0_rgba(0,0,0,0.03)] animate-in fade-in-0 slide-in-from-bottom-2 duration-500"
          >
            <ReductoDocumentsDataTable
              documents={documents}
              loading={loading}
              error={error}
              selectedDocuments={selectedDocuments}
              onSelectDocument={handleSelectDocument}
              onSelectAll={handleSelectAll}
              onClearSelection={() => setSelectedDocuments(new Set())}
              onRowClick={(doc) => handleViewDocument(doc, false)}
              onPreview={(doc) => handleViewDocument(doc, true)}
              onRequeue={handleRequeue}
              requeueingDocumentId={requeueingDocumentId}
              statusFilter={filters.extraction_status}
              pageSize={filters.page_size || 50}
              onPageSizeChange={(size) =>
                setFilters((prev) => ({ ...prev, page_size: size, page: 1 }))
              }
              skipWithoutExtractedId={skipWithoutExtractedId}
              onSkipWithoutExtractedIdChange={setSkipWithoutExtractedId}
              extractionProvider={extractionProvider}
              concurrentWorkers={concurrentWorkers}
              workersMax={workersMax}
              rateLimitPerSecond={rateLimitPerSecond}
              onConcurrentWorkersChange={handleConcurrentWorkersChange}
              updatingWorkers={updatingWorkers}
              queuing={queuing}
              dequeuing={dequeuing}
              skipPreview={skipPreview}
              onQueueSelected={handleQueueSelected}
              onDequeueSelected={handleDequeueSelected}
              onQueueAllPending={handleQueueAllPending}
              queueAllPendingDisabled={statusCounts.pending === 0 || needsIdView}
              pendingReadyCount={statusCounts.pending}
              queueable={!needsIdView}
              focusedRowIndex={focusedRowIndex}
              onFocusedRowIndexChange={setFocusedRowIndex}
              currentPage={currentPage}
              totalPages={totalPages}
              total={total}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              emptyActionHref={
                needsIdView ||
                (selectedStatuses.length === 1 && selectedStatuses[0] === "pending")
                  ? "/icm-studio/documents?id_extraction_status=error"
                  : "/scores/data-entry/apply-scores"
              }
              emptyActionLabel={
                needsIdView ||
                (selectedStatuses.length === 1 && selectedStatuses[0] === "pending")
                  ? "Fix failed IDs"
                  : "Go to Apply Scores"
              }
            />
          </div>
        )}
      </div>

      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          documents={documents}
          currentIndex={selectedIndex}
          open={viewerOpen}
          onClose={handleCloseViewer}
          onNavigate={handleNavigate}
          onDownload={handleDownload}
          enableReductoPreview
          initialShowExtractionPanel={openPreviewPanel}
        />
      )}

      <AlertDialog
        open={queueDialogOpen}
        onOpenChange={(open) => {
          setQueueDialogOpen(open);
          if (!open) setRequeueDocumentId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{queueDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which extraction provider to use. Sheets that need an ID are skipped when
              that setting is on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="queue-provider" className="text-xs text-muted-foreground">
              Provider
            </Label>
            <Select
              value={queueDialogProvider || undefined}
              onValueChange={(value) =>
                setQueueDialogProvider(value as ExtractionProvider)
              }
            >
              <SelectTrigger id="queue-provider" className="w-full">
                <SelectValue placeholder="Select provider…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llama">{extractionProviderLabel("llama")}</SelectItem>
                <SelectItem value="reducto">{extractionProviderLabel("reducto")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={queuing}>Cancel</AlertDialogCancel>
            <Button
              disabled={queuing || !queueDialogProvider}
              onClick={() => void confirmQueueDialog()}
            >
              {queuing ? "Queueing…" : "Continue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
