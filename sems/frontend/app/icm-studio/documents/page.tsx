"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentList } from "@/components/DocumentList";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DeleteDocumentDialog } from "@/components/DeleteDocumentDialog";
import { CompactFilters } from "@/components/CompactFilters";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  Grid3x3,
  List,
  Trash2,
  Database,
  MoreHorizontal,
  RefreshCw,
  Keyboard,
  BookOpen,
  Sparkles,
} from "lucide-react";
import {
  listDocuments,
  getIdExtractionStatusCounts,
  downloadDocument,
  getDocumentDownloadFilename,
  getDocument,
  getDocumentIdExtractionConflicts,
  extractDocumentId,
  updateDocumentId,
  bulkDeleteDocuments,
  bulkExtractDocumentIds,
  getAllExams,
} from "@/lib/api";
import { parseDuplicateConflictDocumentId } from "@/lib/id-extraction-errors";
import { nextIndexAfterRemoval } from "@/lib/resolution-queue";
import type {
  Document,
  DocumentFilters as DocumentFiltersType,
  Exam,
  ExamSeries,
  ExamType,
  IdExtractionStatusCounts,
} from "@/types/document";
import { ID_EXTRACTION_ERROR_FILTERS } from "@/lib/id-extraction-errors";
import { toast } from "sonner";
import { BackfillDialog } from "@/components/BackfillDialog";
import { IdExtractionStatusPills } from "@/components/IdExtractionStatusPills";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  clearDocumentsResumeScope,
  parseOptionalInt,
  writeDocumentsResumeScope,
} from "@/lib/extraction-scope";

/** Cap accumulated infinite-scroll cards to avoid unbounded DOM growth at 50k+ scale. */
const MAX_INFINITE_SCROLL_ITEMS = 300;

