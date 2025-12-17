"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { DocumentViewer } from "@/components/DocumentViewer";
import { ScoreEntryForm } from "@/components/ScoreEntryForm";
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
import { Search, File } from "lucide-react";
import { getFilteredDocuments, listExams, listSchools, listSubjects, downloadDocument } from "@/lib/api";
import type { Document, Exam, School, Subject, ScoreDocumentFilters } from "@/types/document";

export default function ScoreDataEntryPage() {
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
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        // Load exams
        let allExams: Exam[] = [];
        let examPage = 1;
        let examHasMore = true;
        while (examHasMore) {
          const examsData = await listExams(examPage, 100);
          allExams = [...allExams, ...(examsData.items || [])];
          examHasMore = examPage < examsData.total_pages;
          examPage++;
        }

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

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocument(doc);
  };

  const handleCloseViewer = () => {
    setSelectedDocument(null);
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
    setFilters({ page: 1, page_size: 20 });
  };

  const hasActiveFilters = filters.exam_id || filters.school_id || filters.subject_id || filters.test_type;

  return (
    <DashboardLayout title="Score Data Entry">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Score Data Entry" />

        {/* Compact Filters */}
        <div className="border-b border-border bg-background px-4 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={filters.exam_id?.toString() || undefined}
              onValueChange={(value) => handleFilterChange("exam_id", value === "all" ? undefined : value)}
              disabled={loadingFilters}
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Examination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All examinations</SelectItem>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.name} ({exam.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.school_id?.toString() || undefined}
              onValueChange={(value) => handleFilterChange("school_id", value === "all" ? undefined : value)}
              disabled={loadingFilters}
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="School" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id.toString()}>
                    {school.code} - {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.subject_id?.toString() || undefined}
              onValueChange={(value) => handleFilterChange("subject_id", value === "all" ? undefined : value)}
              disabled={loadingFilters}
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id.toString()}>
                    {subject.code} - {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.test_type || undefined}
              onValueChange={(value) => handleFilterChange("test_type", value === "all" ? undefined : value)}
              disabled={loadingFilters}
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="Test type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="1">Objectives</SelectItem>
                <SelectItem value="2">Essay</SelectItem>
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
        </div>

        {selectedDocument ? (
          /* Full Screen Document Viewer and Score Entry */
          <div className="flex flex-1 overflow-hidden">
            {/* Document Viewer - Left Side */}
            <div className="hidden lg:flex lg:w-1/2 flex-col border-r border-border">
              <DocumentViewer
                document={selectedDocument}
                onClose={handleCloseViewer}
                onDownload={handleDownload}
              />
            </div>

            {/* Score Entry Form - Right Side */}
            <div className="flex-1 lg:w-1/2 flex flex-col overflow-hidden">
              <ScoreEntryForm
                document={selectedDocument}
                onClose={handleCloseViewer}
              />
            </div>
          </div>
        ) : (
          /* Documents Table */
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
                        <TableHead className="w-[150px]">File Name</TableHead>
                        <TableHead className="w-[120px]">Extracted ID</TableHead>
                        <TableHead className="w-[100px]">Test Type</TableHead>
                        <TableHead className="w-[100px]">Subject Series</TableHead>
                        <TableHead className="w-[100px]">Sheet Number</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow
                          key={doc.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleDocumentSelect(doc)}
                        >
                          <TableCell className="font-medium">
                            {doc.file_name}
                          </TableCell>
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
                              doc.id_extraction_status === "success" ? "bg-green-100 text-green-800" :
                              doc.id_extraction_status === "error" ? "bg-red-100 text-red-800" :
                              "bg-yellow-100 text-yellow-800"
                            }`}>
                              {doc.id_extraction_status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {documents.length} of {total} document{total !== 1 ? "s" : ""}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
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
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
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
