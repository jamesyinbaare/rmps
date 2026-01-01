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
import { Loader2, Save, Search, X, Users, Edit, CheckCircle2, AlertCircle, Filter, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

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
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]); // Store all subjects for filtering

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

  // Document ID search mode - tracks which document type matched
  const [documentIdMatchType, setDocumentIdMatchType] = useState<"obj" | "essay" | "pract" | null>(null);

  // Collapsible state for filters and stats
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);

  // Keyboard shortcut handler (Ctrl/Cmd + K to toggle filters)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to toggle filters
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setFiltersOpen((prev) => !prev);
      }
      // Ctrl+Shift+K or Cmd+Shift+K to toggle stats
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        setStatsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        setAllSubjects(subjectsData); // Store all subjects
        setSubjects([]); // Don't show subjects until school is selected
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
        setSubjects([]); // Clear subjects when school is cleared
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

  // Load subjects when school is selected (and optionally programme)
  useEffect(() => {
    async function loadSubjectsForSchoolAndProgramme() {
      if (!pendingFilters.school_id) {
        setSubjects([]);
        return;
      }

      setLoadingSubjects(true);
      try {
        let subjectsToShow: Subject[] = [];

        if (pendingFilters.programme_id) {
          // If programme is selected, load subjects from that programme
          const programmeSubjects = await listProgrammeSubjects(pendingFilters.programme_id);
          // Convert ProgrammeSubject[] to Subject[] by matching with allSubjects
          const programmeSubjectIds = new Set(programmeSubjects.map(ps => ps.subject_id));
          subjectsToShow = allSubjects.filter(subject => programmeSubjectIds.has(subject.id));
        } else {
          // If only school is selected (no programme), show all subjects
          // In the future, if there's a listSchoolSubjects API, use that
          subjectsToShow = allSubjects;
        }

        setSubjects(subjectsToShow);
      } catch (err) {
        console.error("Error loading subjects:", err);
        // Fallback to all subjects on error
        setSubjects(allSubjects);
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjectsForSchoolAndProgramme();
  }, [pendingFilters.school_id, pendingFilters.programme_id, allSubjects]);

  // Load candidates
  const loadCandidates = useCallback(async () => {
    // Check if exam filters are present (required for both document_id and regular search)
    const hasRequiredExamFilters = filters.exam_id || (filters.exam_type && filters.series && filters.year);

    if (filters.document_id) {
      // When searching by document_id, exam filters are required
      if (!hasRequiredExamFilters) {
        setCandidates([]);
        setTotal(0);
        setTotalPages(0);
        setCurrentPage(1);
        return;
      }
    } else {
      // Regular search requires exam filters, school, and subject
      if (!hasRequiredExamFilters || !filters.school_id || !filters.subject_id) {
        setCandidates([]);
        setTotal(0);
        setTotalPages(0);
        setCurrentPage(1);
        return;
      }
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

      // If searching by document_id, determine which document type matched
      if (filters.document_id && response.items.length > 0) {
        const firstCandidate = response.items[0];
        if (firstCandidate.obj_document_id === filters.document_id) {
          setDocumentIdMatchType("obj");
          setShowObj(true);
          setShowEssay(false);
          setShowPract(false);
        } else if (firstCandidate.essay_document_id === filters.document_id) {
          setDocumentIdMatchType("essay");
          setShowObj(false);
          setShowEssay(true);
          setShowPract(false);
        } else if (firstCandidate.pract_document_id === filters.document_id) {
          setDocumentIdMatchType("pract");
          setShowObj(false);
          setShowEssay(false);
          setShowPract(true);
        } else {
          // Fallback - shouldn't happen but handle gracefully
          setDocumentIdMatchType(null);
        }
      } else {
        // Reset to default when not searching by document_id
        setDocumentIdMatchType(null);
        // Keep current toggle states when not using document_id search
      }
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
    // Always update exam filters - document_id now requires them (no longer standalone)
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

      // If document_id is being cleared, keep other filters
      if (key === "document_id" && !value) {
        delete newFilters.document_id;
        // Reset document ID match type when clearing
        setDocumentIdMatchType(null);
      }

      // Clear dependent filters when parent filter changes
      if (key === "school_id") {
        // Clear programme and subject when school changes
        newFilters.programme_id = undefined;
        newFilters.subject_id = undefined;
        setProgrammes([]);
        setSubjects([]);
      }
      if (key === "programme_id") {
        // Clear subject when programme changes
        newFilters.subject_id = undefined;
      }

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
    // Reset document ID match type
    setDocumentIdMatchType(null);
    // Reset toggles to default
    setShowObj(true);
    setShowEssay(true);
    setShowPract(false);
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
        const errorMsg = `Failed to save ${response.failed} score(s). ${response.errors.map((e) => e.error || "").join(", ")}`;
        setError(errorMsg);
        toast.error(errorMsg);
      } else {
        // Success - reload data
        await loadCandidates();
        setError(null);
        toast.success(`Successfully saved ${scoreUpdates.length} score(s)`);
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

  // Check if a candidate row has changes
  const hasRowChanges = (candidate: CandidateScoreEntry) => {
    if (!candidate.score_id) return false;
    return scoreChanges.has(candidate.score_id);
  };

  // Check if a specific field has changed
  const hasFieldChanged = (candidate: CandidateScoreEntry, field: "obj" | "essay" | "pract") => {
    if (!candidate.score_id) return false;
    const changes = scoreChanges.get(candidate.score_id);
    if (!changes) return false;
    return changes[field] !== undefined;
  };

  // Calculate statistics
  const stats = {
    total: total,
    loaded: candidates.length,
    modified: scoreChanges.size,
    complete: candidates.filter((c) => {
      const obj = getScoreValue(c, "obj");
      const essay = getScoreValue(c, "essay");
      const pract = c.pract_pct !== null ? getScoreValue(c, "pract") : null;
      return obj && essay && (pract !== null ? pract : true);
    }).length,
    incomplete: candidates.filter((c) => {
      const obj = getScoreValue(c, "obj");
      const essay = getScoreValue(c, "essay");
      const pract = c.pract_pct !== null ? getScoreValue(c, "pract") : null;
      return !obj || !essay || (pract !== null && !pract);
    }).length,
  };

  // Get active filter chips
  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];

    if (examType) {
      chips.push({
        label: `Type: ${examType === "Certificate II Examination" ? "Certificate II" : examType}`,
        onRemove: () => handleExamTypeChange("all"),
      });
    }
    if (examSeries) {
      chips.push({
        label: `Series: ${examSeries}`,
        onRemove: () => handleExamSeriesChange("all"),
      });
    }
    if (examYear) {
      chips.push({
        label: `Year: ${examYear}`,
        onRemove: () => handleExamYearChange("all"),
      });
    }
    if (pendingFilters.school_id) {
      const school = schools.find((s) => s.id === pendingFilters.school_id);
      chips.push({
        label: `School: ${school ? `${school.code} - ${school.name}` : `ID: ${pendingFilters.school_id}`}`,
        onRemove: () => handleFilterChange("school_id", undefined),
      });
    }
    if (pendingFilters.programme_id) {
      const programme = programmes.find((p) => p.id === pendingFilters.programme_id);
      chips.push({
        label: `Programme: ${programme ? programme.name : `ID: ${pendingFilters.programme_id}`}`,
        onRemove: () => handleFilterChange("programme_id", undefined),
      });
    }
    if (pendingFilters.subject_id) {
      const subject = subjects.find((s) => s.id === pendingFilters.subject_id);
      chips.push({
        label: `Subject: ${subject ? `${subject.code} - ${subject.name}` : `ID: ${pendingFilters.subject_id}`}`,
        onRemove: () => handleFilterChange("subject_id", undefined),
      });
    }
    if (pendingFilters.document_id) {
      chips.push({
        label: `Document: ${pendingFilters.document_id}`,
        onRemove: () => handleFilterChange("document_id", undefined),
      });
    }

    return chips;
  };

  const handleClearAllChanges = () => {
    setScoreChanges(new Map());
    toast.info("All changes cleared");
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Manual Score Entry" />

        {/* Statistics Dashboard - Collapsible */}
        {!loading && candidates.length > 0 && (
          <div className="border-b border-border bg-background">
            <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
              <div className="px-4 py-2">
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Statistics</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {stats.total}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ctrl+Shift+K</span>
                    {statsOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="px-6 pb-4 border-t border-border pt-4">
                  <div className="grid gap-4 md:grid-cols-5 max-w-[2000px] mx-auto">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Candidates</p>
                      <p className="text-2xl font-bold mt-1">{stats.total.toLocaleString()}</p>
                    </div>
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Loaded</p>
                      <p className="text-2xl font-bold mt-1">{stats.loaded.toLocaleString()}</p>
                    </div>
                    <FileText className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className={`cursor-pointer hover:shadow-md transition-shadow ${stats.modified > 0 ? 'border-orange-300 bg-orange-50/50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Modified</p>
                      <p className="text-2xl font-bold mt-1 text-orange-600">{stats.modified.toLocaleString()}</p>
                    </div>
                    <Edit className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Complete</p>
                      <p className="text-2xl font-bold mt-1 text-green-600">{stats.complete.toLocaleString()}</p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Incomplete</p>
                      <p className="text-2xl font-bold mt-1 text-yellow-600">{stats.incomplete.toLocaleString()}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-yellow-600" />
                  </div>
                </CardContent>
              </Card>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Filters - Collapsible */}
          <div className="border-b border-border bg-background -mx-6 px-6 pb-4">
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <div className="py-2">
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters</span>
                    {getActiveFilterChips().length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {getActiveFilterChips().length}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ctrl+K</span>
                    {filtersOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="pt-4">
                  <div className="flex justify-center">
                    <Card className="w-1/3">
                      <CardContent>
                      <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Exam Type</label>
                  <Select
                    value={examType || ""}
                    onValueChange={handleExamTypeChange}
                    disabled={loadingFilters || !!pendingFilters.document_id}
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
                    disabled={loadingFilters || !examType || !!pendingFilters.document_id}
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
                    disabled={loadingFilters || !examType || !examSeries || !!pendingFilters.document_id}
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
                      if (value === "" || value === undefined) {
                        handleFilterChange("school_id", undefined);
                      } else {
                        handleFilterChange("school_id", typeof value === "number" ? value : parseInt(value.toString()));
                      }
                    }}
                    placeholder="Select School"
                    disabled={loadingFilters || !examType || !examSeries || !examYear || !!pendingFilters.document_id}
                    allowAll={false}
                    searchPlaceholder="Search schools..."
                    emptyMessage="No schools found"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Programme</label>
                  <Select
                    value={pendingFilters.programme_id?.toString() || undefined}
                    onValueChange={(value) => handleFilterChange("programme_id", value && value !== "all" ? parseInt(value) : undefined)}
                    disabled={loadingFilters || loadingProgrammes || !pendingFilters.school_id || !!pendingFilters.document_id}
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
                      if (value === "" || value === undefined) {
                        handleFilterChange("subject_id", undefined);
                      } else {
                        handleFilterChange("subject_id", typeof value === "number" ? value : parseInt(value.toString()));
                      }
                    }}
                    placeholder={!pendingFilters.school_id ? "Select School First" : "Select Subject"}
                    disabled={loadingFilters || loadingSubjects || !pendingFilters.school_id}
                    allowAll={false}
                    searchPlaceholder="Search subjects..."
                    emptyMessage="No subjects found"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium w-32 text-center">Document ID</label>
                  <Input
                    type="text"
                    placeholder={!examType || !examSeries || !examYear ? "Select Exam Type, Series, and Year first" : "Enter document ID..."}
                    value={pendingFilters.document_id || ""}
                    onChange={(e) => {
                      const docId = e.target.value || undefined;
                      handleFilterChange("document_id", docId);
                    }}
                    disabled={loadingFilters || !examType || !examSeries || !examYear}
                    className="flex-1"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSearch}
                    disabled={
                      loading ||
                      !examType ||
                      !examSeries ||
                      !examYear ||
                      (!pendingFilters.document_id && (
                        !pendingFilters.school_id ||
                        !pendingFilters.subject_id
                      ))
                    }
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

                  {/* Active Filter Chips */}
                  {getActiveFilterChips().length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      <span className="text-xs text-muted-foreground">Active:</span>
                      {getActiveFilterChips().map((chip, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80 text-xs h-5"
                          onClick={chip.onRemove}
                        >
                          {chip.label}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {scoreChanges.size > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-300">
                    <Edit className="h-3 w-3 mr-1" />
                    {scoreChanges.size} change{scoreChanges.size !== 1 ? 's' : ''} pending
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearAllChanges}
                    disabled={saving}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All Changes
                  </Button>
                </div>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={scoreChanges.size === 0 || saving || (!filters.exam_id && !filters.exam_type)}
              size="lg"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save {scoreChanges.size > 0 ? `${scoreChanges.size} Change${scoreChanges.size !== 1 ? 's' : ''}` : 'Changes'}
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
                        disabled={documentIdMatchType !== null && documentIdMatchType !== "obj"}
                      />
                      <label htmlFor="toggle-obj" className={`text-sm ${documentIdMatchType !== null && documentIdMatchType !== "obj" ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"}`}>
                        Objectives
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="toggle-essay"
                        checked={showEssay}
                        onCheckedChange={(checked) => setShowEssay(checked === true)}
                        disabled={documentIdMatchType !== null && documentIdMatchType !== "essay"}
                      />
                      <label htmlFor="toggle-essay" className={`text-sm ${documentIdMatchType !== null && documentIdMatchType !== "essay" ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"}`}>
                        Essay
                      </label>
                    </div>
                    {candidates.some((c) => c.pract_pct !== null) && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="toggle-pract"
                          checked={showPract}
                          onCheckedChange={(checked) => setShowPract(checked === true)}
                          disabled={documentIdMatchType !== null && documentIdMatchType !== "pract"}
                        />
                        <label htmlFor="toggle-pract" className={`text-sm ${documentIdMatchType !== null && documentIdMatchType !== "pract" ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"}`}>
                          Practicals
                        </label>
                      </div>
                    )}
                    {documentIdMatchType && (
                      <Badge variant="outline" className="text-xs">
                        Showing: {documentIdMatchType === "obj" ? "Objectives" : documentIdMatchType === "essay" ? "Essay" : "Practicals"}
                      </Badge>
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
                <div className="flex flex-col items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <div className="text-sm text-muted-foreground">Loading candidates...</div>
                  <div className="mt-4 w-full max-w-md">
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  </div>
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
                        filteredCandidates.map((candidate) => {
                          const rowHasChanges = hasRowChanges(candidate);
                          const rowClass = rowHasChanges
                            ? "bg-orange-50/50 hover:bg-orange-100/50 border-l-2 border-l-orange-500"
                            : "";
                          return (
                          <TableRow key={candidate.score_id || candidate.candidate_id} className={rowClass}>
                            <TableCell className="font-medium">{candidate.candidate_index_number}</TableCell>
                            <TableCell>{candidate.candidate_name}</TableCell>
                            <TableCell>{candidate.subject_series ?? "-"}</TableCell>
                            {hasObj && (
                              <TableCell>
                                <div className="relative">
                                  <Input
                                    type="text"
                                    value={getScoreValue(candidate, "obj")}
                                    onChange={(e) => handleScoreChange(candidate, "obj", e.target.value)}
                                    className={`w-32 ${hasFieldChanged(candidate, "obj") ? "border-orange-500 focus:border-orange-600" : ""}`}
                                    disabled={!candidate.score_id}
                                  />
                                  {hasFieldChanged(candidate, "obj") && (
                                    <div className="absolute -right-2 -top-1">
                                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            )}
                            {hasEssay && (
                              <TableCell>
                                <div className="relative">
                                  <Input
                                    type="text"
                                    value={getScoreValue(candidate, "essay")}
                                    onChange={(e) => handleScoreChange(candidate, "essay", e.target.value)}
                                    className={`w-32 ${hasFieldChanged(candidate, "essay") ? "border-orange-500 focus:border-orange-600" : ""}`}
                                    disabled={!candidate.score_id || (documentIdMatchType !== null && documentIdMatchType !== "essay")}
                                  />
                                  {hasFieldChanged(candidate, "essay") && (
                                    <div className="absolute -right-2 -top-1">
                                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            )}
                            {hasPract && (
                              <TableCell>
                                <div className="relative">
                                  <Input
                                    type="text"
                                    value={getScoreValue(candidate, "pract")}
                                    onChange={(e) => handleScoreChange(candidate, "pract", e.target.value)}
                                    className={`w-32 ${hasFieldChanged(candidate, "pract") ? "border-orange-500 focus:border-orange-600" : ""}`}
                                    disabled={!candidate.score_id || candidate.pract_pct === null || (documentIdMatchType !== null && documentIdMatchType !== "pract")}
                                  />
                                  {hasFieldChanged(candidate, "pract") && (
                                    <div className="absolute -right-2 -top-1">
                                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                          );
                        })
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
