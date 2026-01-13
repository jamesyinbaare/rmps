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
import { Download, ArrowLeft, Search } from "lucide-react";
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

  // Filter candidates by search query (name and index number)
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) {
      return candidates;
    }

    const query = searchQuery.toLowerCase().trim();
    return candidates.filter((candidate) => {
      const nameMatch = candidate.name?.toLowerCase().includes(query);
      const indexMatch = candidate.index_number?.toLowerCase().includes(query);
      return nameMatch || indexMatch;
    });
  }, [candidates, searchQuery]);

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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Index Number</TableHead>
                        <TableHead>Registration Number</TableHead>
                        <TableHead>Programme</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.map((candidate) => (
                        <TableRow key={candidate.id}>
                          <TableCell className="font-medium">{candidate.name}</TableCell>
                          <TableCell>{candidate.index_number || "-"}</TableCell>
                          <TableCell>{candidate.registration_number || "-"}</TableCell>
                          <TableCell>{candidate.programme?.name || "-"}</TableCell>
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
                      ))}
                    </TableBody>
                  </Table>
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
