"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { DataEntryModal } from "@/components/DataEntryModal";
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
import { Search, File, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFilteredDocuments, getAllExams, listSchools, listSubjects, downloadDocument, findExamId } from "@/lib/api";
import type { Document, Exam, School, Subject, ScoreDocumentFilters, ExamType, ExamSeries } from "@/types/document";

export default function ScoreDataEntryPage() {
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
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<keyof Document | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Exam filtering state (three-step: type, series, year)
  const [examType, setExamType] = useState<ExamType | undefined>();
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>();
  const [examYear, setExamYear] = useState<number | undefined>();

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        // Load exams
        const allExams = await getAllExams();

        // Load schools
        let allSchools: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schoolsData = await listSchools(schoolPage, 100);
          const schools = Array.isArray(schoolsData) ? schoolsData : [];
          allSchools = [...allSchools, ...schools];
          schoolHasMore = schools.length === 100;
          schoolPage++;
        }

        // Load subjects
        let allSubjects: Subject[] = [];
        let subjectPage = 1;
        let subjectHasMore = true;
        while (subjectHasMore) {
          const subjectsData = await listSubjects(subjectPage, 100);
          const subjects = Array.isArray(subjectsData) ? subjectsData : [];
          allSubjects = [...allSubjects, ...subjects];
          subjectHasMore = subjects.length === 100;
          subjectPage++;
        }

        setExams(allExams);
        setSchools(allSchools);
        setSubjects(allSubjects);
      } catch (error) {
        console.error("Failed to load filter options:", error);
      } finally {
        setLoadingFilters(false);
      }
    }

    loadFilterOptions();
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFilteredDocuments(filters);
      setDocuments(response.items);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error loading documents:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleFetchDocuments = () => {
    loadDocuments();
  };

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

  const handleFilterChange = (key: keyof ScoreDocumentFilters, value: string | undefined) => {
    const newFilters = { ...filters };
    if (value === undefined || value === "all" || value === "") {
      delete newFilters[key];
    } else {
      if (key === "test_type") {
        newFilters[key] = value;
      } else {
        newFilters[key] = parseInt(value, 10);
      }
    }
    newFilters.page = 1;
    setFilters(newFilters);
  };

  const handleExamTypeChange = (value: string) => {
    if (value === "all" || value === "") {
      setExamType(undefined);
    } else {
      setExamType(value as ExamType);
      // Clear series and year when type changes
      setExamSeries(undefined);
      setExamYear(undefined);
    }
  };

  const handleExamSeriesChange = (value: string) => {
    if (value === "all" || value === "") {
      setExamSeries(undefined);
    } else {
      setExamSeries(value as ExamSeries);
      // Clear year when series changes
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

  const handlePageChange = (page: number) => {
    const newFilters = { ...filters, page };
    setFilters(newFilters);
    // Trigger fetch with new page
    setLoading(true);
    setError(null);
    getFilteredDocuments(newFilters)
      .then((response) => {
        setDocuments(response.items);
        setTotalPages(response.total_pages);
        setCurrentPage(response.page);
        setTotal(response.total);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load documents");
        console.error("Error loading documents:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handlePageSizeChange = (pageSize: number) => {
    const newFilters = { ...filters, page: 1, page_size: pageSize };
    setFilters(newFilters);
    // Trigger fetch with new page size
    setLoading(true);
    setError(null);
    getFilteredDocuments(newFilters)
      .then((response) => {
        setDocuments(response.items);
        setTotalPages(response.total_pages);
        setCurrentPage(response.page);
        setTotal(response.total);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load documents");
        console.error("Error loading documents:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocument(doc);
  };

  const handleCloseViewer = () => {
    setSelectedDocument(null);
  };

  const handleModalOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedDocument(null);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
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
      alert("Failed to download document. Please try again.");
    }
  };

  const handleClearFilters = () => {
    setExamType(undefined);
    setExamSeries(undefined);
    setExamYear(undefined);
    setFilters({ page: 1, page_size: 20 });
  };

  const handleSort = (column: keyof Document) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortedDocuments = (docs: Document[]): Document[] => {
    if (!sortColumn) return docs;

    return [...docs].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Handle different types
      let comparison = 0;
      if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  const getSortIcon = (column: keyof Document) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  // Get available exam types, series, and years from exams
  const availableExamTypes = Array.from(new Set(exams.map((e) => e.exam_type as ExamType)));
  const availableSeries = examType
    ? Array.from(new Set(exams.filter((e) => e.exam_type === examType).map((e) => e.series as ExamSeries)))
    : Array.from(new Set(exams.map((e) => e.series as ExamSeries)));
  let filteredExamsForYears = exams;
  if (examType) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.exam_type === examType);
  }
  if (examSeries) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.series === examSeries);
  }
  const availableYears = Array.from(new Set(filteredExamsForYears.map((e) => e.year)))
    .sort((a, b) => b - a);

  const hasActiveFilters = filters.exam_id || filters.exam_type || filters.series || filters.year || filters.school_id || filters.subject_id || filters.test_type;

  return (
    <DashboardLayout title="Score Data Entry">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Score Data Entry" />

        {/* Filters - Horizontal */}
        <div className="border-b border-border bg-background px-4 py-4">
          <div className="flex justify-center">
            <Card className="w-fit">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
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
                    handleFilterChange("school_id", String(value));
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
                    handleFilterChange("subject_id", String(value));
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
                Clear
              </Button>
            )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Data Entry Modal */}
        <DataEntryModal
          document={selectedDocument}
          open={selectedDocument !== null}
          onOpenChange={handleModalOpenChange}
          onDownload={handleDownload}
          filters={filters}
          onDocumentChange={setSelectedDocument}
        />

        {/* Documents Table */}
        {!selectedDocument && (
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-sm text-muted-foreground">Loading documents...</div>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <File className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No documents found</p>
                <p className="text-sm text-muted-foreground">
                  {total === 0 ? "Click 'Fetch Documents' to search for documents." : "No documents match the current filters."}
                </p>
              </div>
            ) : (
              <div className="p-6">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="w-[120px] cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("extracted_id")}
                        >
                          <div className="flex items-center">
                            Extracted ID
                            {getSortIcon("extracted_id")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[100px] cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("test_type")}
                        >
                          <div className="flex items-center">
                            Test Type
                            {getSortIcon("test_type")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[100px] cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("subject_series")}
                        >
                          <div className="flex items-center">
                            Subject Series
                            {getSortIcon("subject_series")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[100px] cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("sheet_number")}
                        >
                          <div className="flex items-center">
                            Sheet Number
                            {getSortIcon("sheet_number")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[100px] cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("scores_extraction_status")}
                        >
                          <div className="flex items-center">
                            Status
                            {getSortIcon("scores_extraction_status")}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSortedDocuments(documents).map((doc) => (
                        <TableRow
                          key={doc.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleDocumentSelect(doc)}
                        >
                          <TableCell className="font-mono text-sm">
                            {doc.extracted_id || "-"}
                          </TableCell>
                          <TableCell>
                            {doc.test_type === "1" ? "Objectives" : doc.test_type === "2" ? "Essay" : "-"}
                          </TableCell>
                          <TableCell>
                            {doc.subject_series || "-"}
                          </TableCell>
                          <TableCell>
                            {doc.sheet_number || "-"}
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-1 rounded ${
                              doc.scores_extraction_status === "success" ? "bg-green-100 text-green-800" :
                              doc.scores_extraction_status === "error" ? "bg-red-100 text-red-800" :
                              doc.scores_extraction_status === "pending" ? "bg-yellow-100 text-yellow-800" :
                              "bg-gray-100 text-gray-800"
                            }`}>
                              {doc.scores_extraction_status || "pending"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {(totalPages > 1 || total > 0) && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * (filters.page_size || 50)) + 1} to{" "}
                        {Math.min(currentPage * (filters.page_size || 50), total)} of {total} document{total !== 1 ? "s" : ""}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
                        <Select
                          value={(filters.page_size || 50).toString()}
                          onValueChange={(value) => handlePageSizeChange(parseInt(value, 10))}
                          disabled={loading}
                        >
                          <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1 || loading}
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages || loading}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
