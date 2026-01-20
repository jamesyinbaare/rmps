"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFilteredDocuments, getAllExams, listSchools, listSubjects, queueReductoExtraction, getReductoStatus, findExamId, getReductoData, updateScoresFromReducto, getUnmatchedRecords, resolveUnmatchedRecord, ignoreUnmatchedRecord, downloadDocument, API_BASE_URL } from "@/lib/api";
import type { Document, Exam, School, Subject, ScoreDocumentFilters, ExamType, ExamSeries, ReductoDataResponse, UpdateScoresFromReductoResponse, UnmatchedExtractionRecord } from "@/types/document";
import { Loader2, CheckCircle2, XCircle, Clock, Send, Eye, RefreshCw, AlertCircle, Filter, FileText, Users, X, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DocumentViewer } from "@/components/DocumentViewer";
import { toast } from "sonner";

export default function ReductoExtractionPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>({
    page: 1,
    page_size: 50,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());
  const [queuing, setQueuing] = useState(false);

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Exam filtering state (three-step: type, series, year)
  const [examType, setExamType] = useState<ExamType | undefined>();
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>();
  const [examYear, setExamYear] = useState<number | undefined>();

  // Polling for status updates - use ref to avoid dependency issues
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Preview and update states
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewData, setPreviewData] = useState<ReductoDataResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [updatingScores, setUpdatingScores] = useState<number | null>(null);
  const [previewViewMode, setPreviewViewMode] = useState<"table" | "json">("table");
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Unmatched records state
  const [unmatchedRecords, setUnmatchedRecords] = useState<UnmatchedExtractionRecord[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  // Document viewer state
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Load filter options
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

  // Load documents - show all documents including successfully extracted ones
  const loadDocuments = useCallback(async (isPolling = false) => {
    // Only show loading state on initial load, not during polling
    if (!isPolling) {
      setLoading(true);
      setError(null);
    }
    try {
      // Fetch all documents, including successfully extracted ones
      const response = await getFilteredDocuments(filters);
      // Show ALL documents, including successfully extracted ones
      const allDocs = response.items;

      // Only update state if data actually changed to prevent unnecessary re-renders and flickering
      setDocuments((prevDocs) => {
        // Quick check: if lengths differ, definitely update
        if (prevDocs.length !== allDocs.length) {
          return allDocs;
        }
        // Check if any document status changed by comparing IDs and statuses
        const prevDocsMap = new Map(prevDocs.map(d => [d.id, d]));
        const hasChanges = allDocs.some((newDoc) => {
          const prevDoc = prevDocsMap.get(newDoc.id);
          return !prevDoc ||
                 prevDoc.scores_extraction_status !== newDoc.scores_extraction_status ||
                 prevDoc.scores_extracted_at !== newDoc.scores_extracted_at;
        });
        // Only update if there are actual changes to prevent flickering
        return hasChanges ? allDocs : prevDocs;
      });

      // Only update totals on initial load to avoid unnecessary updates during polling
      // Use backend total for pagination, not filtered count
      if (!isPolling) {
        setTotal(response.total);
        setTotalPages(response.total_pages);
        setCurrentPage(response.page);
      }
    } catch (err) {
      // Only show error on initial load, not polling (to avoid flickering)
      if (!isPolling) {
        setError(err instanceof Error ? err.message : "Failed to load documents");
      }
      console.error("Error loading documents:", err);
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    loadDocuments(false);
  }, [loadDocuments]);

  // Poll for status updates every 3 seconds (only when there are processing/queued documents)
  useEffect(() => {
    // Only poll if there are documents that might be processing
    const hasProcessingDocs = documents.some(
      (doc) => doc.scores_extraction_status === "processing" || doc.scores_extraction_status === "queued"
    );

    // Clear existing interval first
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (!hasProcessingDocs || documents.length === 0) {
      // No need to poll if all documents are in final states or no documents
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const interval = setInterval(() => {
      loadDocuments(true); // Pass true to indicate this is a polling update (won't show loading state)
    }, 3000);

    pollingIntervalRef.current = interval;

    return () => {
      if (interval) {
        clearInterval(interval);
        pollingIntervalRef.current = null;
        setIsPolling(false);
      }
    };
  }, [documents, loadDocuments]);

  // Update filters when exam type, series, or year changes
  useEffect(() => {
    const newFilters: ScoreDocumentFilters = { ...filters };

    // Set or clear exam_type, series, and year based on selections
    if (examType) {
      newFilters.exam_type = examType;
    } else {
      delete newFilters.exam_type;
      delete newFilters.series;
      delete newFilters.year;
    }

    if (examSeries && examType) {
      newFilters.series = examSeries;
    } else {
      delete newFilters.series;
      delete newFilters.year;
    }

    if (examYear && examType && examSeries) {
      newFilters.year = examYear;
    } else {
      delete newFilters.year;
    }

    // If all three are selected, also set exam_id for backward compatibility
    if (examType && examSeries && examYear && exams.length > 0) {
      const foundExamId = findExamId(exams, examType, examSeries, examYear);
      if (foundExamId) {
        newFilters.exam_id = foundExamId;
      } else {
        delete newFilters.exam_id;
      }
    } else {
      delete newFilters.exam_id;
    }

    newFilters.page = 1;
    setFilters(newFilters);
    setSelectedDocuments(new Set()); // Clear selection when filters change
  }, [examType, examSeries, examYear, exams]);

  // Reverse lookup: only sync from filters to local state on initial mount (when exams load)
  // This prevents infinite loops - local state changes will update filters via the other effect
  useEffect(() => {
    if (exams.length > 0 && (!examType && !examSeries && !examYear)) {
      // Only sync if local state is empty and filters have values (initial load scenario)
      if (filters.exam_type || filters.series || filters.year) {
        if (filters.exam_type) setExamType(filters.exam_type);
        if (filters.series) setExamSeries(filters.series);
        if (filters.year) setExamYear(filters.year);
      } else if (filters.exam_id) {
        const exam = exams.find((e) => e.id === filters.exam_id);
        if (exam) {
          setExamType(exam.exam_type as ExamType);
          setExamSeries(exam.series as ExamSeries);
          setExamYear(exam.year);
        }
      }
    }
    // Only run when exams load, not when filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams.length]);

  const handleFilterChange = (key: keyof ScoreDocumentFilters, value: number | string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filter changes
    }));
    setSelectedDocuments(new Set()); // Clear selection when filters change
  };

  const handleExamTypeChange = (value: string) => {
    if (value === "all" || value === "") {
      setExamType(undefined);
    } else {
      setExamType(value as ExamType);
      setExamSeries(undefined);
      setExamYear(undefined);
    }
  };

  const handleExamSeriesChange = (value: string) => {
    if (value === "all" || value === "") {
      setExamSeries(undefined);
    } else {
      setExamSeries(value as ExamSeries);
      setExamYear(undefined);
    }
  };

  const handleExamYearChange = (value: string) => {
    if (value === "all" || value === "") {
      setExamYear(undefined);
    } else {
      setExamYear(parseInt(value, 10));
    }
  };

  const handleSelectDocument = (documentId: number) => {
    setSelectedDocuments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === documents.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documents.map((d) => d.id)));
    }
  };

  const handleQueueForReducto = async () => {
    if (selectedDocuments.size === 0) {
      setError("Please select at least one document");
      return;
    }

    setQueuing(true);
    setError(null);
    try {
      const documentIds = Array.from(selectedDocuments);
      const response = await queueReductoExtraction(documentIds);

      // Refresh documents to show updated status
      await loadDocuments(false);

      // Clear selection
      setSelectedDocuments(new Set());

      // Show success message
      if (response.queued_count > 0) {
        toast.success(`${response.queued_count} document(s) queued for extraction`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue documents for Reducto extraction");
      console.error("Error queueing documents:", err);
      toast.error("Failed to queue documents for extraction");
    } finally {
      setQueuing(false);
    }
  };

  const handlePreview = async (document: Document) => {
    // Check if document has extraction data before attempting to preview
    if (!document.scores_extraction_data) {
      toast.error("No extraction data available for this document");
      return;
    }

    setPreviewDocument(document);
    setPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewData(null);
    setPreviewViewMode("table"); // Reset to table view when opening preview
    setImageLoading(true);
    setImageError(false);
    try {
      const data = await getReductoData(document.id);
      setPreviewData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load preview data";
      toast.error(errorMessage);
      console.error("Error loading preview:", err);
      // Close the dialog if there's an error
      setPreviewOpen(false);
      setPreviewDocument(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleUpdateScores = async (document: Document) => {
    setUpdatingScores(document.id);
    try {
      const response = await updateScoresFromReducto(document.id);
      toast.success(
        `Updated ${response.updated_count} score(s). ${response.unmatched_count} unmatched record(s) saved.`
      );
      if (response.unmatched_count > 0) {
        setShowUnmatched(true);
        loadUnmatchedRecords();
      }
      await loadDocuments(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scores");
      console.error("Error updating scores:", err);
    } finally {
      setUpdatingScores(null);
    }
  };

  const handleViewDocument = (document: Document) => {
    const index = documents.findIndex((d) => d.id === document.id);
    setSelectedIndex(index >= 0 ? index : -1);
    setSelectedDocument(document);
    setViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
    setSelectedIndex(-1);
  };

  const handleNavigate = (index: number) => {
    if (index >= 0 && index < documents.length) {
      setSelectedIndex(index);
      setSelectedDocument(documents[index]);
    }
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
      toast.error("Failed to download document. Please try again.");
    }
  };

  const loadUnmatchedRecords = async () => {
    setLoadingUnmatched(true);
    try {
      const response = await getUnmatchedRecords({ status: "pending", page: 1, page_size: 50 });
      setUnmatchedRecords(response.items);
    } catch (err) {
      console.error("Error loading unmatched records:", err);
    } finally {
      setLoadingUnmatched(false);
    }
  };

  // Parse extraction data to extract candidates from various formats
  // Handles the same formats as the backend: direct candidates, tables, nested data.candidates, nested data.tables
  const parseCandidatesFromData = (data: Record<string, any>): any[] => {
    if (!data || typeof data !== "object") {
      return [];
    }

    let candidates: any[] = [];

    // Helper function to convert rows to candidates format
    const extractCandidatesFromRows = (rows: any[]): any[] => {
      const result: any[] = [];
      if (!Array.isArray(rows)) {
        return result;
      }
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        if (row && typeof row === "object") {
          const candidate = {
            index_number: row.index_number || row.indexNumber || null,
            candidate_name: row.candidate_name || row.candidateName || row.name || null,
            score: row.raw_score || row.rawScore || row.score || null,
            attend: row.attend || null,
            verify: row.verify || null,
            sn: row.sn || row.serial_number || row.serialNumber || row.row_number || row.rowNumber || (idx + 1),
          };
          result.push(candidate);
        }
      }
      return result;
    };

    // 1. Try direct candidates key
    if (Array.isArray(data.candidates)) {
      candidates = data.candidates;
      if (candidates.length > 0) {
        return candidates;
      }
    }

    // 2. Try tables format at top level (only if no candidates found)
    if (candidates.length === 0 && Array.isArray(data.tables)) {
      for (const table of data.tables) {
        if (table && typeof table === "object" && Array.isArray(table.rows)) {
          candidates.push(...extractCandidatesFromRows(table.rows));
        }
      }
      if (candidates.length > 0) {
        return candidates;
      }
    }

    // 3. Try nested data format (only if no candidates found yet)
    if (candidates.length === 0 && data.data && typeof data.data === "object") {
      const nestedData = data.data;

      // Check for candidates in nested data
      if (Array.isArray(nestedData.candidates)) {
        candidates = nestedData.candidates;
        if (candidates.length > 0) {
          return candidates;
        }
      }

      // Check for tables in nested data
      if (candidates.length === 0 && Array.isArray(nestedData.tables)) {
        for (const table of nestedData.tables) {
          if (table && typeof table === "object" && Array.isArray(table.rows)) {
            candidates.push(...extractCandidatesFromRows(table.rows));
          }
        }
        if (candidates.length > 0) {
          return candidates;
        }
      }
    }

    return candidates;
  };

  // Calculate statistics
  const stats = {
    total: total,
    queued: documents.filter((d) => d.scores_extraction_status === "queued").length,
    processing: documents.filter((d) => d.scores_extraction_status === "processing").length,
    success: documents.filter((d) => d.scores_extraction_status === "success").length,
    error: documents.filter((d) => d.scores_extraction_status === "error").length,
    pending: documents.filter((d) => !d.scores_extraction_status || d.scores_extraction_status === "pending").length,
  };

  // Get active filter chips
  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];

    if (examType) {
      chips.push({
        label: `Type: ${examType === "Certificate II Examination" ? "Certificate II" : examType}`,
        onRemove: () => handleExamTypeChange("all"),
      });
    }
    if (examSeries) {
      chips.push({
        label: `Series: ${examSeries}`,
        onRemove: () => handleExamSeriesChange("all"),
      });
    }
    if (examYear) {
      chips.push({
        label: `Year: ${examYear}`,
        onRemove: () => handleExamYearChange("all"),
      });
    }
    if (filters.school_id) {
      const school = schools.find((s) => s.id === filters.school_id);
      chips.push({
        label: `School: ${school ? `${school.code} - ${school.name}` : `ID: ${filters.school_id}`}`,
        onRemove: () => handleFilterChange("school_id", undefined),
      });
    }
    if (filters.subject_id) {
      const subject = subjects.find((s) => s.id === filters.subject_id);
      chips.push({
        label: `Subject: ${subject ? `${subject.code} - ${subject.name}` : `ID: ${filters.subject_id}`}`,
        onRemove: () => handleFilterChange("subject_id", undefined),
      });
    }
    if (filters.test_type) {
      chips.push({
        label: `Test: ${filters.test_type === "1" ? "Objectives" : "Essay"}`,
        onRemove: () => handleFilterChange("test_type", undefined),
      });
    }

    return chips;
  };

  const handleStatusFilter = (status: string | undefined) => {
    const newFilters = { ...filters };
    if (status) {
      newFilters.extraction_status = status as "queued" | "processing" | "success" | "error" | "pending";
    } else {
      delete newFilters.extraction_status;
    }
    newFilters.page = 1;
    setFilters(newFilters);
    setSelectedDocuments(new Set());
  };

  const handleFetchDocuments = () => {
    loadDocuments(false);
  };

  const handleClearFilters = () => {
    setExamType(undefined);
    setExamSeries(undefined);
    setExamYear(undefined);
    setFilters({ page: 1, page_size: 50 });
    setSelectedDocuments(new Set());
  };

  // Compute available filter options (similar to Digital page)
  const availableExamTypes = Array.from(new Set(exams.map((e) => e.exam_type as ExamType)));
  const filteredExamsForSeries = examType ? exams.filter((e) => e.exam_type === examType) : exams;
  const availableSeries = Array.from(new Set(filteredExamsForSeries.map((e) => e.series as ExamSeries)));
  let filteredExamsForYears = exams;
  if (examType) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.exam_type === examType);
  }
  if (examSeries) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.series === examSeries);
  }
  const availableYears = Array.from(new Set(filteredExamsForYears.map((e) => e.year)))
    .sort((a, b) => b - a);

  const hasActiveFilters = examType || examSeries || examYear || filters.school_id || filters.subject_id || filters.test_type || filters.extraction_status;

  const getStatusBadge = (document: Document) => {
    const status = document.scores_extraction_status;
    const methods = document.scores_extraction_methods;
    const methodDisplay = methods && methods.length > 0 ? methods.join(", ") : null;

    if (status === "queued") {
      return (
        <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-300">
          <Clock className="h-3 w-3" />
          Queued
        </Badge>
      );
    }
    if (status === "processing") {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-blue-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    }
    if (status === "success") {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Success {methodDisplay && `(${methodDisplay})`}
        </Badge>
      );
    }
    if (status === "error") {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
        <Clock className="h-3 w-3 mr-1" />
        {status || "Pending"}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Reducto Extraction" />

        {/* Statistics Dashboard */}
        {!loading && documents.length > 0 && (
          <div className="border-b border-border bg-background px-6 py-4">
            <div className="grid gap-4 md:grid-cols-6 max-w-[2000px] mx-auto">
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilter(undefined)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total</p>
                      <p className="text-2xl font-bold mt-1">{stats.total.toLocaleString()}</p>
                    </div>
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilter("queued")}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Queued</p>
                      <p className="text-2xl font-bold mt-1 text-blue-600">{stats.queued.toLocaleString()}</p>
                    </div>
                    <Clock className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilter("processing")}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Processing</p>
                      <p className="text-2xl font-bold mt-1 text-blue-600">{stats.processing.toLocaleString()}</p>
                    </div>
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilter("success")}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Success</p>
                      <p className="text-2xl font-bold mt-1 text-green-600">{stats.success.toLocaleString()}</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilter("error")}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Errors</p>
                      <p className="text-2xl font-bold mt-1 text-red-600">{stats.error.toLocaleString()}</p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleStatusFilter("pending")}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Pending</p>
                      <p className="text-2xl font-bold mt-1 text-yellow-600">{stats.pending.toLocaleString()}</p>
                    </div>
                    <Clock className="h-8 w-8 text-yellow-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Filters - Compact Horizontal Layout */}
          <div className="border-b border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap max-w-[2000px] mx-auto">
              {/* Examination Type */}
              <Select
                value={examType || "all"}
                onValueChange={handleExamTypeChange}
                disabled={loadingFilters}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Exam Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {availableExamTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "Certificate II Examination" ? "Certificate II" : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Examination Series */}
              <Select
                value={examSeries || "all"}
                onValueChange={handleExamSeriesChange}
                disabled={loadingFilters || !examType}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All series</SelectItem>
                  {availableSeries.map((series) => (
                    <SelectItem key={series} value={series}>
                      {series}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Examination Year */}
              <Select
                value={examYear?.toString() || "all"}
                onValueChange={handleExamYearChange}
                disabled={loadingFilters || !examType || !examSeries}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* School - Searchable */}
              <div className="w-[240px]">
                <SearchableSelect
                  options={schools.map((school) => ({
                    value: school.id,
                    label: `${school.code} - ${school.name}`,
                  }))}
                  value={filters.school_id || ""}
                  onValueChange={(value) => {
                    if (value === "all" || value === "") {
                      handleFilterChange("school_id", undefined);
                    } else {
                      handleFilterChange("school_id", typeof value === "number" ? value : parseInt(String(value)));
                    }
                  }}
                  placeholder="School"
                  disabled={loadingFilters}
                  allowAll={true}
                  allLabel="All schools"
                  searchPlaceholder="Search schools..."
                  emptyMessage="No schools found"
                />
              </div>

              {/* Subject - Searchable */}
              <div className="w-[240px]">
                <SearchableSelect
                  options={subjects.map((subject) => ({
                    value: subject.id,
                    label: `${subject.code} - ${subject.name}`,
                  }))}
                  value={filters.subject_id || ""}
                  onValueChange={(value) => {
                    if (value === "all" || value === "") {
                      handleFilterChange("subject_id", undefined);
                    } else {
                      handleFilterChange("subject_id", typeof value === "number" ? value : parseInt(String(value)));
                    }
                  }}
                  placeholder="Subject"
                  disabled={loadingFilters}
                  allowAll={true}
                  allLabel="All subjects"
                  searchPlaceholder="Search subjects..."
                  emptyMessage="No subjects found"
                />
              </div>

              {/* Paper Type */}
              <Select
                value={filters.test_type || undefined}
                onValueChange={(value) => handleFilterChange("test_type", value === "all" ? undefined : value)}
                disabled={loadingFilters}
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="Paper" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All papers</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={handleFetchDocuments} disabled={loading} size="sm" className="h-8 gap-2">
                <Search className="h-4 w-4" />
                {loading ? "Fetching..." : "Fetch"}
              </Button>

              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={handleClearFilters} className="h-8">
                  Clear All
                </Button>
              )}
            </div>

            {/* Active Filter Chips */}
            {getActiveFilterChips().length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 max-w-[2000px] mx-auto">
                <span className="text-xs text-muted-foreground">Active:</span>
                {getActiveFilterChips().map((chip, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80 text-xs h-5"
                    onClick={chip.onRemove}
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
                {filters.extraction_status && (
                  <Badge
                    variant="secondary"
                    className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80 text-xs h-5"
                    onClick={() => handleStatusFilter(undefined)}
                  >
                    Status: {filters.extraction_status}
                    <X className="h-3 w-3" />
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Documents Table */}
          <Card className="flex-1 overflow-hidden flex flex-col mx-6 mb-6 mt-6">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <div className="flex items-center gap-4">
                  {selectedDocuments.size > 0 && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">
                      <Users className="h-3 w-3 mr-1" />
                      {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                    </Badge>
                  )}
                  {isPolling && (
                    <Badge variant="outline" className="text-xs">
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      Auto-refreshing...
                    </Badge>
                  )}
                  <Button
                    onClick={handleQueueForReducto}
                    disabled={selectedDocuments.size === 0 || queuing}
                    size="lg"
                  >
                    {queuing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Queueing...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Queue {selectedDocuments.size > 0 ? `${selectedDocuments.size} ` : ''}for Reducto
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {/* Page Size Selector and Pagination Info */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Show</span>
                  <Select
                    value={(filters.page_size || 50).toString()}
                    onValueChange={(value) => {
                      setFilters((prev) => ({
                        ...prev,
                        page_size: parseInt(value, 10),
                        page: 1, // Reset to first page when page size changes
                      }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="1000">1000</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">per page</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Showing {documents.length > 0 ? ((currentPage - 1) * (filters.page_size || 50) + 1) : 0} to {Math.min(currentPage * (filters.page_size || 50), total)} of {total} documents
                </div>
              </div>
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {loading && loadingFilters ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <div className="text-sm text-muted-foreground">Loading documents...</div>
                  <div className="mt-4 w-full max-w-md">
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedDocuments.size === documents.length && documents.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Extracted ID</TableHead>
                      <TableHead>School Name</TableHead>
                      <TableHead>Extraction Status</TableHead>
                      <TableHead>Extracted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="h-12 w-12 text-muted-foreground/50" />
                            <p className="font-medium">No documents found</p>
                            <p className="text-sm">Try adjusting your filters or check back later</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      documents.map((document) => {
                        const status = document.scores_extraction_status;
                        // Only show preview data button if document has extraction data
                        const canPreview = (status === "success" || status === "processing") && document.scores_extraction_data;
                        const canUpdate = status === "success";
                        const rowClass = status === "error"
                          ? "bg-red-50/50 hover:bg-red-100/50"
                          : status === "processing"
                          ? "bg-blue-50/50 hover:bg-blue-100/50"
                          : status === "queued"
                          ? "bg-yellow-50/50 hover:bg-yellow-100/50"
                          : "";
                        return (
                        <TableRow key={document.id} className={rowClass}>
                          <TableCell>
                            <Checkbox
                              checked={selectedDocuments.has(document.id)}
                              onCheckedChange={() => handleSelectDocument(document.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium font-mono text-sm">{document.extracted_id || "-"}</TableCell>
                          <TableCell>{document.school_name || "-"}</TableCell>
                          <TableCell>{getStatusBadge(document)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {document.scores_extracted_at
                              ? new Date(document.scores_extracted_at).toLocaleString()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewDocument(document)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View Document
                              </Button>
                              {canPreview && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePreview(document)}
                                  disabled={loadingPreview}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Preview Data
                                </Button>
                              )}
                              {canUpdate && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleUpdateScores(document)}
                                  disabled={updatingScores === document.id}
                                >
                                  {updatingScores === document.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      Updating...
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="h-4 w-4 mr-1" />
                                      Update Scores
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unmatched Records Section */}
          {showUnmatched && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Unmatched Records</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowUnmatched(false)}>
                    Hide
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingUnmatched ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : unmatchedRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No unmatched records found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Index Number</TableHead>
                        <TableHead>Candidate Name</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatchedRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{record.index_number || "-"}</TableCell>
                          <TableCell>{record.candidate_name || "-"}</TableCell>
                          <TableCell>{record.score || "-"}</TableCell>
                          <TableCell>
                            {record.document_extracted_id || `Doc #${record.document_id}`}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          documents={documents}
          currentIndex={selectedIndex}
          open={viewerOpen}
          onClose={handleCloseViewer}
          onNavigate={handleNavigate}
          onDownload={handleDownload}
        />
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="min-w-[80vw] xl:max-w-6xl w-full max-h-[95vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>
              Preview Reducto Data - {previewDocument?.extracted_id || previewDocument?.file_name}
            </DialogTitle>
            <DialogDescription>
              Extracted data from {previewDocument?.file_name}
            </DialogDescription>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex items-center justify-center h-96 px-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : previewData && previewDocument ? (
            <div className="flex flex-row h-[calc(95vh-8rem)] overflow-hidden">
              {/* Left side - Document Preview */}
              <div className="flex-1 overflow-y-auto px-6 pb-6 bg-muted/30 border-r border-border">
                <div className="sticky top-0 bg-background border-b border-border pb-4 mb-4 pt-4 z-10">
                  <h3 className="font-medium text-sm mb-2">Document Preview</h3>
                  <p className="text-xs text-muted-foreground">{previewDocument.file_name}</p>
                </div>
                <div className="flex items-center justify-center min-h-[400px] relative">
                  {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {imageError ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText className="h-12 w-12 mb-2" />
                      <p className="text-sm">Failed to load document image</p>
                    </div>
                  ) : previewDocument.mime_type?.startsWith("image/") ? (
                    <img
                      src={`${API_BASE_URL}/api/v1/documents/${previewDocument.id}/download`}
                      alt={previewDocument.extracted_id || previewDocument.file_name}
                      className="max-w-full max-h-[calc(95vh-12rem)] object-contain rounded-lg shadow-lg"
                      onLoad={() => setImageLoading(false)}
                      onError={() => {
                        setImageLoading(false);
                        setImageError(true);
                      }}
                      style={{ display: imageLoading ? "none" : "block" }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText className="h-12 w-12 mb-2" />
                      <p className="text-sm">Document preview not available for this file type</p>
                      <p className="text-xs mt-1">MIME type: {previewDocument.mime_type}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right side - Extraction Data */}
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Status:</span> {previewData.status}
                    </div>
                    <div>
                      <span className="font-medium">Confidence:</span>{" "}
                      {previewData.confidence ? `${(previewData.confidence * 100).toFixed(1)}%` : "N/A"}
                    </div>
                    {previewData.extracted_at && (
                      <div>
                        <span className="font-medium">Extracted At:</span>{" "}
                        {new Date(previewData.extracted_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* View Toggle */}
                  <Tabs value={previewViewMode} onValueChange={(value) => setPreviewViewMode(value as "table" | "json")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="table">Table View</TabsTrigger>
                      <TabsTrigger value="json">JSON / Raw</TabsTrigger>
                    </TabsList>

                    <TabsContent value="table" className="mt-4">
                      {(() => {
                        const candidates = parseCandidatesFromData(previewData.data);
                        if (candidates.length > 0) {
                          return (
                            <div>
                              <h3 className="font-medium mb-2">Candidates ({candidates.length})</h3>
                              <div className="border rounded-lg overflow-auto max-h-[calc(95vh-20rem)]">
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
                                            ? (typeof candidate.attend === "string" && (candidate.attend === "A" || candidate.attend === "AA")
                                              ? candidate.attend
                                              : "✓")
                                            : "-"}
                                        </TableCell>
                                        <TableCell>{candidate.score || "-"}</TableCell>
                                        <TableCell>
                                          {candidate.verify
                                            ? (typeof candidate.verify === "string" && (candidate.verify === "A" || candidate.verify === "AA")
                                              ? candidate.verify
                                              : candidate.verify === true || candidate.verify === "✓" || candidate.verify === "✔" || candidate.verify === "√"
                                              ? "✓"
                                              : String(candidate.verify))
                                            : "-"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          );
                        } else {
                          return (
                            <div className="text-sm text-muted-foreground">
                              <p>No candidate data available in table format.</p>
                              <p className="mt-2 text-xs">The data structure may not match expected formats (candidates, tables, or nested data).</p>
                            </div>
                          );
                        }
                      })()}
                    </TabsContent>

                    <TabsContent value="json" className="mt-4">
                      <div className="text-sm">
                        <h3 className="font-medium mb-2">Raw JSON Data</h3>
                        <pre className="bg-muted p-4 rounded overflow-auto max-h-[calc(95vh-20rem)] text-xs">
                          {JSON.stringify(previewData.data, null, 2)}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">No preview data available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
