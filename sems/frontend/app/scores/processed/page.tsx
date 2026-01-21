"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFilteredDocuments, getAllExams, listSchools, listSubjects, findExamId, getReductoData, updateScoresFromReducto, getUnmatchedRecords, API_BASE_URL } from "@/lib/api";
import type { Document, Exam, School, Subject, ScoreDocumentFilters, ExamType, ExamSeries, ReductoDataResponse, UnmatchedExtractionRecord } from "@/types/document";
import { Loader2, CheckCircle2, Eye, RefreshCw, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function ProcessedICMsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>({
    page: 1,
    page_size: 50,
    extraction_status: "success", // Default to processed documents
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Exam filtering state (combined)
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>();

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

  // Document selection state
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set());

  // Bulk update state
  const [bulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
  const [bulkUpdateVerify, setBulkUpdateVerify] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        // Fetch all subjects by paginating through all pages
        const allSubjects: Subject[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const subjectsData = await listSubjects(page, 100);
          allSubjects.push(...subjectsData);
          hasMore = subjectsData.length === 100;
          page++;
        }

        const [examsData, schoolsData] = await Promise.all([
          getAllExams(),
          listSchools(1, 100),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
        setSubjects(allSubjects);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

  // Load documents
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFilteredDocuments(filters);
      setDocuments(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error loading documents:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Update filters when selected exam changes
  useEffect(() => {
    const newFilters: ScoreDocumentFilters = { ...filters, extraction_status: "success" };

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
  }, [selectedExamId, exams]);

  // Reverse lookup: if filters have exam_id, populate selectedExamId
  useEffect(() => {
    if (exams.length > 0 && filters.exam_id) {
      if (filters.exam_id !== selectedExamId) {
        setSelectedExamId(filters.exam_id);
      }
    } else if (!filters.exam_id && selectedExamId !== undefined) {
      setSelectedExamId(undefined);
    }
  }, [filters.exam_id, exams]);

  const handleFilterChange = (key: keyof ScoreDocumentFilters, value: number | string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      extraction_status: "success", // Always keep extraction_status as success
      page: 1, // Reset to first page when filter changes
    }));
  };

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSelectedExamId(undefined);
    } else {
      setSelectedExamId(typeof value === "number" ? value : parseInt(String(value), 10));
    }
  };

  // Generate exam options for the combined dropdown
  const examOptions = exams
    .sort((a, b) => {
      // Sort by year (descending), then series, then type
      if (b.year !== a.year) return b.year - a.year;
      if (a.series !== b.series) return a.series.localeCompare(b.series);
      return (a.exam_type || "").localeCompare(b.exam_type || "");
    })
    .map((exam) => {
      const typeLabel = exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
      return {
        value: exam.id,
        label: `${exam.year} ${exam.series} ${typeLabel}`,
      };
    });

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
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scores");
      console.error("Error updating scores:", err);
    } finally {
      setUpdatingScores(null);
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

  // Document selection handlers
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

  // Bulk update handlers
  const handleBulkUpdateScores = () => {
    if (selectedDocuments.size === 0) {
      toast.error("Please select at least one document");
      return;
    }
    setBulkUpdateModalOpen(true);
  };

  const handleConfirmBulkUpdate = async () => {
    if (selectedDocuments.size === 0) {
      return;
    }

    setBulkUpdateModalOpen(false);
    setBulkUpdating(true);

    const documentIds = Array.from(selectedDocuments);
    let successCount = 0;
    let failureCount = 0;
    let totalUpdated = 0;
    let totalUnmatched = 0;

    try {
      for (let i = 0; i < documentIds.length; i++) {
        const documentId = documentIds[i];
        try {
          const response = await updateScoresFromReducto(documentId, bulkUpdateVerify);
          successCount++;
          totalUpdated += response.updated_count;
          totalUnmatched += response.unmatched_count;
        } catch (err) {
          failureCount++;
          console.error(`Error updating document ${documentId}:`, err);
        }
      }

      // Show summary toast
      if (successCount > 0) {
        toast.success(
          `Updated ${successCount} document(s). ${totalUpdated} score(s) updated. ${totalUnmatched} unmatched record(s) saved.`
        );
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} document(s) failed to update`);
      }

      // Clear selection and reload documents
      setSelectedDocuments(new Set());
      await loadDocuments();
    } catch (err) {
      toast.error("An error occurred during bulk update");
      console.error("Error in bulk update:", err);
    } finally {
      setBulkUpdating(false);
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

    // 3. Try nested data format
    if (candidates.length === 0 && data.data && typeof data.data === "object") {
      const nestedData = data.data;

      // 3a. Check for candidates in nested data
      if (Array.isArray(nestedData.candidates)) {
        candidates = nestedData.candidates;
        if (candidates.length > 0) {
          return candidates;
        }
      }

      // 3b. Check for tables in nested data
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

  const getStatusBadge = (document: Document) => {
    const status = document.scores_extraction_status;
    const methods = document.scores_extraction_methods;
    const methodDisplay = methods && methods.length > 0 ? methods.join(", ") : null;

    if (status === "success") {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Processed {methodDisplay && `(${methodDisplay})`}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        {status || "Unknown"}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Processed ICMs" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Examination</label>
                  <SearchableSelect
                    options={examOptions}
                    value={selectedExamId || ""}
                    onValueChange={handleExamChange}
                    placeholder="Select examination"
                    disabled={loadingFilters}
                    allowAll={true}
                    allLabel="All examinations"
                    searchPlaceholder="Search examinations..."
                    emptyMessage="No examinations found"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">School</label>
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
                        handleFilterChange("school_id", typeof value === "number" ? value : parseInt(String(value), 10));
                      }
                    }}
                    placeholder="Select school"
                    disabled={loadingFilters}
                    allowAll={true}
                    allLabel="All schools"
                    searchPlaceholder="Search schools..."
                    emptyMessage="No schools found"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Subject</label>
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
                        handleFilterChange("subject_id", typeof value === "number" ? value : parseInt(String(value), 10));
                      }
                    }}
                    placeholder="Select subject"
                    disabled={loadingFilters}
                    allowAll={true}
                    allLabel="All subjects"
                    searchPlaceholder="Search subjects..."
                    emptyMessage="No subjects found"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Test Type</label>
                  <Select
                    value={filters.test_type || undefined}
                    onValueChange={(value) => handleFilterChange("test_type", value && value !== "all" ? value : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="1">Objectives (Type 1)</SelectItem>
                      <SelectItem value="2">Essay (Type 2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Documents Table */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Documents</CardTitle>
                {selectedDocuments.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                    </span>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleBulkUpdateScores}
                      disabled={bulkUpdating}
                    >
                      {bulkUpdating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Bulk Update Scores
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {/* Page Size Selector and Pagination Info */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div className="flex items-center gap-4">
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
                  {/* Extraction Method Filter */}
                  <Select
                    value={filters.extraction_method || "all"}
                    onValueChange={(value) => handleFilterChange("extraction_method", value && value !== "all" ? value : undefined)}
                  >
                    <SelectTrigger className="h-8 w-[200px]">
                      <SelectValue placeholder="All Methods" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Methods</SelectItem>
                      <SelectItem value="AUTOMATED_EXTRACTION">Automated Extraction</SelectItem>
                      <SelectItem value="MANUAL_TRANSCRIPTION_DIGITAL">Manual Transcription (Digital)</SelectItem>
                      <SelectItem value="MANUAL_ENTRY_PHYSICAL">Manual Entry (Physical)</SelectItem>
                    </SelectContent>
                  </Select>
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
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
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
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No processed documents found
                        </TableCell>
                      </TableRow>
                    ) : (
                      documents.map((document) => (
                        <TableRow key={document.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedDocuments.has(document.id)}
                              onCheckedChange={() => handleSelectDocument(document.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{document.extracted_id || "-"}</TableCell>
                          <TableCell>{document.school_name || "-"}</TableCell>
                          <TableCell>{getStatusBadge(document)}</TableCell>
                          <TableCell>
                            {document.scores_extracted_at
                              ? new Date(document.scores_extracted_at).toLocaleString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {document.scores_extraction_data && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePreview(document)}
                                  disabled={loadingPreview}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Preview
                                </Button>
                              )}
                              {document.scores_extraction_data && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUpdateScores(document)}
                                  disabled={updatingScores === document.id}
                                >
                                  {updatingScores === document.id ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                  )}
                                  Update Scores
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
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

      {/* Bulk Update Confirmation Modal */}
      <Dialog open={bulkUpdateModalOpen} onOpenChange={setBulkUpdateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Update Scores</DialogTitle>
            <DialogDescription>
              Update scores for {selectedDocuments.size} selected document(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="bulk-verify-checkbox"
                checked={bulkUpdateVerify}
                onCheckedChange={(checked) => setBulkUpdateVerify(checked === true)}
              />
              <label
                htmlFor="bulk-verify-checkbox"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Compare raw_score and verify fields before inserting
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, scores will only be inserted if the raw_score and verify fields match (numeric values match or both are A/AA/AAA).
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkUpdateModalOpen(false)}
              disabled={bulkUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmBulkUpdate} disabled={bulkUpdating}>
              {bulkUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Scores"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                                            ? (typeof candidate.attend === "string" && (candidate.attend === "A" || candidate.attend === "AA" || candidate.attend === "AAA")
                                              ? candidate.attend
                                              : "✓")
                                            : "-"}
                                        </TableCell>
                                        <TableCell>{candidate.score || "-"}</TableCell>
                                        <TableCell>
                                          {candidate.verify
                                            ? (typeof candidate.verify === "string" && (candidate.verify === "A" || candidate.verify === "AA" || candidate.verify === "AAA")
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