function formatExamLabel(exam: Exam) {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${exam.year} ${exam.series} ${typeLabel}`;
}

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filterParam = searchParams.get("filter");
  const examIdParam = searchParams.get("exam_id");
  const extractionStatusParam = searchParams.get("id_extraction_status");
  const errorParam = searchParams.get("error") || "";
  const examIdFromUrl = parseOptionalInt(examIdParam);

  const [exams, setExams] = useState<Exam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocumentFiltersType>(() => {
    const initial: DocumentFiltersType = {
      page: 1,
      page_size: extractionStatusParam === "error" ? 50 : 30,
    };
    if (examIdFromUrl != null) {
      initial.exam_id = examIdFromUrl;
    }
    if (
      extractionStatusParam === "success" ||
      extractionStatusParam === "pending" ||
      extractionStatusParam === "error"
    ) {
      initial.id_extraction_status = extractionStatusParam;
    }
    if (errorParam) {
      initial.id_extraction_error_code = errorParam;
      initial.id_extraction_status = initial.id_extraction_status || "error";
    }
    return initial;
  });
  const lastUrlQueryRef = useRef<string | null>(null);
  /** Allow writing exam_id into the URL only after an explicit exam pick (not soft-nav). */
  const allowExamUrlWriteRef = useRef(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    extractionStatusParam === "error" ? "list" : "grid"
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [conflictRefreshKey, setConflictRefreshKey] = useState(0);
  const [deleteResolutionRole, setDeleteResolutionRole] = useState<
    "current" | "conflict" | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [statusCounts, setStatusCounts] = useState<IdExtractionStatusCounts>({
    total: 0,
    pending: 0,
    success: 0,
    error: 0,
    error_codes: [],
  });
  const [countsLoading, setCountsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
  const [downloadErrorOpen, setDownloadErrorOpen] = useState(false);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);

  const scopeReady = !!filters.exam_id;
  const isErrorsView = filters.id_extraction_status === "error";
  const selectionEnabled = isErrorsView || bulkMode;
  const useInfiniteScroll = viewMode === "grid" && !isErrorsView;

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

  useEffect(() => {
    async function loadExams() {
      setLoadingExams(true);
      try {
        setExams(await getAllExams());
      } catch (err) {
        console.error("Failed to load exams:", err);
      } finally {
        setLoadingExams(false);
      }
    }
    void loadExams();
  }, []);

  // Keep exam scope in sync with the URL (including soft-nav to bare /documents).
  // Do not auto-hydrate from resume — that skipped the gate and dumped the full exam list.
  useEffect(() => {
    setFilters((prev) => {
      const current = prev.exam_id ?? undefined;
      const next = examIdFromUrl ?? undefined;
      if (current === next) return prev;

      if (next == null) {
        clearDocumentsResumeScope();
        const cleared: DocumentFiltersType = {
          page: 1,
          page_size: prev.page_size || 30,
        };
        if (prev.id_extraction_status) {
          cleared.id_extraction_status = prev.id_extraction_status;
        }
        if (prev.id_extraction_error_code) {
          cleared.id_extraction_error_code = prev.id_extraction_error_code;
        }
        return cleared;
      }

      return { ...prev, exam_id: next, page: 1 };
    });
  }, [examIdFromUrl]);

  // Debounce search into server-side `q` filter
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextQ = searchQuery.trim() || undefined;
      setFilters((prev) => {
        if ((prev.q ?? undefined) === nextQ) return prev;
        return { ...prev, q: nextQ, page: 1 };
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // Sync status/error from URL deep-links (exam is owned by local state + resume)
  useEffect(() => {
    const nextStatus =
      extractionStatusParam === "success" ||
      extractionStatusParam === "pending" ||
      extractionStatusParam === "error"
        ? extractionStatusParam
        : undefined;
    const nextError = errorParam || undefined;
    const resolvedStatus = nextError ? nextStatus || "error" : nextStatus;

    setFilters((prev) => {
      const statusChanged = (prev.id_extraction_status ?? undefined) !== resolvedStatus;
      const errorChanged = (prev.id_extraction_error_code ?? undefined) !== nextError;
      if (!statusChanged && !errorChanged) return prev;
      return {
        ...prev,
        id_extraction_status: resolvedStatus,
        id_extraction_error_code: nextError,
        page: 1,
        page_size: resolvedStatus === "error" ? 50 : statusChanged ? 30 : prev.page_size,
      };
    });
  }, [extractionStatusParam, errorParam]);

  const prevExtractionStatusParamRef = useRef(extractionStatusParam);
  useEffect(() => {
    const prev = prevExtractionStatusParamRef.current;
    prevExtractionStatusParamRef.current = extractionStatusParam;
    if (extractionStatusParam === "error" && prev !== "error") {
      setViewMode("list");
    } else if (extractionStatusParam !== "error" && prev === "error") {
      setViewMode("grid");
    }
  }, [extractionStatusParam]);

  const loadDocuments = useCallback(async (append = false) => {
    if (!filters.exam_id) {
      setDocuments([]);
      setTotal(0);
      setTotalPages(1);
      setCurrentPage(1);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await listDocuments(filters);
      let sortedDocuments = response.items;

      if (filterParam === "recent") {
        sortedDocuments = [...response.items].sort((a, b) => {
          const dateA = new Date(a.uploaded_at).getTime();
          const dateB = new Date(b.uploaded_at).getTime();
          return dateB - dateA;
        });
      }

      if (append) {
        setDocuments((prev) => {
          const merged = [...prev, ...sortedDocuments];
          const capped =
            merged.length > MAX_INFINITE_SCROLL_ITEMS
              ? merged.slice(merged.length - MAX_INFINITE_SCROLL_ITEMS)
              : merged;
          setHasMore(response.page < response.total_pages && capped.length < MAX_INFINITE_SCROLL_ITEMS);
          return capped;
        });
      } else {
        setDocuments(sortedDocuments);
        setHasMore(
          response.page < response.total_pages &&
            sortedDocuments.length < MAX_INFINITE_SCROLL_ITEMS
        );
      }

      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error loading documents:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, filterParam]);

  // Track filter changes to reset or append
  const prevFiltersRef = useRef<DocumentFiltersType | null>(null);
  const prevFilterParamRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);

  // Handle filter/search changes (reset) vs page changes (append for infinite scroll)
  useEffect(() => {
    if (!scopeReady) {
      setDocuments([]);
      setTotal(0);
      setTotalPages(1);
      setCurrentPage(1);
      setHasMore(false);
      setLoading(false);
      prevFiltersRef.current = filters;
      prevFilterParamRef.current = filterParam;
      isInitialMount.current = false;
      return;
    }

    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevFiltersRef.current = filters;
      prevFilterParamRef.current = filterParam;
      loadDocuments(false);
      return;
    }

    const filtersChanged =
      prevFiltersRef.current?.exam_id !== filters.exam_id ||
      prevFiltersRef.current?.exam_type !== filters.exam_type ||
      prevFiltersRef.current?.series !== filters.series ||
      prevFiltersRef.current?.year !== filters.year ||
      prevFiltersRef.current?.school_id !== filters.school_id ||
      prevFiltersRef.current?.subject_id !== filters.subject_id ||
      prevFiltersRef.current?.id_extraction_status !== filters.id_extraction_status ||
      prevFiltersRef.current?.id_extraction_error_code !== filters.id_extraction_error_code ||
      prevFiltersRef.current?.q !== filters.q ||
      prevFilterParamRef.current !== filterParam;

    const pageChanged = (prevFiltersRef.current?.page ?? 1) !== (filters.page ?? 1);

    if (filtersChanged && (filters.page ?? 1) === 1) {
      prevFiltersRef.current = filters;
      prevFilterParamRef.current = filterParam;
      loadDocuments(false);
    } else if (pageChanged && useInfiniteScroll && (filters.page ?? 1) > 1) {
      prevFiltersRef.current = filters;
      loadDocuments(true);
    } else if (pageChanged) {
      prevFiltersRef.current = filters;
      loadDocuments(false);
    }
  }, [filters, filterParam, viewMode, useInfiniteScroll, loadDocuments, scopeReady]);

  // Drive URL from filter state (avoid searchParams loops).
  // Never re-add exam_id after the URL was cleared (e.g. sidebar "All files") unless
  // the user just picked an exam via handleExamChange.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterParam) params.set("filter", filterParam);
    if (filters.exam_id) {
      if (examIdFromUrl != null || allowExamUrlWriteRef.current) {
        params.set("exam_id", String(filters.exam_id));
        allowExamUrlWriteRef.current = false;
      }
    }
    if (filters.id_extraction_status) {
      params.set("id_extraction_status", filters.id_extraction_status);
    }
    if (filters.id_extraction_error_code) {
      params.set("error", filters.id_extraction_error_code);
    }
    const next = params.toString();
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/icm-studio/documents${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    filters.exam_id,
    filters.id_extraction_status,
    filters.id_extraction_error_code,
    filterParam,
    examIdFromUrl,
    router,
  ]);

  useEffect(() => {
    if (filters.exam_id) {
      writeDocumentsResumeScope(filters.exam_id);
    }
  }, [filters.exam_id]);

  // Check if we need to load more content to fill the viewport (after documents load)
  useEffect(() => {
    if (!useInfiniteScroll || !hasMore || loadingMore || loading) return;
    if (documents.length === 0) return;

    const checkIfNeedsMoreContent = () => {
      const sentinel = document.getElementById("infinite-scroll-sentinel");
      if (!sentinel) return;

      const rect = sentinel.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // If sentinel is visible (within viewport), we need more content
      if (rect.top < windowHeight && currentPage < totalPages && !loadingMore) {
        setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
      }
    };

    // Check after DOM updates (images might still be loading)
    const timeoutId = setTimeout(checkIfNeedsMoreContent, 500);
    // Also check on resize
    if (typeof window !== "undefined") {
      window.addEventListener("resize", checkIfNeedsMoreContent);
    }
    return () => {
      clearTimeout(timeoutId);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", checkIfNeedsMoreContent);
      }
    };
  }, [documents.length, useInfiniteScroll, hasMore, loadingMore, loading, currentPage, totalPages]);

  // Intersection Observer for infinite scroll (more efficient than scroll events)
  useEffect(() => {
    if (!useInfiniteScroll || !hasMore || loadingMore || loading) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const sentinel = document.getElementById("infinite-scroll-sentinel");
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && currentPage < totalPages && !loadingMore) {
          setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [useInfiniteScroll, hasMore, loadingMore, loading, currentPage, totalPages, documents.length]);

  // Fallback scroll handler (for browsers without Intersection Observer support)
  useEffect(() => {
    if (!useInfiniteScroll || !hasMore || loadingMore || loading) return;
    if (typeof window === "undefined") return;
    if ("IntersectionObserver" in window) return; // Use Intersection Observer if available

    const win = window as Window; // Type assertion for TypeScript
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const scrollTop = win.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = win.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        // Load more when user is 400px from bottom
        if (scrollTop + windowHeight >= documentHeight - 400) {
          if (currentPage < totalPages && !loadingMore) {
            setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
          }
        }
        ticking = false;
      });
    };

    win.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      win.removeEventListener("scroll", handleScroll);
    };
  }, [useInfiniteScroll, hasMore, loadingMore, loading, currentPage, totalPages]);

  const loadStatusCounts = useCallback(async () => {
    if (!filters.exam_id) {
      setStatusCounts({
        total: 0,
        pending: 0,
        success: 0,
        error: 0,
        error_codes: [],
      });
      setCountsLoading(false);
      return;
    }
    setCountsLoading(true);
    try {
      const counts = await getIdExtractionStatusCounts({
        exam_id: filters.exam_id,
        exam_type: filters.exam_type,
        series: filters.series,
        year: filters.year,
        school_id: filters.school_id,
        subject_id: filters.subject_id,
        q: filters.q,
      });
      setStatusCounts(counts);
    } catch (err) {
      console.error("Error loading ID extraction counts:", err);
    } finally {
      setCountsLoading(false);
    }
  }, [
    filters.exam_id,
    filters.exam_type,
    filters.series,
    filters.year,
    filters.school_id,
    filters.subject_id,
    filters.q,
  ]);

  useEffect(() => {
    void loadStatusCounts();
  }, [loadStatusCounts]);

  const handleExamChange = (value: string | number | "all" | "") => {
    setSelectedIds(new Set());
    setBulkMode(false);
    if (value === "all" || value === "") {
      clearDocumentsResumeScope();
      allowExamUrlWriteRef.current = false;
      setFilters((prev) => {
        const next: DocumentFiltersType = {
          page: 1,
          page_size: prev.page_size || 30,
        };
        if (prev.id_extraction_status) {
          next.id_extraction_status = prev.id_extraction_status;
        }
        if (prev.id_extraction_error_code) {
          next.id_extraction_error_code = prev.id_extraction_error_code;
        }
        return next;
      });
      return;
    }
    const examId = typeof value === "number" ? value : parseInt(String(value), 10);
    const exam = exams.find((e) => e.id === examId);
    allowExamUrlWriteRef.current = true;
    setFilters((prev) => {
      const next: DocumentFiltersType = {
        ...prev,
        exam_id: examId,
        page: 1,
      };
      delete next.school_id;
      delete next.subject_id;
      if (exam) {
        next.exam_type = exam.exam_type as ExamType;
        next.series = exam.series as ExamSeries;
        next.year = exam.year;
      } else {
        delete next.exam_type;
        delete next.series;
        delete next.year;
      }
      return next;
    });
  };
  const handleStatusSelect = (status: "pending" | "success" | "error" | undefined) => {
    setSelectedIds(new Set());
    setBulkMode(false);
    lastSelectedIndexRef.current = null;
    if (status === "error") {
      setViewMode("list");
      setFilters((prev) => ({
        ...prev,
        id_extraction_status: "error",
        page: 1,
        page_size: 50,
      }));
      return;
    }
    setViewMode("grid");
    setFilters((prev) => {
      const next = { ...prev, page: 1, page_size: 30 };
      if (status) {
        next.id_extraction_status = status;
      } else {
        delete next.id_extraction_status;
      }
      delete next.id_extraction_error_code;
      return next;
    });
  };

  const handleFiltersChange = (newFilters: DocumentFiltersType) => {
    setSelectedIds(new Set());
    setFilters(newFilters);
  };

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter) {
      params.set("filter", filter);
    } else {
      params.delete("filter");
    }
    if (filters.exam_id) {
      params.set("exam_id", String(filters.exam_id));
    }
    const qs = params.toString();
    router.push(`/icm-studio/documents${qs ? `?${qs}` : ""}`);
  };

  const handleSelectionChange = (id: number, selected: boolean) => {
    const index = documents.findIndex((d) => d.id === id);
    lastSelectedIndexRef.current = index >= 0 ? index : lastSelectedIndexRef.current;
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleRangeSelect = (id: number) => {
    const toIndex = documents.findIndex((d) => d.id === id);
    if (toIndex < 0) return;
    const fromIndex = lastSelectedIndexRef.current ?? toIndex;
    const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        next.add(documents[i].id);
      }
      return next;
    });
    lastSelectedIndexRef.current = toIndex;
    setFocusedRowIndex(toIndex);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const handleBulkDownload = async () => {
    for (const id of selectedIds) {
      const doc = documents.find((d) => d.id === id);
      if (doc) {
        await handleDownload(doc);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Are you sure you want to delete ${count} document(s)? This cannot be undone.`)) {
      return;
    }
    try {
      const result = await bulkDeleteDocuments(Array.from(selectedIds));
      toast.success(`Deleted ${result.deleted} document(s)`);
      if (result.failed > 0) {
        toast.error(`Failed to delete ${result.failed} document(s)`);
      }
      setSelectedIds(new Set());
      setBulkMode(false);
      setFilters((prev) => ({ ...prev, page: 1 }));
      await loadDocuments(false);
      void loadStatusCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    }
  };

  const handleBulkRetryExtraction = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await bulkExtractDocumentIds(Array.from(selectedIds));
      toast.success(`Queued ${result.queued} document(s) for ID extraction`);
      setSelectedIds(new Set());
      setBulkMode(false);
      await loadDocuments(false);
      void loadStatusCounts();
      startPendingPoll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue extraction");
    }
  };

  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPendingPoll = useCallback(() => {
    if (pendingPollRef.current) {
      clearInterval(pendingPollRef.current);
    }
    let ticks = 0;
    pendingPollRef.current = setInterval(async () => {
      ticks += 1;
      try {
        const response = await listDocuments({
          ...filters,
          page: filters.page ?? 1,
          page_size: filters.page_size || 30,
        });
        const byId = new Map(response.items.map((d) => [d.id, d]));
        setDocuments((prev) => {
          const merged = prev.map((d) => byId.get(d.id) || d);
          const stillPending = merged.some((d) => d.id_extraction_status === "pending");
          if (!stillPending || ticks >= 40) {
            if (pendingPollRef.current) {
              clearInterval(pendingPollRef.current);
              pendingPollRef.current = null;
            }
          }
          return merged;
        });
        setTotal(response.total);
        if (ticks >= 40 && pendingPollRef.current) {
          clearInterval(pendingPollRef.current);
          pendingPollRef.current = null;
        }
      } catch {
        if (ticks >= 40 && pendingPollRef.current) {
          clearInterval(pendingPollRef.current);
          pendingPollRef.current = null;
        }
      }
    }, 3000);
  }, [filters]);

  useEffect(() => {
    return () => {
      if (pendingPollRef.current) {
        clearInterval(pendingPollRef.current);
      }
    };
  }, []);

  const handlePageChange = (page: number) => {
    if (!useInfiniteScroll) {
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    }
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
    setFilters((prev) => ({ ...prev, page: 1, page_size: pageSize }));
  };

  const handleUploadSuccess = () => {
    loadDocuments(false);
    startPendingPoll();
  };

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setSelectedDocument(null);
    setSelectedIndex(-1);
  }, []);

  const advanceAfterResolved = useCallback(
    async (resolvedDocumentId: number, options?: { queueEmptyMessage?: string }) => {
      void loadStatusCounts();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(resolvedDocumentId);
        return next;
      });

      const idx = documents.findIndex((d) => d.id === resolvedDocumentId);
      const remaining = documents.filter((d) => d.id !== resolvedDocumentId);

      if (remaining.length > 0) {
        setDocuments(remaining);
        setTotal((t) => Math.max(0, t - 1));
        const nextIdx = nextIndexAfterRemoval(idx, remaining.length);
        if (viewerOpen && nextIdx >= 0) {
          setSelectedIndex(nextIdx);
          setSelectedDocument(remaining[nextIdx]);
          setFocusedRowIndex(nextIdx);
        }
        return;
      }

      let page = filters.page ?? 1;
      let response = await listDocuments({ ...filters, page });
      if (response.items.length === 0 && page > 1) {
        page -= 1;
        response = await listDocuments({ ...filters, page });
        setFilters((prev) => ({ ...prev, page }));
      }
      setDocuments(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);

      if (viewerOpen && response.items.length > 0) {
        setSelectedIndex(0);
        setSelectedDocument(response.items[0]);
        setFocusedRowIndex(0);
      } else if (viewerOpen) {
        handleCloseViewer();
        toast.success(options?.queueEmptyMessage ?? "All errors resolved");
      }
    },
    [documents, viewerOpen, filters, handleCloseViewer, loadStatusCounts]
  );

  const handleConflictSideResolved = useCallback(async () => {
    if (!selectedDocument) return;
    const currentId = selectedDocument.id;

    const conflictIds: number[] = [];
    try {
      const response = await getDocumentIdExtractionConflicts(currentId);
      conflictIds.push(...response.items.map((item) => item.id));
    } catch (error) {
      console.error("Failed to load duplicate conflicts:", error);
    }
    const fallback =
      selectedDocument.id_extraction_conflict_document_id ??
      parseDuplicateConflictDocumentId(selectedDocument.id_extraction_error);
    if (fallback) {
      conflictIds.push(fallback);
    }
    const uniqueConflictIds = [...new Set(conflictIds.filter((id) => id !== currentId))];

    setConflictRefreshKey((n) => n + 1);

    if (uniqueConflictIds.length > 0) {
      toast.message(
        `${uniqueConflictIds.length} conflicting document${uniqueConflictIds.length === 1 ? "" : "s"} remain`
      );
      return;
    }

    try {
      const result = await extractDocumentId(currentId);
      if (result.is_valid && result.extracted_id) {
        await updateDocumentId(currentId, result.extracted_id);
        toast.success(`Resolved: ${result.extracted_id}`);
        await advanceAfterResolved(currentId, {
          queueEmptyMessage: "All duplicates resolved",
        });
        return;
      }
      toast.message(
        result.error_message || "Still duplicate — change this upload's ID or delete it"
      );
      const updated = await getDocument(currentId);
      setSelectedDocument(updated);
      setDocuments((prev) => prev.map((d) => (d.id === currentId ? updated : d)));
      setConflictRefreshKey((n) => n + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Auto-retry failed");
    }
  }, [selectedDocument, advanceAfterResolved]);

  const handleUpdateId = async (
    documentId: number,
    extractedId: string,
    schoolId?: number,
    subjectId?: number,
    options?: { advance?: boolean }
  ) => {
    try {
      const updated = await updateDocumentId(documentId, extractedId, schoolId, subjectId);
      toast.success("Document ID updated successfully");
      void loadStatusCounts();

      if (isErrorsView && options?.advance !== false) {
        await advanceAfterResolved(documentId, {
          queueEmptyMessage: "All errors resolved",
        });
        return;
      }

      setDocuments((prev) => prev.map((d) => (d.id === documentId ? { ...d, ...updated } : d)));
      if (selectedDocument && selectedDocument.id === documentId) {
        setSelectedDocument({ ...selectedDocument, ...updated });
      }
    } catch (error) {
      throw error;
    }
  };

  const handleDocumentSelect = (doc: Document) => {
    const index = documents.findIndex((d) => d.id === doc.id);
    if (index >= 0) {
      setSelectedIndex(index);
      setFocusedRowIndex(index);
      setSelectedDocument(doc);
      setViewerOpen(true);
    } else {
      setSelectedIndex(-1);
      setSelectedDocument(doc);
      setViewerOpen(true);
    }
  };

  const handleNavigate = useCallback((index: number) => {
    if (index >= 0 && index < documents.length) {
      setSelectedIndex(index);
      setSelectedDocument(documents[index]);
    }
  }, [documents]);

  const handleDeleteClick = (doc: Document, role?: "current" | "conflict") => {
    setDeleteResolutionRole(role ?? null);
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteFromViewer = async (documentId: number) => {
    const isCurrent = selectedDocument?.id === documentId;
    const role: "current" | "conflict" = isCurrent ? "current" : "conflict";
    const local =
      documents.find((d) => d.id === documentId) ||
      (selectedDocument?.id === documentId ? selectedDocument : null);
    if (local) {
      handleDeleteClick(local, role);
      return;
    }
    try {
      const fetched = await getDocument(documentId);
      handleDeleteClick(fetched, role);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Document not found");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;

    const deletedId = documentToDelete.id;
    const role = deleteResolutionRole;
    setDeleteResolutionRole(null);

    if (isErrorsView && viewerOpen && role === "current" && selectedDocument?.id === deletedId) {
      await advanceAfterResolved(deletedId, { queueEmptyMessage: "All duplicates resolved" });
      return;
    }

    if (isErrorsView && viewerOpen && role === "conflict") {
      await handleConflictSideResolved();
      return;
    }

    if (selectedDocument && selectedDocument.id === deletedId) {
      handleCloseViewer();
    } else if (viewerOpen) {
      setConflictRefreshKey((n) => n + 1);
    }
    loadDocuments();
    void loadStatusCounts();
  };

  const handleStartResolveDuplicates = () => {
    const idx =
      focusedRowIndex >= 0 && focusedRowIndex < documents.length ? focusedRowIndex : 0;
    const doc = documents[idx] ?? documents[0];
    if (doc) {
      handleDocumentSelect(doc);
    }
  };

  const duplicateCount =
    statusCounts.error_codes.find((c) => c.code === "duplicate")?.count ?? 0;
  const isDuplicateFilter = filters.id_extraction_error_code === "duplicate";

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch (error) {
      console.error("Failed to download document:", error);
      setDownloadErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Failed to download document. Please try again."
      );
      setDownloadErrorOpen(true);
    }
  };

  useEffect(() => {
    if (documents.length === 0) {
      setFocusedRowIndex(-1);
      return;
    }
    if (focusedRowIndex < 0 || focusedRowIndex >= documents.length) {
      setFocusedRowIndex(0);
    }
  }, [documents, focusedRowIndex]);

  useEffect(() => {
    if (focusedRowIndex < 0 || !documents[focusedRowIndex]) return;
    document
      .getElementById(`document-row-${documents[focusedRowIndex].id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedRowIndex, documents]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (target?.closest('[role="checkbox"]')) {
        return;
      }
      if (viewerOpen || deleteDialogOpen) return;

      if ((e.key === " " || e.key === "Enter") && target?.closest("button, a")) {
        return;
      }

      if (e.key === "Escape") {
        setSelectedIds(new Set());
        return;
      }
      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey) && selectionEnabled) {
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
      if (e.key === " " && documents[focusedRowIndex] && selectionEnabled) {
        e.preventDefault();
        const id = documents[focusedRowIndex].id;
        handleSelectionChange(id, !selectedIds.has(id));
        return;
      }
      if (e.key === "Enter" && documents[focusedRowIndex]) {
        e.preventDefault();
        handleDocumentSelect(documents[focusedRowIndex]);
        return;
      }
      if (
        (e.key === "a" || e.key === "A") &&
        !e.metaKey &&
        !e.ctrlKey &&
        isErrorsView &&
        selectedIds.size > 0
      ) {
        e.preventDefault();
        void handleBulkRetryExtraction();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    documents,
    focusedRowIndex,
    selectedIds,
    viewerOpen,
    deleteDialogOpen,
    selectionEnabled,
    isErrorsView,
  ]);

  return (
    <DashboardLayout title="All files">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title="All files"
          onSearch={scopeReady ? setSearchQuery : undefined}
          searchValue={searchQuery}
          showSearch={scopeReady}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!scopeReady ? (
            <div className="relative mx-4 mb-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,133,63,0.08),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(0,55,100,0.06),_transparent_50%)]"
              />
              <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-14">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Exam-first documents
                </div>
                <p className="mt-3 text-lg font-semibold tracking-tight">
                  Choose an examination to begin
                </p>
                <p className="mt-1.5 max-w-md text-center text-sm text-muted-foreground">
                  Pick an exam to upload sheets and fix ID extraction for that sitting.
                </p>
                <div className="mt-8 w-full max-w-md space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Examination
                  </label>
                  <SearchableSelect
                    options={examOptions}
                    value={filters.exam_id || ""}
                    onValueChange={handleExamChange}
                    placeholder="Select examination…"
                    disabled={loadingExams}
                    triggerClassName="h-11"
                    searchPlaceholder="Search examinations..."
                    emptyMessage="No examinations found"
                  />
                </div>
              </div>
            </div>
          ) : (
          <main className="min-h-0 flex-1 overflow-y-auto w-full">
            {/* Dense control strip */}
            <div className="sticky top-0 z-10 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <div className="w-[180px] sm:w-[240px]">
                    <SearchableSelect
                      options={examOptions}
                      value={filters.exam_id || ""}
                      onValueChange={handleExamChange}
                      placeholder="Examination"
                      disabled={loadingExams}
                      triggerClassName="h-8"
                      searchPlaceholder="Search examinations..."
                      emptyMessage="No examinations found"
                    />
                  </div>
                  <CompactFilters
                    filters={filters}
                    onFiltersChange={handleFiltersChange}
                    hideExam
                  />
                  <IdExtractionStatusPills
                    counts={statusCounts}
                    selected={filters.id_extraction_status}
                    onSelect={handleStatusSelect}
                    loading={countsLoading}
                    dense
                  />
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button
                    variant={filterParam === "recent" ? "secondary" : "outline"}
                    size="sm"
                    className="h-8"
                    onClick={() =>
                      handleFilterChange(filterParam === "recent" ? "" : "recent")
                    }
                  >
                    Recents
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setUploadOpen(true)}
                    className="h-8 gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                  {!isErrorsView && (
                    <Button
                      variant={bulkMode ? "secondary" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => {
                        setBulkMode(!bulkMode);
                        if (bulkMode) {
                          setSelectedIds(new Set());
                        }
                      }}
                    >
                      <Grid3x3 className="h-3.5 w-3.5" />
                      {bulkMode ? "Exit" : "Select"}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">More</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        onClick={() => setBackfillDialogOpen(true)}
                        className="gap-2"
                      >
                        <Database className="h-4 w-4" />
                        Backfill missing fields
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {isErrorsView && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="Keyboard shortcuts"
                        >
                          <Keyboard className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        j/k or arrows focus · Space toggles · Enter opens · Ctrl/Cmd+A selects page · A retries · Esc clears
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setViewMode("grid")}
                      aria-label="Grid view"
                    >
                      <Grid3x3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setViewMode("list")}
                      aria-label="List view"
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {isErrorsView && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-1.5">
                  <span className="mr-1 text-xs text-muted-foreground">Error type:</span>
                  {isDuplicateFilter && duplicateCount > 0 && (
                    <Button
                      variant="default"
                      size="sm"
                      className="mr-1 h-7 text-xs"
                      onClick={handleStartResolveDuplicates}
                      disabled={documents.length === 0}
                    >
                      Resolve duplicates ({duplicateCount.toLocaleString()})
                    </Button>
                  )}
                  {ID_EXTRACTION_ERROR_FILTERS.map((opt) => {
                    const count =
                      opt.value === ""
                        ? statusCounts.error
                        : statusCounts.error_codes.find((c) => c.code === opt.value)?.count ?? 0;
                    if (opt.value && count === 0) return null;
                    return (
                      <Button
                        key={opt.value || "all"}
                        variant={
                          (filters.id_extraction_error_code || "") === opt.value
                            ? "secondary"
                            : "outline"
                        }
                        size="sm"
                        className={cn(
                          "h-7 text-xs",
                          (filters.id_extraction_error_code || "") === opt.value &&
                            "border-destructive/40"
                        )}
                        onClick={() => {
                          setSelectedIds(new Set());
                          lastSelectedIndexRef.current = null;
                          setFilters((prev) => ({
                            ...prev,
                            id_extraction_error_code: opt.value || undefined,
                            page: 1,
                          }));
                        }}
                      >
                        {opt.label}
                        <span className="ml-1 tabular-nums text-muted-foreground">
                          {count.toLocaleString()}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bulk Actions Bar (All / Success / Pending selection mode) */}
            {!isErrorsView && bulkMode && selectedIds.size > 0 && (
              <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedIds.size === documents.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownload}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4 rotate-180" />
                    Download ({selectedIds.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkRetryExtraction}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry ID extract ({selectedIds.size})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBulkMode(false);
                      setSelectedIds(new Set());
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <DocumentUpload
              open={uploadOpen}
              onOpenChange={setUploadOpen}
              onUploadSuccess={handleUploadSuccess}
              initialExamId={filters.exam_id}
            />

            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            )}

            <DocumentList
              documents={documents}
              loading={loading}
              loadingMore={loadingMore}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={filters.page_size || 20}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              viewMode={viewMode}
              onSelect={handleDocumentSelect}
              onDelete={handleDeleteClick}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
              onRangeSelect={handleRangeSelect}
              enableSelection={selectionEnabled}
              focusedRowIndex={focusedRowIndex}
              bulkMode={bulkMode}
              onSelectAll={handleSelectAll}
              infiniteScroll={useInfiniteScroll}
              hasMore={hasMore}
              hideEmptyState={!loading && total === 0}
              emptyTitle={
                searchQuery.trim() || filters.school_id || filters.subject_id || filters.id_extraction_status
                  ? "No matching documents"
                  : "No documents yet"
              }
              emptyDescription={
                searchQuery.trim() || filters.school_id || filters.subject_id || filters.id_extraction_status
                  ? "Try clearing search or filters."
                  : "Upload scanned ICMs to get started."
              }
            />

            {!loading && total === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <p className="text-lg font-medium mb-2">
                  {searchQuery.trim() || filters.school_id || filters.subject_id || filters.id_extraction_status
                    ? "No matching documents"
                    : "No documents yet"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery.trim() || filters.school_id || filters.subject_id || filters.id_extraction_status
                    ? "Try clearing search or filters to see more results."
                    : "Upload scanned ICMs to populate this exam."}
                </p>
                {(searchQuery.trim() || filters.id_extraction_status || filters.id_extraction_error_code) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setFilters((prev) => ({
                        ...prev,
                        q: undefined,
                        id_extraction_status: undefined,
                        id_extraction_error_code: undefined,
                        page: 1,
                      }));
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}

            {!loading && total > 0 && viewMode === "list" && (
              <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
                Showing {documents.length} of {total} document{total !== 1 ? "s" : ""}
              </div>
            )}
            {!loading && total > 0 && useInfiniteScroll && (
              <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
                Loaded {documents.length} of {total} document{total !== 1 ? "s" : ""}
                {!hasMore && documents.length < total
                  ? ` · showing a window of up to ${MAX_INFINITE_SCROLL_ITEMS} (use filters or search to narrow)`
                  : ""}
              </div>
            )}
          </main>
          )}

          {isErrorsView && selectedIds.size > 0 && (
            <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium">
                    {selectedIds.size} selected on this page
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setSelectedIds(new Set());
                      lastSelectedIndexRef.current = null;
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkRetryExtraction}
                    className="h-9 gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry ID extract ({selectedIds.size})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="h-9 gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete ({selectedIds.size})
                  </Button>
                </div>
              </div>
            </div>
          )}

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
              conflictRefreshKey={conflictRefreshKey}
              resolutionQueueMode={isErrorsView}
              queueTotal={total}
              queueLabel={
                isDuplicateFilter || selectedDocument.id_extraction_error_code === "duplicate"
                  ? "Duplicate"
                  : "Error"
              }
              onConflictSideResolved={handleConflictSideResolved}
            />
          )}

          {/* Delete Confirmation Dialog */}
          <DeleteDocumentDialog
            document={documentToDelete}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onSuccess={handleDeleteConfirm}
            confirmDescription={
              deleteResolutionRole === "current"
                ? "Delete this duplicate upload and go to the next error."
                : deleteResolutionRole === "conflict"
                  ? `Delete existing sheet #${documentToDelete?.id ?? ""} and retry this upload.`
                  : undefined
            }
          />

          {/* Backfill Dialog */}
          <BackfillDialog
            open={backfillDialogOpen}
            onOpenChange={setBackfillDialogOpen}
            onSuccess={() => loadDocuments(false)}
          />

          <AlertDialog
            open={downloadErrorOpen}
            onOpenChange={(open) => {
              setDownloadErrorOpen(open);
              if (!open) setDownloadErrorMessage(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Download failed</AlertDialogTitle>
                <AlertDialogDescription>
                  {downloadErrorMessage ||
                    "Failed to download document. Please try again."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>OK</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </DashboardLayout>
  );
}
