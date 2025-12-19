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
import { Input } from "@/components/ui/input";
import { getCandidatesForManualEntry, getAllExams, listProgrammes, listSubjects, batchUpdateScoresForManualEntry, findExamId } from "@/lib/api";
import type { Exam, Programme, Subject, ManualEntryFilters, CandidateScoreEntry, BatchScoreUpdateItem, ExamType, ExamSeries } from "@/types/document";
import { Loader2, Save } from "lucide-react";

export default function ManualEntryPage() {
  const [candidates, setCandidates] = useState<CandidateScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<ManualEntryFilters>({
    page: 1,
    page_size: 20,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Exam filtering state (three-step: type, series, year)
  const [examType, setExamType] = useState<ExamType | undefined>();
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>();
  const [examYear, setExamYear] = useState<number | undefined>();

  // Score changes tracking - use score_id as key, but only track if score_id exists
  const [scoreChanges, setScoreChanges] = useState<Map<number, { obj?: string | null; essay?: string | null }>>(new Map());

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        const [examsData, programmesData, subjectsData] = await Promise.all([
          getAllExams(),
          listProgrammes(1, 100),
          listSubjects(1, 100),
        ]);
        setExams(examsData);
        setProgrammes(programmesData.items);
        setSubjects(subjectsData);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

  // Load candidates
  const loadCandidates = useCallback(async () => {
    // Require at least exam_type or exam_id to load candidates
    if (!filters.exam_id && !filters.exam_type) {
      setCandidates([]);
      setTotal(0);
      setTotalPages(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getCandidatesForManualEntry(filters);
      setCandidates(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setScoreChanges(new Map()); // Reset changes when loading new data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
      console.error("Error loading candidates:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // Update selected exam when exam_id changes
  useEffect(() => {
    if (filters.exam_id) {
      const exam = exams.find((e) => e.id === filters.exam_id);
      setSelectedExam(exam || null);
    } else {
      setSelectedExam(null);
    }
  }, [filters.exam_id, exams]);

  const handleFilterChange = (key: keyof ManualEntryFilters, value: number | string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
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

  const handleScoreChange = (candidate: CandidateScoreEntry, field: "obj" | "essay", value: string) => {
    // Only allow changes if score_id exists
    if (!candidate.score_id) {
      return;
    }

    setScoreChanges((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(candidate.score_id!) || {};
      newMap.set(candidate.score_id!, { ...current, [field]: value || null });
      return newMap;
    });
  };

  const handleSave = async () => {
    if (scoreChanges.size === 0) {
      setError("No changes to save");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const scoreUpdates: BatchScoreUpdateItem[] = [];

      scoreChanges.forEach((changes, scoreId) => {
        const candidate = candidates.find((c) => c.score_id === scoreId);
        if (!candidate || !candidate.subject_registration_id || !candidate.score_id) return;

        scoreUpdates.push({
          score_id: scoreId,
          subject_registration_id: candidate.subject_registration_id,
          obj_raw_score: changes.obj !== undefined ? changes.obj : candidate.obj_raw_score,
          essay_raw_score: changes.essay !== undefined ? changes.essay : candidate.essay_raw_score,
        });
      });

      const response = await batchUpdateScoresForManualEntry({ scores: scoreUpdates });

      if (response.failed > 0) {
        setError(`Failed to save ${response.failed} score(s). ${response.errors.map((e) => e.error || "").join(", ")}`);
      } else {
        // Success - reload data
        await loadCandidates();
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scores");
      console.error("Error saving scores:", err);
    } finally {
      setSaving(false);
    }
  };

  const getScoreValue = (candidate: CandidateScoreEntry, field: "obj" | "essay") => {
    if (!candidate.score_id) {
      return field === "obj" ? candidate.obj_raw_score || "" : candidate.essay_raw_score || "";
    }

    const changes = scoreChanges.get(candidate.score_id);
    if (changes && changes[field] !== undefined) {
      return changes[field] || "";
    }
    return field === "obj" ? candidate.obj_raw_score || "" : candidate.essay_raw_score || "";
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Manual Score Entry" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Exam Type</label>
                  <Select
                    value={examType || ""}
                    onValueChange={handleExamTypeChange}
                    disabled={loadingFilters}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Exam Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(exams.map((e) => e.name as ExamType))).map((type) => (
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
                      <SelectValue placeholder="Select Series" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(
                        examType
                          ? exams.filter((e) => e.name === examType).map((e) => e.series as ExamSeries)
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
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(
                        (() => {
                          let filtered = exams;
                          if (examType) filtered = filtered.filter((e) => e.name === examType);
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
                  <label className="text-sm font-medium mb-2 block">Programme</label>
                  <Select
                    value={filters.programme_id?.toString() || undefined}
                    onValueChange={(value) => handleFilterChange("programme_id", value && value !== "all" ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Programmes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Programmes</SelectItem>
                      {programmes.map((programme) => (
                        <SelectItem key={programme.id} value={programme.id.toString()}>
                          {programme.name}
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
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {scoreChanges.size > 0 && (
                <span>{scoreChanges.size} score(s) modified</span>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={scoreChanges.size === 0 || saving || !filters.exam_id}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>

          {/* Candidates Table */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>Candidates ({total})</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {!filters.exam_id ? (
                <div className="text-center text-muted-foreground py-8">
                  Please select an examination to view candidates
                </div>
              ) : loading && loadingFilters ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Index Number</TableHead>
                      <TableHead>Candidate Name</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Programme</TableHead>
                      <TableHead>Test Type 1 (Objectives)</TableHead>
                      <TableHead>Test Type 2 (Essay)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No candidates found with existing scores
                        </TableCell>
                      </TableRow>
                    ) : (
                      candidates.map((candidate) => (
                        <TableRow key={candidate.score_id || candidate.candidate_id}>
                          <TableCell className="font-medium">{candidate.candidate_index_number}</TableCell>
                          <TableCell>{candidate.candidate_name}</TableCell>
                          <TableCell>{candidate.subject_name}</TableCell>
                          <TableCell>{candidate.programme_name || "-"}</TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={getScoreValue(candidate, "obj")}
                              onChange={(e) => handleScoreChange(candidate, "obj", e.target.value)}
                              placeholder="Enter score"
                              className="w-32"
                              disabled={!candidate.score_id}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={getScoreValue(candidate, "essay")}
                              onChange={(e) => handleScoreChange(candidate, "essay", e.target.value)}
                              placeholder="Enter score"
                              className="w-32"
                              disabled={!candidate.score_id}
                            />
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
