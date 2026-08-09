"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ReductoDocumentsDataTable } from "@/components/ReductoDocumentsDataTable";
import {
  getFilteredDocuments,
  getAllExams,
  listSchools,
  listSubjects,
  queueReductoExtraction,
  updateScoresFromReducto,
  getUnmatchedRecords,
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
  UnmatchedExtractionRecord,
} from "@/types/document";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  X,
  Search,
  AlertCircle,
} from "lucide-react";
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

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  const [selectedExamId, setSelectedExamId] = useState<number | undefined>();

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const [updatingScores, setUpdatingScores] = useState<number | null>(null);

  const [unmatchedRecords, setUnmatchedRecords] = useState<UnmatchedExtractionRecord[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const [skipWithoutExtractedId, setSkipWithoutExtractedId] = useState(true);

  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerOpen, setViewerOpen] = useState(false);

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

  const loadDocuments = useCallback(async (isPollingUpdate = false) => {
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
            prevDoc.scores_extracted_at !== newDoc.scores_extracted_at
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
    }
  }, [filters]);

  useEffect(() => {
    loadDocuments(false);
  }, [loadDocuments]);

  useEffect(() => {
    const hasProcessingDocs = documents.some(
      (doc) =>
        doc.scores_extraction_status === "processing" ||
        doc.scores_extraction_status === "queued"
    );

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (!hasProcessingDocs || documents.length === 0) {
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
  }, [documents, loadDocuments]);

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
      const response = await queueReductoExtraction(documentIds, skipWithoutExtractedId);
      await loadDocuments(false);
      setSelectedDocuments(new Set());
      const parts: string[] = [];
      if (response.queued_count > 0) {
        parts.push(`${response.queued_count} document(s) queued for extraction`);
      }
      if ((response.skipped_count ?? 0) > 0) {
        parts.push(`${response.skipped_count} skipped (no extracted ID)`);
      }
      if (parts.length > 0) {
        toast.success(parts.join(" · "));
      } else {
        toast.message("No documents were queued");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue documents for Reducto extraction");
      console.error("Error queueing documents:", err);
      toast.error("Failed to queue documents for extraction");
    } finally {
      setQueuing(false);
    }
  };

  const handleUpdateScores = async (document: Document) => {
    setUpdatingScores(document.id);
    try {
      const response = await updateScoresFromReducto(document.id, verifyEnabled);
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
      await downloadDocument(doc.id, getDocumentDownloadFilename(doc));
    } catch (downloadError) {
      console.error("Failed to download document:", downloadError);
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

  const stats = {
    total,
    queued: documents.filter((d) => d.scores_extraction_status === "queued").length,
    processing: documents.filter((d) => d.scores_extraction_status === "processing").length,
    success: documents.filter((d) => d.scores_extraction_status === "success").length,
    error: documents.filter((d) => d.scores_extraction_status === "error").length,
    pending: documents.filter(
      (d) => !d.scores_extraction_status || d.scores_extraction_status === "pending"
    ).length,
  };

  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];

    if (selectedExamId) {
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        const typeLabel =
          exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
        chips.push({
          label: `Exam: ${exam.year} ${exam.series} ${typeLabel}`,
          onRemove: () => setSelectedExamId(undefined),
        });
      }
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
        label: `Paper: ${filters.test_type}`,
        onRemove: () => handleFilterChange("test_type", undefined),
      });
    }
    if (filters.extraction_status) {
      chips.push({
        label: `Status: ${filters.extraction_status}`,
        onRemove: () => handleStatusFilter(undefined),
      });
    }

    return chips;
  };

  const handleStatusFilter = (status: string | undefined) => {
    const newFilters = { ...filters };
    if (status) {
      newFilters.extraction_status = status as
        | "queued"
        | "processing"
        | "success"
        | "error"
        | "pending";
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
    setSelectedExamId(undefined);
    setFilters({ page: 1, page_size: 50 });
    setSelectedDocuments(new Set());
  };

  const hasActiveFilters =
    selectedExamId ||
    filters.school_id ||
    filters.subject_id ||
    filters.test_type ||
    filters.extraction_status;

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar title="Reducto Extraction" />

        <div className="border-b border-border bg-background px-4 py-2">
          <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Queue and monitor Reducto extraction. When documents succeed, apply scores on the Apply
              Scores page.
            </p>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/scores/data-entry/apply-scores">Apply Scores</Link>
            </Button>
          </div>
        </div>

        {!loading && documents.length > 0 && (
          <div className="border-b border-border bg-background px-4 py-2">
            <div className="mx-auto flex max-w-[2000px] flex-wrap items-center gap-4">
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => handleStatusFilter(undefined)}
              >
                <FileText className="h-4 w-4" />
                <span className="font-medium">Total:</span>
                <span className="font-bold text-foreground">{stats.total}</span>
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 text-sm transition-colors hover:text-blue-600"
                onClick={() => handleStatusFilter("queued")}
              >
                <Clock className="h-4 w-4" />
                <span className="font-medium">Queued:</span>
                <span className="font-bold text-blue-600">{stats.queued}</span>
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 text-sm transition-colors hover:text-blue-600"
                onClick={() => handleStatusFilter("processing")}
              >
                <Loader2 className={`h-4 w-4 ${stats.processing > 0 ? "animate-spin" : ""}`} />
                <span className="font-medium">Processing:</span>
                <span className="font-bold text-blue-600">{stats.processing}</span>
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 text-sm transition-colors hover:text-green-600"
                onClick={() => handleStatusFilter("success")}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Success:</span>
                <span className="font-bold text-green-600">{stats.success}</span>
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 text-sm transition-colors hover:text-red-600"
                onClick={() => handleStatusFilter("error")}
              >
                <XCircle className="h-4 w-4" />
                <span className="font-medium">Errors:</span>
                <span className="font-bold text-red-600">{stats.error}</span>
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 text-sm transition-colors hover:text-yellow-600"
                onClick={() => handleStatusFilter("pending")}
              >
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Pending:</span>
                <span className="font-bold text-yellow-600">{stats.pending}</span>
              </button>
            </div>
          </div>
        )}

        <div className="border-b border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-[2000px]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[280px]">
                <SearchableSelect
                  options={examOptions}
                  value={selectedExamId || ""}
                  onValueChange={handleExamChange}
                  placeholder="Examination"
                  disabled={loadingFilters}
                  allowAll={true}
                  allLabel="All examinations"
                  searchPlaceholder="Search examinations..."
                  emptyMessage="No examinations found"
                />
              </div>

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
                      handleFilterChange(
                        "school_id",
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
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
                      handleFilterChange(
                        "subject_id",
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
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

              <Select
                value={filters.test_type || undefined}
                onValueChange={(value) =>
                  handleFilterChange("test_type", value === "all" ? undefined : value)
                }
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

              <Button
                onClick={handleFetchDocuments}
                disabled={loading}
                size="sm"
                className="h-8 gap-2"
              >
                <Search className="h-4 w-4" />
                {loading ? "Fetching..." : "Fetch"}
              </Button>

              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={handleClearFilters} className="h-8">
                  Clear All
                </Button>
              )}
            </div>

            {getActiveFilterChips().length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Active:</span>
                {getActiveFilterChips().map((chip, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="h-5 cursor-pointer gap-1 pr-1 text-xs hover:bg-secondary/80"
                    onClick={chip.onRemove}
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
          <ReductoDocumentsDataTable
            documents={documents}
            loading={loading && loadingFilters}
            error={error}
            selectedDocuments={selectedDocuments}
            onSelectDocument={handleSelectDocument}
            onSelectAll={handleSelectAll}
            onRowClick={handleViewDocument}
            statusFilter={filters.extraction_status}
            onStatusFilterChange={handleStatusFilter}
            pageSize={filters.page_size || 50}
            onPageSizeChange={(size) =>
              setFilters((prev) => ({ ...prev, page_size: size, page: 1 }))
            }
            verifyEnabled={verifyEnabled}
            onVerifyEnabledChange={setVerifyEnabled}
            skipWithoutExtractedId={skipWithoutExtractedId}
            onSkipWithoutExtractedIdChange={setSkipWithoutExtractedId}
            queuing={queuing}
            isPolling={isPolling}
            onQueue={handleQueueForReducto}
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>

        {showUnmatched && (
          <Card className="mx-4 mb-4">
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
                <div className="flex h-32 items-center justify-center">
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
          onUpdateScores={handleUpdateScores}
          updatingScores={updatingScores === selectedDocument.id}
        />
      )}
    </DashboardLayout>
  );
}
