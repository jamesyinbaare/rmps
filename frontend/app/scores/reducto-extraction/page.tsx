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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { getFilteredDocuments, getAllExams, listSchools, listSubjects, queueReductoExtraction, getReductoStatus, findExamId } from "@/lib/api";
import type { Document, Exam, School, Subject, ScoreDocumentFilters, ExamType, ExamSeries } from "@/types/document";
import { Loader2, CheckCircle2, XCircle, Clock, Send } from "lucide-react";

export default function ReductoExtractionPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScoreDocumentFilters>({
    page: 1,
    page_size: 20,
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

  // Polling for status updates
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

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

  // Poll for status updates every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadDocuments();
    }, 3000);

    setPollingInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadDocuments]);

  // Update filters when exam type, series, or year changes
  useEffect(() => {
    const newFilters: ScoreDocumentFilters = { ...filters };

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
    setSelectedDocuments(new Set()); // Clear selection when filters change
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
      await loadDocuments();

      // Clear selection
      setSelectedDocuments(new Set());

      // Show success message
      if (response.queued_count > 0) {
        // Success - documents are queued
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue documents for Reducto extraction");
      console.error("Error queueing documents:", err);
    } finally {
      setQueuing(false);
    }
  };

  const getStatusBadge = (document: Document) => {
    const status = document.scores_extraction_status;
    const method = document.scores_extraction_method;

    if (status === "queued") {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Queued
        </Badge>
      );
    }
    if (status === "processing") {
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    }
    if (status === "success") {
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Success {method && `(${method})`}
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
      <Badge variant="secondary">
        {status || "Pending"}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Reducto Extraction" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
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

                <div>
                  <label className="text-sm font-medium mb-2 block">Extraction Status</label>
                  <Select
                    value={filters.extraction_status || undefined}
                    onValueChange={(value) => handleFilterChange("extraction_status", value && value !== "all" ? value : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="success">Processed (Success)</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedDocuments.size > 0 && (
                <span>{selectedDocuments.size} document(s) selected</span>
              )}
            </div>
            <Button
              onClick={handleQueueForReducto}
              disabled={selectedDocuments.size === 0 || queuing}
            >
              {queuing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Queueing...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Queue for Reducto
                </>
              )}
            </Button>
          </div>

          {/* Documents Table */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>Documents ({total})</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No documents found
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
        </div>
      </div>
    </DashboardLayout>
  );
}
