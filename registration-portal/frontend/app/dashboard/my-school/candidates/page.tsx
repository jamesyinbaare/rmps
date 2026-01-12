"use client";

import { useEffect, useState, useMemo } from "react";
import { listSchoolCandidates, listAvailableExams, listSchoolProgrammes } from "@/lib/api";
import type { RegistrationCandidate, RegistrationExam, Programme } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

export default function CandidatesPage() {
  const [allCandidates, setAllCandidates] = useState<RegistrationCandidate[]>([]);
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<RegistrationCandidate | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Filters
  const [selectedExamType, setSelectedExamType] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSeries, setSelectedSeries] = useState<string>("");
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [customPageSize, setCustomPageSize] = useState("");
  const [useCustomPageSize, setUseCustomPageSize] = useState(false);

  useEffect(() => {
    // Update page title
    const updateTitle = async () => {
      try {
        const { getSchoolDashboard } = await import("@/lib/api");
        const dashboard = await getSchoolDashboard();
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Candidate Registration`;
        }
      } catch (error) {
        console.error("Failed to load school data for title:", error);
      }
    };
    updateTitle();

    // Load filters data
    loadFiltersData();
  }, []);

  const loadFiltersData = async () => {
    try {
      setLoadingFilters(true);
      const [examsData, programmesData] = await Promise.all([
        listAvailableExams(),
        listSchoolProgrammes(),
      ]);
      setExams(examsData);
      setProgrammes(programmesData);
    } catch (error) {
      toast.error("Failed to load filter options");
      console.error(error);
    } finally {
      setLoadingFilters(false);
    }
  };

  // Get available exam types
  const availableExamTypes = useMemo(() => {
    return Array.from(new Set(exams.map((exam) => exam.exam_type))).sort();
  }, [exams]);

  // Get available years for selected exam type
  const availableYears = useMemo(() => {
    if (!selectedExamType) return [];
    const filteredExams = exams.filter((exam) => exam.exam_type === selectedExamType);
    const yearsSet = new Set<number>();
    filteredExams.forEach((exam) => {
      yearsSet.add(exam.year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a); // Sort descending (newest first)
  }, [exams, selectedExamType]);

  // Get available series for selected exam type and year
  const availableSeries = useMemo(() => {
    if (!selectedExamType) return [];
    let filteredExams = exams.filter((exam) => exam.exam_type === selectedExamType);
    if (selectedYear) {
      const yearNum = parseInt(selectedYear, 10);
      if (!isNaN(yearNum)) {
        filteredExams = filteredExams.filter((exam) => exam.year === yearNum);
      }
    }
    const seriesSet = new Set<string>();
    filteredExams.forEach((exam) => {
      if (exam.exam_series) {
        seriesSet.add(exam.exam_series);
      }
    });
    return Array.from(seriesSet).sort();
  }, [exams, selectedExamType, selectedYear]);

  // Prepare programme options for SearchableSelect
  const programmeOptions = useMemo(() => {
    return programmes.map((programme) => ({
      value: programme.id.toString(),
      label: `${programme.code} - ${programme.name}`,
    }));
  }, [programmes]);

  // Get matching exam IDs based on exam type, year, and series
  const matchingExamIds = useMemo(() => {
    if (!selectedExamType) return [];
    let filteredExams = exams.filter((exam) => exam.exam_type === selectedExamType);
    if (selectedYear) {
      const yearNum = parseInt(selectedYear, 10);
      if (!isNaN(yearNum)) {
        filteredExams = filteredExams.filter((exam) => exam.year === yearNum);
      }
    }
    if (selectedSeries) {
      filteredExams = filteredExams.filter((exam) => exam.exam_series === selectedSeries);
    }
    return filteredExams.map((exam) => exam.id);
  }, [exams, selectedExamType, selectedYear, selectedSeries]);

  // Load candidates when filters change
  useEffect(() => {
    if (matchingExamIds.length > 0) {
      loadCandidates();
    } else {
      setAllCandidates([]);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingExamIds.join(",")]);

  // Reset year, series and programme when exam type changes
  useEffect(() => {
    setSelectedYear("");
    setSelectedSeries("");
    setSelectedProgrammeId(undefined);
    setPage(1);
  }, [selectedExamType]);

  // Reset series and programme when year changes
  useEffect(() => {
    setSelectedSeries("");
    setSelectedProgrammeId(undefined);
    setPage(1);
  }, [selectedYear]);

  // Reset programme when series changes
  useEffect(() => {
    setSelectedProgrammeId(undefined);
    setPage(1);
  }, [selectedSeries]);

  const loadCandidates = async () => {
    if (matchingExamIds.length === 0) return;

    setLoading(true);
    try {
      // Fetch candidates for all matching exams
      const allCandidatesData: RegistrationCandidate[] = [];
      for (const examId of matchingExamIds) {
        try {
          const candidates = await listSchoolCandidates(examId);
          allCandidatesData.push(...candidates);
        } catch (error) {
          console.error(`Failed to load candidates for exam ${examId}:`, error);
        }
      }
      setAllCandidates(allCandidatesData);
      setPage(1); // Reset to first page when new data is loaded
    } catch (error) {
      toast.error("Failed to load candidates");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Filter candidates by programme and search query
  const filteredCandidates = useMemo(() => {
    let filtered = allCandidates;

    // Filter by programme
    if (selectedProgrammeId) {
      const programmeIdNum = parseInt(selectedProgrammeId, 10);
      if (!isNaN(programmeIdNum)) {
        filtered = filtered.filter((candidate) => {
          // Match by programme_id if available, or by programme_code as fallback
          if (candidate.programme_id !== null && candidate.programme_id === programmeIdNum) {
            return true;
          }
          // Fallback: try matching by programme_code if programme_id doesn't match
          const selectedProgramme = programmes.find((p) => p.id === programmeIdNum);
          if (selectedProgramme && candidate.programme_code === selectedProgramme.code) {
            return true;
          }
          return false;
        });
      }
    }

    // Filter by search query (name and index number)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((candidate) => {
        const nameMatch = candidate.name.toLowerCase().includes(query);
        const indexMatch = candidate.index_number?.toLowerCase().includes(query) || false;
        return nameMatch || indexMatch;
      });
    }

    return filtered;
  }, [allCandidates, selectedProgrammeId, programmes, searchQuery]);

  const handleProgrammeChange = (value: string | undefined) => {
    setSelectedProgrammeId(value);
    setPage(1);
  };

  // Calculate pagination
  const currentPageSize = useCustomPageSize && customPageSize
    ? Math.max(1, parseInt(customPageSize, 10) || pageSize)
    : pageSize;
  const totalCandidates = filteredCandidates.length;
  const totalPages = Math.max(1, Math.ceil(totalCandidates / currentPageSize));
  const startIndex = (page - 1) * currentPageSize;
  const endIndex = startIndex + currentPageSize;
  const paginatedCandidates = filteredCandidates.slice(startIndex, endIndex);

  // Reset page if it's out of bounds
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [page, totalPages]);

  const handlePageSizeChange = (value: string) => {
    if (value === "custom") {
      setUseCustomPageSize(true);
      setPage(1);
    } else {
      setUseCustomPageSize(false);
      setPageSize(parseInt(value, 10));
      setPage(1);
    }
  };

  const handleCustomPageSizeChange = (value: string) => {
    setCustomPageSize(value);
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setPage(1);
    }
  };

  if (loadingFilters) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold">Registration List</h2>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-none max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="relative">
              <Label htmlFor="exam-type" className="absolute top-0 left-2 text-xs text-muted-foreground bg-background px-1.5 z-10 -mt-2">
                Exam Type
              </Label>
              <Select value={selectedExamType} onValueChange={setSelectedExamType}>
                <SelectTrigger id="exam-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableExamTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Label htmlFor="year" className="absolute top-0 left-2 text-xs text-muted-foreground bg-background px-1.5 z-10 -mt-2">
                Year
              </Label>
              <Select
                value={selectedYear}
                onValueChange={setSelectedYear}
                disabled={!selectedExamType}
              >
                <SelectTrigger id="year" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Label htmlFor="series" className="absolute top-0 left-2 text-xs text-muted-foreground bg-background px-1.5 z-10 -mt-2">
                Series
              </Label>
              <Select
                value={selectedSeries}
                onValueChange={setSelectedSeries}
                disabled={!selectedExamType || !selectedYear}
              >
                <SelectTrigger id="series" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSeries.map((series) => (
                    <SelectItem key={series} value={series}>
                      {series}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Label htmlFor="programme" className="absolute top-0 left-2 text-xs text-muted-foreground bg-background px-1.5 z-10 -mt-2">
                Programme
              </Label>
              <SearchableSelect
                options={programmeOptions}
                value={selectedProgrammeId}
                onValueChange={handleProgrammeChange}
                placeholder=""
                disabled={!selectedSeries}
                searchPlaceholder="Search programmes..."
                emptyMessage="No programmes found."
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Candidates Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading candidates...</div>
          ) : !selectedExamType || !selectedYear || !selectedSeries ? (
            <div className="text-center py-12 text-muted-foreground">
              Please select exam type, year, and series to view candidates
            </div>
          ) : (
            <>
              {/* Search and Page Size Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4 pb-4 border-b">
                <div className="relative flex-1 max-w-md w-full">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by name or index number..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="page-size" className="text-sm whitespace-nowrap">
                    Page size:
                  </Label>
                  {useCustomPageSize ? (
                    <div className="flex items-center gap-2">
                      <Input
                        id="page-size"
                        type="number"
                        min="1"
                        value={customPageSize}
                        onChange={(e) => handleCustomPageSizeChange(e.target.value)}
                        className="w-20 h-8"
                        placeholder="Custom"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUseCustomPageSize(false);
                          setCustomPageSize("");
                        }}
                        className="h-8"
                      >
                        ×
                      </Button>
                    </div>
                  ) : (
                    <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-[100px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Registration Number</TableHead>
                    <TableHead>Index Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registration Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCandidates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No candidates found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCandidates.map((candidate) => (
                      <TableRow
                        key={candidate.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedCandidate(candidate);
                          setDetailDialogOpen(true);
                        }}
                      >
                        <TableCell className="font-medium">{candidate.name}</TableCell>
                        <TableCell>{candidate.registration_number}</TableCell>
                        <TableCell className="font-mono">
                          {candidate.index_number || (
                            <span className="text-muted-foreground italic">Not available</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              candidate.registration_status === "APPROVED"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : candidate.registration_status === "REJECTED"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                            }`}
                          >
                            {candidate.registration_status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {new Date(candidate.registration_date).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalCandidates > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, totalCandidates)} of {totalCandidates} candidates
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="text-sm whitespace-nowrap">
                      Page {page} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        candidate={selectedCandidate}
        candidates={filteredCandidates}
        open={detailDialogOpen}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          // Refresh candidates list when modal opens to get latest data (e.g., index numbers)
          if (open && matchingExamIds.length > 0) {
            loadCandidates();
          }
        }}
        onCandidateChange={(candidate) => {
          setSelectedCandidate(candidate);
          // Update candidate in the list
          setAllCandidates((prev) =>
            prev.map((c) => (c.id === candidate.id ? candidate : c))
          );
        }}
      />
    </div>
  );
}
