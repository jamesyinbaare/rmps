"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  ReductoDocumentsDataTable,
  type BatchProgress,
  type ExtractionStatusFilter,
  formatExtractionStatuses,
  parseExtractionStatuses,
} from "@/components/ReductoDocumentsDataTable";
import { DataEntryPipelineNav } from "@/components/DataEntryPipelineNav";
import { ScoreDocumentFiltersBar } from "@/components/data-entry/ScoreDocumentFiltersBar";
import { ExtractionStatusPills } from "@/components/data-entry/ExtractionStatusPills";
import { BatchProgressBanner } from "@/components/data-entry/BatchProgressBanner";
import {
  getFilteredDocuments,
  getScoresExtractionStatusCounts,
  getAllExams,
  listSchools,
  listSubjects,
  queueReductoExtraction,
  getReductoQueueStatus,
  updateReductoQueueWorkers,
  updateScoresFromReducto,
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

const EMPTY_COUNTS: ScoresExtractionStatusCounts = {
  total: 0,
  pending: 0,
  queued: 0,
  processing: 0,
  success: 0,
  error: 0,
};

export default function ReductoExtractionPage() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status");
  const initialStatuses = parseExtractionStatuses(statusFromUrl);
  const initialStatus =
    initialStatuses.length > 0 ? formatExtractionStatuses(initialStatuses) : "pending";

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>({
    page: 1,
    page_size: 50,
    extraction_status: initialStatus,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<ScoresExtractionStatusCounts>(EMPTY_COUNTS);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());
  const [queuing, setQueuing] = useState(false);
  const [requeueingDocumentId, setRequeueingDocumentId] = useState<number | null>(null);
  const [updatingScores, setUpdatingScores] = useState<number | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [batchTrackedIds, setBatchTrackedIds] = useState<Set<number>>(new Set());

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>();

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [skipWithoutExtractedId, setSkipWithoutExtractedId] = useState(true);
  const [extractionProvider, setExtractionProvider] = useState<ExtractionProvider>("reducto");
  const [concurrentWorkers, setConcurrentWorkers] = useState(4);
  const [workersMax, setWorkersMax] = useState(50);
  const [rateLimitPerSecond, setRateLimitPerSecond] = useState(10);
  const [updatingWorkers, setUpdatingWorkers] = useState(false);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [openPreviewPanel, setOpenPreviewPanel] = useState(false);

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
        const [examsData, schoolsData, subjectsData] = await Promise.all([
          getAllExams(),
          listSchools(1, 100),
          listSubjects(1, 100),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
        setSubjects(subjectsData);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

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
    try {
      const { extraction_status: _s, page: _p, page_size: _ps, ...rest } = filters;
      const counts = await getScoresExtractionStatusCounts(rest);
      setStatusCounts(counts);
    } catch (err) {
      // Don't fail the page if counts endpoint is unavailable (e.g. API not restarted yet)
      console.warn("Status counts unavailable:", err instanceof Error ? err.message : err);
    } finally {
      setCountsLoaded(true);
    }
  }, [filters]);

  const loadDocuments = useCallback(
    async (isPollingUpdate = false) => {
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
        // Load counts independently so a counts failure never blocks the table
        void loadStatusCounts();
      }
    },
    [filters, loadStatusCounts]
  );

  useEffect(() => {
    loadDocuments(false);
  }, [loadDocuments]);

  useEffect(() => {
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
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const interval = setInterval(() => {
      loadDocuments(true);
    }, 3000);

    pollingIntervalRef.current = interval;

    return () => {
      if (interval) {
        clearInterval(interval);
        pollingIntervalRef.current = null;
        setIsPolling(false);
      }
    };
  }, [documents, loadDocuments, statusCounts.processing, statusCounts.queued]);

  useEffect(() => {
    const newFilters: ScoreDocumentFilters = { ...filters };

    if (selectedExamId && exams.length > 0) {
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        newFilters.exam_id = exam.id;
        newFilters.exam_type = exam.exam_type as ExamType;
        newFilters.series = exam.series as ExamSeries;
        newFilters.year = exam.year;
      }
    } else {
      delete newFilters.exam_id;
      delete newFilters.exam_type;
      delete newFilters.series;
      delete newFilters.year;
    }

    newFilters.page = 1;
    setFilters(newFilters);
    setSelectedDocuments(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId, exams]);

  useEffect(() => {
    if (exams.length > 0 && filters.exam_id) {
      if (filters.exam_id !== selectedExamId) {
        setSelectedExamId(filters.exam_id);
      }
    } else if (!filters.exam_id && selectedExamId !== undefined) {
      setSelectedExamId(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.exam_id, exams]);

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
    } else {
      setSelectedExamId(typeof value === "number" ? value : parseInt(String(value), 10));
    }
  };

  const examOptions = exams
    .slice()
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (a.series !== b.series) return a.series.localeCompare(b.series);
      return (a.exam_type || "").localeCompare(b.exam_type || "");
    })
    .map((exam) => {
      const typeLabel =
        exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
      return {
        value: exam.id,
        label: `${exam.year} ${exam.series} ${typeLabel}`,
      };
    });

  const handleSelectDocument = (documentId: number) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === documents.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documents.map((d) => d.id)));
    }
  };

  const queueDocuments = async (documentIds: number[], trackBatch = true) => {
    if (documentIds.length === 0) {
      toast.message("No documents to queue");
      return;
    }
    setQueuing(true);
    setError(null);
    try {
      const response = await queueReductoExtraction(
        documentIds,
        skipWithoutExtractedId,
        extractionProvider
      );
      if (trackBatch) {
        const queuedIds = response.documents
          .filter((d) => d.status === "queued" || d.status === "processing")
          .map((d) => d.document_id);
        setBatchTrackedIds(new Set(queuedIds.length > 0 ? queuedIds : documentIds));
      }
      await loadDocuments(false);
      setSelectedDocuments(new Set());
      const parts: string[] = [];
      if (response.queued_count > 0) {
        parts.push(`${response.queued_count} queued`);
      }
      if ((response.skipped_count ?? 0) > 0) {
        parts.push(`${response.skipped_count} skipped (no ID)`);
      }
      if (parts.length > 0) toast.success(parts.join(" · "));
      else toast.message("No documents were queued");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue documents");
      toast.error("Failed to queue documents for extraction");
    } finally {
      setQueuing(false);
    }
  };

  const handleQueueSelected = async () => {
    if (selectedDocuments.size === 0) {
      setError("Please select at least one document");
      return;
    }
    await queueDocuments(Array.from(selectedDocuments));
  };

  const handleQueueAllPending = async () => {
    try {
      const pendingFilters: ScoreDocumentFilters = {
        ...filters,
        extraction_status: "pending",
        page: 1,
        page_size: 1000,
      };
      const response = await getFilteredDocuments(pendingFilters);
      let ids = response.items.map((d) => d.id);
      if (skipWithoutExtractedId) {
        ids = response.items.filter((d) => !!d.extracted_id).map((d) => d.id);
      }
      if (ids.length === 0) {
        toast.message(
          skipWithoutExtractedId
            ? "No pending documents with extracted IDs"
            : "No pending documents to queue"
        );
        return;
      }
      await queueDocuments(ids);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue pending documents");
    }
  };

  const handleRequeue = async (document: Document) => {
    setRequeueingDocumentId(document.id);
    try {
      await queueDocuments([document.id]);
    } finally {
      setRequeueingDocumentId(null);
    }
  };

  const handleUpdateScores = async (document: Document) => {
    setUpdatingScores(document.id);
    try {
      const response = await updateScoresFromReducto(document.id, true);
      toast.success(
        `Updated ${response.updated_count} score(s). ${response.unmatched_count} unmatched.`
      );
      if (response.unmatched_count > 0) {
        toast.message("Review unmatched records on Apply Scores");
      }
      await loadDocuments(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scores");
    } finally {
      setUpdatingScores(null);
    }
  };

  const handleViewDocument = (document: Document, withPreview = false) => {
    const index = documents.findIndex((d) => d.id === document.id);
    setSelectedIndex(index >= 0 ? index : -1);
    setSelectedDocument(document);
    setOpenPreviewPanel(withPreview && document.scores_extraction_status === "success");
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

  const handleStatusFilterChange = (statuses: ExtractionStatusFilter[]) => {
    const next = { ...filters, page: 1 };
    const serialized = formatExtractionStatuses(statuses);
    if (serialized) {
      next.extraction_status = serialized;
    } else {
      delete next.extraction_status;
    }
    setFilters(next);
    setSelectedDocuments(new Set());
  };

  /** Toggle a status from the summary chips (multi-select). Empty = all. */
  const handleStatusChipToggle = (status: string | undefined) => {
    if (!status) {
      handleStatusFilterChange([]);
      return;
    }
    const value = status as ExtractionStatusFilter;
    const next = selectedStatuses.includes(value)
      ? selectedStatuses.filter((s) => s !== value)
      : [...selectedStatuses, value];
    handleStatusFilterChange(next);
  };

  const handleClearFilters = () => {
    setSelectedExamId(undefined);
    setFilters({ page: 1, page_size: filters.page_size || 50, extraction_status: "pending" });
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

  const batchProgress: BatchProgress | null = useMemo(() => {
    if (batchTrackedIds.size === 0) return null;
    let done = 0;
    let failed = 0;
    let processing = 0;
    let queued = 0;
    for (const id of batchTrackedIds) {
      const doc = documents.find((d) => d.id === id);
      const status = doc?.scores_extraction_status;
      if (status === "success") done += 1;
      else if (status === "error") failed += 1;
      else if (status === "processing") processing += 1;
      else if (status === "queued") queued += 1;
    }
    // When filtered away from tracked docs, fall back to global processing counts
    const known = done + failed + processing + queued;
    if (known === 0 && (statusCounts.queued > 0 || statusCounts.processing > 0)) {
      return {
        total: batchTrackedIds.size,
        done: 0,
        failed: 0,
        processing: statusCounts.processing,
        queued: statusCounts.queued,
      };
    }
    return {
      total: batchTrackedIds.size,
      done,
      failed,
      processing,
      queued,
    };
  }, [batchTrackedIds, documents, statusCounts.processing, statusCounts.queued]);

  useEffect(() => {
    if (!batchProgress) return;
    if (batchProgress.done + batchProgress.failed >= batchProgress.total && batchProgress.total > 0) {
      if (batchProgress.processing === 0 && batchProgress.queued === 0) {
        toast.success(
          `Batch complete · ${batchProgress.done} succeeded` +
            (batchProgress.failed > 0 ? ` · ${batchProgress.failed} failed` : "")
        );
        setBatchTrackedIds(new Set());
      }
    }
  }, [batchProgress]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        handleSelectAll();
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
        void handleQueueSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, focusedRowIndex, selectedDocuments, viewerOpen]);

  const parseNumericFilter = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") return undefined;
    return typeof value === "number" ? value : parseInt(String(value), 10);
  };

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
        />

        <div className="border-b border-border bg-background px-4 py-2">
          <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-3">
            <DataEntryPipelineNav
              current={
                selectedStatuses.length === 1 && selectedStatuses[0] === "success"
                  ? "review"
                  : "extract"
              }
            />
            <ExtractionStatusPills
              counts={statusCounts}
              selected={selectedStatuses}
              onToggle={handleStatusChipToggle}
              loading={!countsLoaded}
            />
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/scores/data-entry/apply-scores">Go to Apply</Link>
            </Button>
          </div>
        </div>

        <div className="border-b border-border bg-background px-4 py-2">
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
              onSchoolChange={(value) => handleFilterChange("school_id", parseNumericFilter(value))}
              onSubjectChange={(value) =>
                handleFilterChange("subject_id", parseNumericFilter(value))
              }
              onTestTypeChange={(value) => handleFilterChange("test_type", value)}
              onExtractionProviderChange={(value) =>
                handleFilterChange("extraction_provider", value)
              }
              showProviderFilter
              loading={loadingFilters}
              onRefresh={() => loadDocuments(false)}
              refreshing={loading}
              onClear={handleClearFilters}
            />
          </div>
        </div>

        {batchProgress && batchProgress.total > 0 && (
          <div className="mx-4 mt-3">
            <BatchProgressBanner
              progress={batchProgress}
              isPolling={isPolling}
              onDismiss={() => setBatchTrackedIds(new Set())}
            />
          </div>
        )}

        <div className="mx-4 mb-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
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
            onApply={handleUpdateScores}
            applyingDocumentId={updatingScores}
            requeueingDocumentId={requeueingDocumentId}
            statusFilter={filters.extraction_status}
            pageSize={filters.page_size || 50}
            onPageSizeChange={(size) =>
              setFilters((prev) => ({ ...prev, page_size: size, page: 1 }))
            }
            skipWithoutExtractedId={skipWithoutExtractedId}
            onSkipWithoutExtractedIdChange={setSkipWithoutExtractedId}
            extractionProvider={extractionProvider}
            onExtractionProviderChange={setExtractionProvider}
            concurrentWorkers={concurrentWorkers}
            workersMax={workersMax}
            rateLimitPerSecond={rateLimitPerSecond}
            onConcurrentWorkersChange={handleConcurrentWorkersChange}
            updatingWorkers={updatingWorkers}
            queuing={queuing}
            skipPreview={skipPreview}
            onQueueSelected={handleQueueSelected}
            onQueueAllPending={handleQueueAllPending}
            queueAllPendingDisabled={statusCounts.pending === 0}
            focusedRowIndex={focusedRowIndex}
            onFocusedRowIndexChange={setFocusedRowIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            emptyActionHref={
              selectedStatuses.length === 1 && selectedStatuses[0] === "pending"
                ? "/icm-studio/documents/failed-extractions"
                : "/scores/data-entry/apply-scores"
            }
            emptyActionLabel={
              selectedStatuses.length === 1 && selectedStatuses[0] === "pending"
                ? "Fix failed IDs"
                : "Go to Apply Scores"
            }
          />
        </div>
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
          onUpdateScores={handleUpdateScores}
          updatingScores={updatingScores === selectedDocument.id}
        />
      )}
    </DashboardLayout>
  );
}
