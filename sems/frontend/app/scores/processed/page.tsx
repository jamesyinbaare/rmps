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
import { getFilteredDocuments, getAllExams, listSchools, listSubjects, findExamId, getReductoData, updateScoresFromReducto, getUnmatchedRecords } from "@/lib/api";
import type { Document, Exam, School, Subject, ScoreDocumentFilters, ExamType, ExamSeries, ReductoDataResponse, UnmatchedExtractionRecord } from "@/types/document";
import { Loader2, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ProcessedICMsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>({
    page: 1,
    page_size: 20,
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

  // Exam filtering state (three-step: type, series, year)
  const [examType, setExamType] = useState<ExamType | undefined>();
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>();
  const [examYear, setExamYear] = useState<number | undefined>();

  // Preview and update states
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewData, setPreviewData] = useState<ReductoDataResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [updatingScores, setUpdatingScores] = useState<number | null>(null);

  // Unmatched records state
  const [unmatchedRecords, setUnmatchedRecords] = useState<UnmatchedExtractionRecord[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

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

  // Update filters when exam type, series, or year changes
  useEffect(() => {
    const newFilters: ScoreDocumentFilters = { ...filters, extraction_status: "success" };

    // Set or clear exam_type, series, and year based on selections
    if (examType && examType !== "all") {
      newFilters.exam_type = examType;
    } else {
      delete newFilters.exam_type;
      delete newFilters.series;
      delete newFilters.year;
    }

    if (examSeries && examSeries !== "all" && examType) {
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
  }, [examType, examSeries, examYear, exams]);

  // Reverse lookup: if filters have exam_type, series, year, populate local state
  useEffect(() => {
    if (exams.length > 0) {
      if (filters.exam_type || filters.series || filters.year) {
        if (filters.exam_type && filters.exam_type !== examType) {
          setExamType(filters.exam_type);
        }
        if (filters.series && filters.series !== examSeries) {
          setExamSeries(filters.series);
        }
        if (filters.year && filters.year !== examYear) {
          setExamYear(filters.year);
        }
      } else if (filters.exam_id && (!examType || !examSeries || !examYear)) {
        const exam = exams.find((e) => e.id === filters.exam_id);
        if (exam) {
          setExamType(exam.exam_type as ExamType);
          setExamSeries(exam.series as ExamSeries);
          setExamYear(exam.year);
        }
      } else if (!filters.exam_id && !filters.exam_type && !filters.series && !filters.year) {
        setExamType(undefined);
        setExamSeries(undefined);
        setExamYear(undefined);
      }
    }
  }, [filters.exam_id, filters.exam_type, filters.series, filters.year, exams]);

  const handleFilterChange = (key: keyof ScoreDocumentFilters, value: number | string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      extraction_status: "success", // Always keep extraction_status as success
      page: 1, // Reset to first page when filter changes
    }));
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

  const handlePreview = async (document: Document) => {
    setPreviewDocument(document);
    setPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewData(null);
    try {
      const data = await getReductoData(document.id);
      setPreviewData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load preview data");
      console.error("Error loading preview:", err);
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
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Exam Type</label>
                  <Select
                    value={examType || ""}
                    onValueChange={handleExamTypeChange}
                    disabled={loadingFilters}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {Array.from(new Set(exams.map((e) => e.exam_type as ExamType))).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type === "Certificate II Examination" ? "Certificate II" : type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Series</label>
                  <Select
                    value={examSeries || ""}
                    onValueChange={handleExamSeriesChange}
                    disabled={loadingFilters || !examType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All series" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All series</SelectItem>
                      {Array.from(new Set(
                        examType
                          ? exams.filter((e) => e.exam_type === examType).map((e) => e.series as ExamSeries)
                          : exams.map((e) => e.series as ExamSeries)
                      )).map((series) => (
                        <SelectItem key={series} value={series}>
                          {series}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Year</label>
                  <Select
                    value={examYear?.toString() || ""}
                    onValueChange={handleExamYearChange}
                    disabled={loadingFilters || !examType || !examSeries}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All years" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All years</SelectItem>
                      {Array.from(new Set(
                        (() => {
                          let filtered = exams;
                          if (examType) filtered = filtered.filter((e) => e.exam_type === examType);
                          if (examSeries) filtered = filtered.filter((e) => e.series === examSeries);
                          return filtered.map((e) => e.year);
                        })()
                      ))
                        .sort((a, b) => b - a)
                        .map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">School</label>
                  <Select
                    value={filters.school_id?.toString() || undefined}
                    onValueChange={(value) => handleFilterChange("school_id", value && value !== "all" ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Schools" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Schools</SelectItem>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id.toString()}>
                          {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Subject</label>
                  <Select
                    value={filters.subject_id?.toString() || undefined}
                    onValueChange={(value) => handleFilterChange("subject_id", value && value !== "all" ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id.toString()}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            {/* <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader> */}
            <CardContent className="flex-1 overflow-auto">
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {/* Extraction Method Filter */}
              <div className="mb-4 flex items-center gap-2">
                {/* <label className="text-sm font-medium">Extraction Method:</label> */}
                <Select
                  value={filters.extraction_method || "all"}
                  onValueChange={(value) => handleFilterChange("extraction_method", value && value !== "all" ? value : undefined)}
                >
                  <SelectTrigger className="w-[200px]">
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

              {loading && loadingFilters ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No processed documents found
                        </TableCell>
                      </TableRow>
                    ) : (
                      documents.map((document) => (
                        <TableRow key={document.id}>
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
                <div className="flex items-center justify-between mt-4">
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

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="min-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Preview Reducto Data - {previewDocument?.extracted_id || previewDocument?.file_name}
            </DialogTitle>
            <DialogDescription>
              Extracted data from {previewDocument?.file_name}
            </DialogDescription>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : previewData ? (
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
              {previewData.data?.candidates && Array.isArray(previewData.data.candidates) ? (
                <div>
                  <h3 className="font-medium mb-2">Candidates ({previewData.data.candidates.length})</h3>
                  <div className="border rounded-lg overflow-auto max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Index Number</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Attendance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.data.candidates.map((candidate: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>{candidate.index_number || "-"}</TableCell>
                            <TableCell>{candidate.candidate_name || "-"}</TableCell>
                            <TableCell>{candidate.score || "-"}</TableCell>
                            <TableCell>{candidate.attend ? "✓" : "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <pre className="bg-muted p-4 rounded overflow-auto">
                    {JSON.stringify(previewData.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No preview data available</p>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
