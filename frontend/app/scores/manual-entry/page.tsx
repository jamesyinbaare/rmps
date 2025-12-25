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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { getCandidatesForManualEntry, getAllExams, listProgrammes, listSubjects, batchUpdateScoresForManualEntry, findExamId, listSchools, listSchoolProgrammes, listProgrammeSubjects } from "@/lib/api";
import type { Exam, Programme, Subject, School, ManualEntryFilters, CandidateScoreEntry, BatchScoreUpdateItem, ExamType, ExamSeries } from "@/types/document";
import { Loader2, Save, Search, X } from "lucide-react";

export default function ManualEntryPage() {
  const [candidates, setCandidates] = useState<CandidateScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<ManualEntryFilters>({
    page: 1,
    page_size: 20,
  });
  // Pending filters - filters that are set but not yet applied
  const [pendingFilters, setPendingFilters] = useState<ManualEntryFilters>({
    page: 1,
    page_size: 20,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter options
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);

  // Exam filtering state (three-step: type, series, year)
  const [examType, setExamType] = useState<ExamType | undefined>();
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>();
  const [examYear, setExamYear] = useState<number | undefined>();

  // Score changes tracking - use score_id as key, but only track if score_id exists
  const [scoreChanges, setScoreChanges] = useState<Map<number, { obj?: string | null; essay?: string | null; pract?: string | null }>>(new Map());

  // Table filtering state
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [tableSubjectSeriesFilter, setTableSubjectSeriesFilter] = useState<number | "all">("all");

  // Test type visibility toggles
  const [showObj, setShowObj] = useState(true);
  const [showEssay, setShowEssay] = useState(true);
  const [showPract, setShowPract] = useState(false);

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        // Load exams, schools, and all subjects
        const [examsData, schoolsData, subjectsData] = await Promise.all([
          getAllExams(),
          (async () => {
            const allSchools: School[] = [];
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const schoolsPage = await listSchools(page, 100);
              allSchools.push(...schoolsPage);
              hasMore = schoolsPage.length === 100;
              page++;
            }
            return allSchools;
          })(),
          (async () => {
            const allSubjects: Subject[] = [];
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const subjectsPage = await listSubjects(page, 100);
              allSubjects.push(...subjectsPage);
              hasMore = subjectsPage.length === 100;
              page++;
            }
            return allSubjects;
          })(),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
        setSubjects(subjectsData); // Load all subjects initially
        setProgrammes([]);
      } catch (err) {
        console.error("Error loading filter options:", err);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, []);

  // Load programmes when school is selected (in pending filters)
  useEffect(() => {
    async function loadProgrammesForSchool() {
      if (!pendingFilters.school_id) {
        setProgrammes([]);
        // Reload all subjects when school is cleared
        try {
          const allSubjects: Subject[] = [];
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const subjectsPage = await listSubjects(page, 100);
            allSubjects.push(...subjectsPage);
            hasMore = subjectsPage.length === 100;
            page++;
          }
          setSubjects(allSubjects);
        } catch (err) {
          console.error("Error loading all subjects:", err);
        }
        return;
      }

      setLoadingProgrammes(true);
      try {
        const programmesData = await listSchoolProgrammes(pendingFilters.school_id);
        setProgrammes(programmesData);
        // Clear programme in pending filters when school changes
        setPendingFilters((prev) => ({
          ...prev,
          programme_id: undefined,
        }));
      } catch (err) {
        console.error("Error loading programmes for school:", err);
      } finally {
        setLoadingProgrammes(false);
      }
    }
    loadProgrammesForSchool();
  }, [pendingFilters.school_id]);

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

  // Find exam_id when type, series, year are all selected (update pending filters)
  useEffect(() => {
    if (examType && examSeries && examYear) {
      const foundExamId = findExamId(exams, examType, examSeries, examYear);
      setPendingFilters((prev) => ({
        ...prev,
        exam_id: foundExamId || undefined,
        exam_type: foundExamId ? undefined : examType,
        series: foundExamId ? undefined : examSeries,
        year: foundExamId ? undefined : examYear,
        page: 1,
      }));
    } else {
      // Update pending filters with exam_type, series, year when exam_id is not available
      setPendingFilters((prev) => ({
        ...prev,
        exam_id: undefined,
        exam_type: examType,
        series: examSeries,
        year: examYear,
        page: 1,
      }));
    }
  }, [examType, examSeries, examYear, exams]);

  const handleFilterChange = (key: keyof ManualEntryFilters, value: number | string | undefined) => {
    setPendingFilters((prev) => {
      const newFilters = {
        ...prev,
        [key]: value,
        page: 1, // Reset to first page when filter changes
      };

      // Clear dependent filters when parent filter changes
      if (key === "school_id") {
        // Clear programme when school changes (but keep subject - it can be selected independently)
        newFilters.programme_id = undefined;
        setProgrammes([]);
      }
      // Note: subject_id is no longer dependent on programme_id

      return newFilters;
    });
  };

  const handleSearch = () => {
    // Apply pending filters to actual filters, which will trigger the search
    const searchFilters = {
      ...pendingFilters,
      page: 1,
    };
    setFilters(searchFilters);
    setPendingFilters(searchFilters); // Keep in sync
  };

  const handleClearFilters = () => {
    // Clear all filters
    setExamType(undefined);
    setExamSeries(undefined);
    setExamYear(undefined);
    setPendingFilters({
      page: 1,
      page_size: 20,
    });
    setFilters({
      page: 1,
      page_size: 20,
    });
    setProgrammes([]);
    setSubjects([]);
    // Reload all subjects
    (async () => {
      try {
        const allSubjects: Subject[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const subjectsPage = await listSubjects(page, 100);
          allSubjects.push(...subjectsPage);
          hasMore = subjectsPage.length === 100;
          page++;
        }
        setSubjects(allSubjects);
      } catch (err) {
        console.error("Error loading all subjects:", err);
      }
    })();
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

  const handleScoreChange = (candidate: CandidateScoreEntry, field: "obj" | "essay" | "pract", value: string) => {
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
          pract_raw_score: changes.pract !== undefined ? changes.pract : candidate.pract_raw_score,
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

  const getScoreValue = (candidate: CandidateScoreEntry, field: "obj" | "essay" | "pract") => {
    if (!candidate.score_id) {
      if (field === "obj") return candidate.obj_raw_score || "";
      if (field === "essay") return candidate.essay_raw_score || "";
      if (field === "pract") return candidate.pract_raw_score || "";
      return "";
    }

    const changes = scoreChanges.get(candidate.score_id);
    if (changes && changes[field] !== undefined) {
      return changes[field] || "";
    }
    if (field === "obj") return candidate.obj_raw_score || "";
    if (field === "essay") return candidate.essay_raw_score || "";
    if (field === "pract") return candidate.pract_raw_score || "";
    return "";
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Manual Score Entry" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters */}
          <div className="flex justify-center">
            <Card className="w-1/3">
              <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Exam Type</label>
                  <Select
                    value={examType || ""}
                    onValueChange={handleExamTypeChange}
                    disabled={loadingFilters}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Exam Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(exams.map((e) => e.exam_type as ExamType))).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type === "Certificate II Examination" ? "Certificate II" : type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Series</label>
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

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Year</label>
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

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">School</label>
                  <SearchableSelect
                    options={schools.map((school) => ({
                      value: school.id,
                      label: `${school.code} - ${school.name}`,
                    }))}
                    value={pendingFilters.school_id || ""}
                    onValueChange={(value) => {
                      if (value === "all" || value === "") {
                        handleFilterChange("school_id", undefined);
                      } else {
                        handleFilterChange("school_id", typeof value === "number" ? value : parseInt(value.toString()));
                      }
                    }}
                    placeholder="All Schools"
                    disabled={loadingFilters}
                    allowAll={true}
                    allLabel="All Schools"
                    searchPlaceholder="Search schools..."
                    emptyMessage="No schools found"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Programme</label>
                  <Select
                    value={pendingFilters.programme_id?.toString() || undefined}
                    onValueChange={(value) => handleFilterChange("programme_id", value && value !== "all" ? parseInt(value) : undefined)}
                    disabled={loadingFilters || loadingProgrammes || !pendingFilters.school_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={pendingFilters.school_id ? "Select Programme" : "Select School First"} />
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

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Subject</label>
                  <SearchableSelect
                    options={subjects.map((subject) => ({
                      value: subject.id,
                      label: `${subject.code} - ${subject.name}`,
                    }))}
                    value={pendingFilters.subject_id || ""}
                    onValueChange={(value) => {
                      if (value === "all" || value === "") {
                        handleFilterChange("subject_id", undefined);
                      } else {
                        handleFilterChange("subject_id", typeof value === "number" ? value : parseInt(value.toString()));
                      }
                    }}
                    placeholder="All Subjects"
                    disabled={loadingFilters}
                    allowAll={true}
                    allLabel="All Subjects"
                    searchPlaceholder="Search subjects..."
                    emptyMessage="No subjects found"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Document ID</label>
                  <Input
                    type="text"
                    placeholder="Enter document ID..."
                    value={pendingFilters.document_id || ""}
                    onChange={(e) => handleFilterChange("document_id", e.target.value || undefined)}
                    disabled={loadingFilters}
                    className="flex-1"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSearch}
                    disabled={loading || (!pendingFilters.exam_id && !pendingFilters.exam_type)}
                    className="flex-1"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </Button>
                  <Button
                    onClick={handleClearFilters}
                    variant="outline"
                    disabled={loading}
                    className="flex-1"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear Filters
                  </Button>
                </div>
              </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {scoreChanges.size > 0 && (
                <span>{scoreChanges.size} score(s) modified</span>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={scoreChanges.size === 0 || saving || (!filters.exam_id && !filters.exam_type)}
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Search by index number or name..."
                    value={tableSearchQuery}
                    onChange={(e) => setTableSearchQuery(e.target.value)}
                    className="w-64"
                  />
                  <Select
                    value={tableSubjectSeriesFilter === "all" ? "all" : tableSubjectSeriesFilter.toString()}
                    onValueChange={(value) => setTableSubjectSeriesFilter(value === "all" ? "all" : parseInt(value))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="All Series" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Series</SelectItem>
                      {Array.from(new Set(candidates.map((c) => c.subject_series).filter((s): s is number => s !== null)))
                        .sort((a, b) => a - b)
                        .map((series) => (
                          <SelectItem key={series} value={series.toString()}>
                            Series {series}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-4">
                  {/* Test Type Toggles */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="toggle-obj"
                        checked={showObj}
                        onCheckedChange={(checked) => setShowObj(checked === true)}
                      />
                      <label htmlFor="toggle-obj" className="text-sm cursor-pointer">
                        Objectives
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="toggle-essay"
                        checked={showEssay}
                        onCheckedChange={(checked) => setShowEssay(checked === true)}
                      />
                      <label htmlFor="toggle-essay" className="text-sm cursor-pointer">
                        Essay
                      </label>
                    </div>
                    {candidates.some((c) => c.pract_pct !== null) && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="toggle-pract"
                          checked={showPract}
                          onCheckedChange={(checked) => setShowPract(checked === true)}
                        />
                        <label htmlFor="toggle-pract" className="text-sm cursor-pointer">
                          Practicals
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={filters.page_size?.toString() || "20"}
                      onValueChange={(value) => {
                        const newPageSize = parseInt(value);
                        setFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }));
                        setPendingFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }));
                      }}
                    >
                      <SelectTrigger className="w-24 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[25, 50, 75, 100, 125, 150, 175, 200].map((size) => (
                          <SelectItem key={size} value={size.toString()}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">per page</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {!filters.exam_id && !filters.exam_type ? (
                <div className="text-center text-muted-foreground py-8">
                  Please select an examination to view candidates
                </div>
              ) : loading && loadingFilters ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (() => {
                // Filter candidates based on search query and subject series
                const filteredCandidates = candidates.filter((candidate) => {
                  // Search filter
                  const searchLower = tableSearchQuery.toLowerCase();
                  const matchesSearch =
                    !searchLower ||
                    candidate.candidate_index_number.toLowerCase().includes(searchLower) ||
                    candidate.candidate_name.toLowerCase().includes(searchLower);

                  // Subject series filter
                  const matchesSeries =
                    tableSubjectSeriesFilter === "all" || candidate.subject_series === tableSubjectSeriesFilter;

                  return matchesSearch && matchesSeries;
                });

                // Determine which test types to show based on toggle state
                const hasObj = showObj;
                const hasEssay = showEssay;
                const hasPract = showPract && candidates.some((c) => c.pract_pct !== null);
                const testTypeCount = [hasObj, hasEssay, hasPract].filter(Boolean).length;

                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Index Number</TableHead>
                        <TableHead>Candidate Name</TableHead>
                        <TableHead>Subject Series</TableHead>
                        {hasObj && <TableHead>Objectives</TableHead>}
                        {hasEssay && <TableHead>Essay</TableHead>}
                        {hasPract && <TableHead>Practicals</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3 + testTypeCount} className="text-center text-muted-foreground">
                            {candidates.length === 0
                              ? "No candidates found with existing scores"
                              : "No candidates match the search criteria"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCandidates.map((candidate) => (
                          <TableRow key={candidate.score_id || candidate.candidate_id}>
                            <TableCell className="font-medium">{candidate.candidate_index_number}</TableCell>
                            <TableCell>{candidate.candidate_name}</TableCell>
                            <TableCell>{candidate.subject_series ?? "-"}</TableCell>
                            {hasObj && (
                              <TableCell>
                                <Input
                                  type="text"
                                  value={getScoreValue(candidate, "obj")}
                                  onChange={(e) => handleScoreChange(candidate, "obj", e.target.value)}
                                  className="w-32"
                                  disabled={!candidate.score_id}
                                />
                              </TableCell>
                            )}
                            {hasEssay && (
                              <TableCell>
                                <Input
                                  type="text"
                                  value={getScoreValue(candidate, "essay")}
                                  onChange={(e) => handleScoreChange(candidate, "essay", e.target.value)}
                                  className="w-32"
                                  disabled={!candidate.score_id}
                                />
                              </TableCell>
                            )}
                            {hasPract && (
                              <TableCell>
                                <Input
                                  type="text"
                                  value={getScoreValue(candidate, "pract")}
                                  onChange={(e) => handleScoreChange(candidate, "pract", e.target.value)}
                                  className="w-32"
                                  disabled={!candidate.score_id || candidate.pract_pct === null}
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                );
              })()}

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
                      onClick={() => {
                        const newPage = (filters.page || 1) - 1;
                        setFilters((prev) => ({ ...prev, page: newPage }));
                        setPendingFilters((prev) => ({ ...prev, page: newPage }));
                      }}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = (filters.page || 1) + 1;
                        setFilters((prev) => ({ ...prev, page: newPage }));
                        setPendingFilters((prev) => ({ ...prev, page: newPage }));
                      }}
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
