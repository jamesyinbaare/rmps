"use client";

import { useEffect, useState, useMemo } from "react";
import { listAllExams, listSchoolProgrammes, downloadIndexSlipsBulk, listSchoolCandidates, downloadSchoolCandidateIndexSlip } from "@/lib/api";
import type { RegistrationExam, Programme, RegistrationCandidate } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
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
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import { Download, ArrowLeft, Search, ArrowUpDown, ArrowUp, ArrowDown, Info } from "lucide-react";
import Link from "next/link";

export default function IndexSlipsDownloadPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCandidates, setDownloadingCandidates] = useState<Set<number>>(new Set());

  // Filters
  const [selectedExamType, setSelectedExamType] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSeries, setSelectedSeries] = useState<string>("");
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sorting - array of sort columns with directions
  type SortColumn = "name" | "index_number" | "registration_number" | "programme";
  type SortEntry = { column: SortColumn; direction: "asc" | "desc" };
  const [sortColumns, setSortColumns] = useState<SortEntry[]>([]);

  useEffect(() => {
    loadFiltersData();
  }, []);

  const loadFiltersData = async () => {
    try {
      setLoadingFilters(true);
      const [examsData, programmesData] = await Promise.all([
        listAllExams(),
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

  // Get the exam ID from matching exams (should have exactly one when filters are selected)
  const examId = useMemo(() => {
    if (matchingExamIds.length === 1) {
      return matchingExamIds[0];
    }
    return null;
  }, [matchingExamIds]);

  // Check if download button should be enabled
  const canDownload = selectedExamType && selectedYear && selectedSeries && examId !== null;

  // Load candidates when filters change
  useEffect(() => {
    if (examId) {
      loadCandidates();
    } else {
      setCandidates([]);
    }
  }, [examId, selectedProgrammeId]);

  const loadCandidates = async () => {
    if (!examId) return;

    setLoadingCandidates(true);
    try {
      const allCandidatesData = await listSchoolCandidates(examId);

      // Filter by programme if selected
      let filteredCandidates = allCandidatesData;
      if (selectedProgrammeId) {
        const programmeIdNum = parseInt(selectedProgrammeId, 10);
        filteredCandidates = allCandidatesData.filter(
          (candidate) => candidate.programme_id === programmeIdNum
        );
      }

      // Only show candidates with index numbers
      filteredCandidates = filteredCandidates.filter(
        (candidate) => candidate.index_number !== null && candidate.index_number !== undefined
      );

      setCandidates(filteredCandidates);
    } catch (error) {
      toast.error("Failed to load candidates");
      console.error(error);
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Filter and sort candidates
  const filteredCandidates = useMemo(() => {
    let filtered = candidates;

    // Filter by search query (name and index number)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = candidates.filter((candidate) => {
        const nameMatch = candidate.name?.toLowerCase().includes(query);
        const indexMatch = candidate.index_number?.toLowerCase().includes(query);
        return nameMatch || indexMatch;
      });
    }

    // Apply multi-column sorting
    if (sortColumns.length > 0) {
      filtered = [...filtered].sort((a, b) => {
        for (const { column, direction } of sortColumns) {
          let aVal: any;
          let bVal: any;

          switch (column) {
            case "name":
              aVal = a.name?.toLowerCase() || "";
              bVal = b.name?.toLowerCase() || "";
              break;
            case "index_number":
              aVal = a.index_number?.toLowerCase() || "";
              bVal = b.index_number?.toLowerCase() || "";
              break;
            case "registration_number":
              aVal = a.registration_number?.toLowerCase() || "";
              bVal = b.registration_number?.toLowerCase() || "";
              break;
            case "programme":
              // Get programme name for comparison
              const programmeA = programmes.find((p) => p.id === a.programme_id);
              const programmeB = programmes.find((p) => p.id === b.programme_id);
              aVal = programmeA?.name?.toLowerCase() || "";
              bVal = programmeB?.name?.toLowerCase() || "";
              break;
            default:
              continue;
          }

          if (aVal < bVal) {
            const result = direction === "asc" ? -1 : 1;
            if (result !== 0) return result;
          }
          if (aVal > bVal) {
            const result = direction === "asc" ? 1 : -1;
            if (result !== 0) return result;
          }
          // Values are equal, continue to next sort column
        }
        return 0;
      });
    }

    return filtered;
  }, [candidates, searchQuery, sortColumns, programmes]);

  // Handle sort - Shift+Click adds as additional sort, normal click sets as primary
  const handleSort = (
    column: SortColumn,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    const isShiftClick = event.shiftKey;

    setSortColumns((prev) => {
      const existingIndex = prev.findIndex((s) => s.column === column);

      if (existingIndex >= 0) {
        // Column already in sort - toggle direction
        const newSorts = [...prev];
        newSorts[existingIndex] = {
          ...newSorts[existingIndex],
          direction: newSorts[existingIndex].direction === "asc" ? "desc" : "asc",
        };
        return newSorts;
      } else {
        // Column not in sort
        if (isShiftClick) {
          // Shift+Click: Add as additional sort (append)
          return [...prev, { column, direction: "asc" }];
        } else {
          // Normal click: Set as primary sort (replace all)
          return [{ column, direction: "asc" }];
        }
      }
    });
  };

  // Get sort icon and priority indicator
  const getSortIcon = (column: SortColumn) => {
    const sortIndex = sortColumns.findIndex((s) => s.column === column);

    if (sortIndex < 0) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }

    const sortEntry = sortColumns[sortIndex];
    const icon = sortEntry.direction === "asc" ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );

    // Show priority number if multiple sorts
    if (sortColumns.length > 1) {
      return (
        <span className="flex items-center gap-1">
          {icon}
          <span className="text-xs font-semibold">{sortIndex + 1}</span>
        </span>
      );
    }

    return icon;
  };

  const handleProgrammeChange = (value: string | undefined) => {
    setSelectedProgrammeId(value);
  };

  const handleDownload = async () => {
    if (!examId) return;

    setDownloading(true);
    try {
      const programmeId = selectedProgrammeId ? parseInt(selectedProgrammeId, 10) : undefined;
      await downloadIndexSlipsBulk(examId, programmeId);
      toast.success("Index slips downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download index slips");
      console.error("Error downloading index slips:", error);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCandidate = async (candidate: RegistrationCandidate) => {
    if (!candidate.id || !candidate.index_number) {
      toast.error("Candidate index number not available");
      return;
    }

    setDownloadingCandidates((prev) => new Set(prev).add(candidate.id));
    try {
      const blob = await downloadSchoolCandidateIndexSlip(candidate.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `index_slip_${candidate.index_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Index slip downloaded for ${candidate.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download index slip");
      console.error("Error downloading index slip:", error);
    } finally {
      setDownloadingCandidates((prev) => {
        const newSet = new Set(prev);
        newSet.delete(candidate.id);
        return newSet;
      });
    }
  };

  // Reset year, series and programme when exam type changes
  useEffect(() => {
    setSelectedYear("");
    setSelectedSeries("");
    setSelectedProgrammeId(undefined);
  }, [selectedExamType]);

  // Reset series and programme when year changes
  useEffect(() => {
    setSelectedSeries("");
    setSelectedProgrammeId(undefined);
  }, [selectedYear]);

  // Reset programme when series changes
  useEffect(() => {
    setSelectedProgrammeId(undefined);
  }, [selectedSeries]);

  if (loadingFilters) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/my-school/documents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Documents
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Download Index Slips</h2>
          <p className="text-muted-foreground">
            Select examination filters to download index slips for candidates
          </p>
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
                Programme (Optional)
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

      {/* Bulk Download Button */}
      {canDownload && (
        <Card className="border-none max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <Button
              onClick={handleDownload}
              disabled={downloading || loadingCandidates}
              className="w-full"
              size="lg"
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Downloading..." : "Download All Index Slips (ZIP)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Candidates List */}
      {canDownload && (
        <Card className="border-none">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Candidates ({filteredCandidates.length})
                </h3>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by name or index number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {loadingCandidates ? (
                <div className="text-center py-12 text-muted-foreground">Loading candidates...</div>
              ) : filteredCandidates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? "No candidates match your search" : "No candidates found with index numbers"}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md border">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">Sorting tip: </span>
                      Click a column header to sort. Hold <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-background border rounded">Shift</kbd> and click to add additional sort columns. Numbers indicate sort priority.
                    </div>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <button
                            type="button"
                            onClick={(e) => handleSort("name", e)}
                            className="flex items-center gap-2 hover:text-foreground"
                            title="Click to sort, Shift+Click to add additional sort"
                          >
                            Name {getSortIcon("name")}
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            onClick={(e) => handleSort("index_number", e)}
                            className="flex items-center gap-2 hover:text-foreground"
                            title="Click to sort, Shift+Click to add additional sort"
                          >
                            Index Number {getSortIcon("index_number")}
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            onClick={(e) => handleSort("registration_number", e)}
                            className="flex items-center gap-2 hover:text-foreground"
                            title="Click to sort, Shift+Click to add additional sort"
                          >
                            Registration Number {getSortIcon("registration_number")}
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            onClick={(e) => handleSort("programme", e)}
                            className="flex items-center gap-2 hover:text-foreground"
                            title="Click to sort, Shift+Click to add additional sort"
                          >
                            Programme {getSortIcon("programme")}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.map((candidate) => {
                        const programme = programmes.find((p) => p.id === candidate.programme_id);
                        return (
                          <TableRow key={candidate.id}>
                            <TableCell className="font-medium">{candidate.name}</TableCell>
                            <TableCell>{candidate.index_number || "-"}</TableCell>
                            <TableCell>{candidate.registration_number || "-"}</TableCell>
                            <TableCell>{programme?.name || "-"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                onClick={() => handleDownloadCandidate(candidate)}
                                disabled={downloadingCandidates.has(candidate.id)}
                                size="sm"
                                variant="outline"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                {downloadingCandidates.has(candidate.id) ? "Downloading..." : "Download"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!canDownload && (
        <Card className="border-none max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <div className="text-center py-4 text-muted-foreground">
              Please select exam type, year, and series to view candidates
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
