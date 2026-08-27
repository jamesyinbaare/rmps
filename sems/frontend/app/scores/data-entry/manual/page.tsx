"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { getCandidatesForManualEntry, getAllExams, listSubjects, batchUpdateScoresForManualEntry, listSchools, listSchoolProgrammes, listProgrammeSubjects, getCurrentUser } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type { Exam, Programme, Subject, School, ManualEntryFilters, CandidateScoreEntry, BatchScoreUpdateItem, ExamType, ExamSeries } from "@/types/document";
import { Loader2, Save, Search, X, Edit, Filter, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ScoreChangeEntry = {
  subject_registration_id: number;
  obj?: string | null;
  essay?: string | null;
  pract?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;

function parseOptionalInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

function filtersFromSearchParams(sp: URLSearchParams): ManualEntryFilters {
  const filters: ManualEntryFilters = {
    page: parseOptionalInt(sp.get("page")) ?? 1,
    page_size: parseOptionalInt(sp.get("page_size")) ?? DEFAULT_PAGE_SIZE,
  };
  const examId = parseOptionalInt(sp.get("exam_id"));
  if (examId != null) filters.exam_id = examId;
  const schoolId = parseOptionalInt(sp.get("school_id"));
  if (schoolId != null) filters.school_id = schoolId;
  const programmeId = parseOptionalInt(sp.get("programme_id"));
  if (programmeId != null) filters.programme_id = programmeId;
  const subjectId = parseOptionalInt(sp.get("subject_id"));
  if (subjectId != null) filters.subject_id = subjectId;
  const documentId = sp.get("document_id")?.trim();
  if (documentId) filters.document_id = documentId;
  return filters;
}

function filtersToQueryString(filters: ManualEntryFilters): string {
  const params = new URLSearchParams();
  if (filters.exam_id != null) params.set("exam_id", String(filters.exam_id));
  if (filters.school_id != null) params.set("school_id", String(filters.school_id));
  if (filters.programme_id != null) params.set("programme_id", String(filters.programme_id));
  if (filters.subject_id != null) params.set("subject_id", String(filters.subject_id));
  if (filters.document_id) params.set("document_id", filters.document_id);
  if (filters.page != null && filters.page !== 1) params.set("page", String(filters.page));
  if (filters.page_size != null && filters.page_size !== DEFAULT_PAGE_SIZE) {
    params.set("page_size", String(filters.page_size));
  }
  return params.toString();
}

function isScopedFilters(filters: ManualEntryFilters): boolean {
  if (filters.document_id) return Boolean(filters.exam_id);
  return Boolean(filters.exam_id && filters.school_id && filters.subject_id);
}

export default function ManualEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastUrlQueryRef = useRef<string | null>(null);

  const [authChecked, setAuthChecked] = useState(false);
  const [candidates, setCandidates] = useState<CandidateScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<ManualEntryFilters>(() =>
    filtersFromSearchParams(searchParams)
  );
  // Pending filters - filters that are set but not yet applied
  const [pendingFilters, setPendingFilters] = useState<ManualEntryFilters>(() =>
    filtersFromSearchParams(searchParams)
  );
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

  // Exam filtering state (combined)
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(() =>
    parseOptionalInt(searchParams.get("exam_id"))
  );

  // Score changes tracking - use score_id as key, but only track if score_id exists
  const [scoreChanges, setScoreChanges] = useState<Map<number, ScoreChangeEntry>>(new Map());

  // Table filtering state
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [tableSubjectSeriesFilter, setTableSubjectSeriesFilter] = useState<number | "all">("all");

  // Test type visibility toggles
  const [showObj, setShowObj] = useState(true);
  const [showEssay, setShowEssay] = useState(true);
  const [showPract, setShowPract] = useState(false);

  // Document ID search mode - tracks which document type matched
  const [documentIdMatchType, setDocumentIdMatchType] = useState<"obj" | "essay" | "pract" | null>(null);

  // Collapsible filters — open until scoped (URL or Search)
  const initialScoped = isScopedFilters(filtersFromSearchParams(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(!initialScoped);
  const [hasScopedOnce, setHasScopedOnce] = useState(initialScoped);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Keyboard shortcuts: Ctrl+K filters, Ctrl+S save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setFiltersOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (scoreChanges.size > 0 && !saving) {
          void handleSaveRef.current?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scoreChanges.size, saving]);

  // Warn on tab close with unsaved edits
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (scoreChanges.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [scoreChanges.size]);

  // Load filter options
  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
        const user = await getCurrentUser().catch(() => null);
        if (user && normalizeRole(user.role) === "DATACLERK") {
          router.replace("/clerk");
          return;
        }
        setAuthChecked(true);

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
        setAuthChecked(true);
      } finally {
        setLoadingFilters(false);
      }
    }
    loadFilterOptions();
  }, [router]);

  // Load programmes when school is selected (in pending filters)
  useEffect(() => {
    async function loadProgrammesForSchool() {
      if (!pendingFilters.school_id) {
        setProgrammes([]);
        return;
      }

      setLoadingProgrammes(true);
      try {
        const programmesData = await listSchoolProgrammes(pendingFilters.school_id);
        setProgrammes(programmesData);
      } catch (err) {
        console.error("Error loading programmes for school:", err);
      } finally {
        setLoadingProgrammes(false);
      }
    }
    void loadProgrammesForSchool();
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
          const programmeSubjects = await listProgrammeSubjects(pendingFilters.programme_id);
          const programmeSubjectIds = new Set(programmeSubjects.map((ps) => ps.subject_id));
          subjectsToShow = allSubjects.filter((subject) => programmeSubjectIds.has(subject.id));
        } else {
          subjectsToShow = allSubjects;
        }

        setSubjects(subjectsToShow);
      } catch (err) {
        console.error("Error loading subjects:", err);
        setSubjects(allSubjects);
      } finally {
        setLoadingSubjects(false);
      }
    }
    void loadSubjectsForSchoolAndProgramme();
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
      // Keep scoreChanges across reloads so edits survive pagination

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

  // Keep applied filters in the URL so refresh restores scope
  useEffect(() => {
    const next = filtersToQueryString(filters);
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/scores/data-entry/manual${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    filters.exam_id,
    filters.school_id,
    filters.programme_id,
    filters.subject_id,
    filters.document_id,
    filters.page,
    filters.page_size,
    router,
  ]);

  // Enrich pending/applied exam metadata when exams load (do not reset page or wipe pending)
  useEffect(() => {
    if (!selectedExamId || exams.length === 0) return;
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam) return;
    const patch = {
      exam_id: exam.id,
      exam_type: exam.exam_type as ExamType,
      series: exam.series as ExamSeries,
      year: exam.year,
    };
    setPendingFilters((prev) => {
      if (
        prev.exam_id === patch.exam_id &&
        prev.exam_type === patch.exam_type &&
        prev.series === patch.series &&
        prev.year === patch.year
      ) {
        return prev;
      }
      return { ...prev, ...patch };
    });
    setFilters((prev) => {
      if (prev.exam_id !== exam.id) return prev;
      if (
        prev.exam_type === patch.exam_type &&
        prev.series === patch.series &&
        prev.year === patch.year
      ) {
        return prev;
      }
      return { ...prev, ...patch };
    });
  }, [selectedExamId, exams]);

  // Hydrate exam picker from applied URL/filters only — never clear pending selection
  useEffect(() => {
    if (!filters.exam_id) return;
    if (filters.exam_id !== selectedExamId) {
      setSelectedExamId(filters.exam_id);
    }
  }, [filters.exam_id, selectedExamId]);

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

  const confirmDiscardChanges = (actionLabel: string) => {
    if (scoreChanges.size === 0) return true;
    return window.confirm(
      `You have ${scoreChanges.size} unsaved change${scoreChanges.size === 1 ? "" : "s"}. ${actionLabel} will discard them. Continue?`
    );
  };

  const handleSearch = () => {
    if (!confirmDiscardChanges("Searching")) return;
    setScoreChanges(new Map());
    const searchFilters = {
      ...pendingFilters,
      page: 1,
    };
    setFilters(searchFilters);
    setPendingFilters(searchFilters);
    setHasScopedOnce(true);
    setFiltersOpen(false);
  };

  const handleClearFilters = () => {
    if (!confirmDiscardChanges("Clearing filters")) return;
    setScoreChanges(new Map());
    setSelectedExamId(undefined);
    const cleared: ManualEntryFilters = {
      page: 1,
      page_size: DEFAULT_PAGE_SIZE,
    };
    setPendingFilters(cleared);
    setFilters(cleared);
    lastUrlQueryRef.current = "";
    router.replace("/scores/data-entry/manual", { scroll: false });
    setProgrammes([]);
    setSubjects([]);
    setDocumentIdMatchType(null);
    setShowObj(true);
    setShowEssay(true);
    setShowPract(false);
    setHasScopedOnce(false);
    setFiltersOpen(true);
  };

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      setSelectedExamId(undefined);
      setPendingFilters((prev) => ({
        ...prev,
        exam_id: undefined,
        exam_type: undefined,
        series: undefined,
        year: undefined,
        page: 1,
      }));
      return;
    }
    const examId = typeof value === "number" ? value : parseInt(String(value), 10);
    const exam = exams.find((e) => e.id === examId);
    setSelectedExamId(examId);
    setPendingFilters((prev) => ({
      ...prev,
      exam_id: examId,
      exam_type: exam ? (exam.exam_type as ExamType) : prev.exam_type,
      series: exam ? (exam.series as ExamSeries) : prev.series,
      year: exam ? exam.year : prev.year,
      page: 1,
    }));
  };

  // Generate exam options for the combined dropdown
  const examOptions = exams
    .slice()
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (a.series !== b.series) return a.series.localeCompare(b.series);
      return (a.exam_type || "").localeCompare(b.exam_type || "");
    })
    .map((exam) => {
      const typeLabel = exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
      return {
        value: exam.id,
        label: `${exam.year} ${exam.series} ${typeLabel}`,
      };
    });

  const handleScoreChange = (candidate: CandidateScoreEntry, field: "obj" | "essay" | "pract", value: string) => {
    if (!candidate.score_id || !candidate.subject_registration_id) {
      return;
    }

    setScoreChanges((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(candidate.score_id!) || {
        subject_registration_id: candidate.subject_registration_id,
      };
      newMap.set(candidate.score_id!, {
        ...current,
        subject_registration_id: candidate.subject_registration_id,
        [field]: value || null,
      });
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
        const update: BatchScoreUpdateItem = {
          score_id: scoreId,
          subject_registration_id: changes.subject_registration_id,
        };
        if (changes.obj !== undefined) update.obj_raw_score = changes.obj;
        if (changes.essay !== undefined) update.essay_raw_score = changes.essay;
        if (changes.pract !== undefined) update.pract_raw_score = changes.pract;

        if (
          changes.obj === undefined &&
          changes.essay === undefined &&
          changes.pract === undefined
        ) {
          return;
        }

        scoreUpdates.push(update);
      });

      if (scoreUpdates.length === 0) {
        setError("No changes to save");
        return;
      }

      const response = await batchUpdateScoresForManualEntry({ scores: scoreUpdates });

      if (response.failed > 0 && response.successful === 0) {
        const errorMsg = `Failed to save ${response.failed} score(s). ${response.errors.map((e) => e.error || "").join(", ")}`;
        setError(errorMsg);
        toast.error(errorMsg);
      } else if (response.failed > 0) {
        const errorMsg = `Saved ${response.successful}, failed ${response.failed}. ${response.errors.map((e) => e.error || "").join(", ")}`;
        setError(errorMsg);
        toast.error(errorMsg);
        // Patch local rows for succeeded updates, keep remaining dirty map entries
        setCandidates((prev) =>
          prev.map((c) => {
            if (!c.score_id || !scoreChanges.has(c.score_id)) return c;
            const changes = scoreChanges.get(c.score_id)!;
            return {
              ...c,
              obj_raw_score: changes.obj !== undefined ? changes.obj : c.obj_raw_score,
              essay_raw_score: changes.essay !== undefined ? changes.essay : c.essay_raw_score,
              pract_raw_score: changes.pract !== undefined ? changes.pract : c.pract_raw_score,
            };
          })
        );
        // On partial failure we cannot know which IDs failed without per-id errors — keep all dirty
      } else {
        setCandidates((prev) =>
          prev.map((c) => {
            if (!c.score_id || !scoreChanges.has(c.score_id)) return c;
            const changes = scoreChanges.get(c.score_id)!;
            return {
              ...c,
              obj_raw_score: changes.obj !== undefined ? changes.obj : c.obj_raw_score,
              essay_raw_score: changes.essay !== undefined ? changes.essay : c.essay_raw_score,
              pract_raw_score: changes.pract !== undefined ? changes.pract : c.pract_raw_score,
            };
          })
        );
        setScoreChanges(new Map());
        setError(null);
        toast.success(`Successfully saved ${scoreUpdates.length} score(s)`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save scores";
      setError(message);
      toast.error(message);
      console.error("Error saving scores:", err);
    } finally {
      setSaving(false);
    }
  };

  handleSaveRef.current = handleSave;

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
  };

  const changePage = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
    setPendingFilters((prev) => ({ ...prev, page: newPage }));
  };

  const changePageSize = (newPageSize: number) => {
    setFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }));
    setPendingFilters((prev) => ({ ...prev, page_size: newPageSize, page: 1 }));
  };

  // Get active filter chips
  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];

    if (selectedExamId) {
      const exam = exams.find((e) => e.id === selectedExamId);
      if (exam) {
        const typeLabel = exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
        chips.push({
          label: `Exam: ${exam.year} ${exam.series} ${typeLabel}`,
          onRemove: () => handleExamChange("all"),
        });
      }
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

  if (!authChecked) {
    return (
      <DashboardLayout>
        <div className="flex flex-1 items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-0 flex-col">
        <TopBar title="Manual Score Entry" />

        {/* Dense sticky toolbar */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                Total <span className="font-semibold text-foreground">{stats.total.toLocaleString()}</span>
              </span>
              <span className="text-border">·</span>
              <span>
                On page <span className="font-semibold text-foreground">{stats.loaded.toLocaleString()}</span>
              </span>
              <span className="text-border">·</span>
              <span>
                Complete <span className="font-semibold text-foreground">{stats.complete.toLocaleString()}</span>
              </span>
              {stats.modified > 0 && (
                <>
                  <span className="text-border">·</span>
                  <Badge variant="secondary" className="h-5 gap-1 border-orange-300 bg-orange-50 px-1.5 text-orange-800">
                    <Edit className="h-3 w-3" />
                    {stats.modified} unsaved
                  </Badge>
                </>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="toggle-obj"
                    checked={showObj}
                    onCheckedChange={(checked) => setShowObj(checked === true)}
                    disabled={documentIdMatchType !== null && documentIdMatchType !== "obj"}
                  />
                  <label
                    htmlFor="toggle-obj"
                    className={cn(
                      "text-xs",
                      documentIdMatchType !== null && documentIdMatchType !== "obj"
                        ? "cursor-not-allowed text-muted-foreground"
                        : "cursor-pointer"
                    )}
                  >
                    Obj
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="toggle-essay"
                    checked={showEssay}
                    onCheckedChange={(checked) => setShowEssay(checked === true)}
                    disabled={documentIdMatchType !== null && documentIdMatchType !== "essay"}
                  />
                  <label
                    htmlFor="toggle-essay"
                    className={cn(
                      "text-xs",
                      documentIdMatchType !== null && documentIdMatchType !== "essay"
                        ? "cursor-not-allowed text-muted-foreground"
                        : "cursor-pointer"
                    )}
                  >
                    Essay
                  </label>
                </div>
                {(candidates.some((c) => c.pract_pct !== null) || showPract) && (
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="toggle-pract"
                      checked={showPract}
                      onCheckedChange={(checked) => setShowPract(checked === true)}
                      disabled={documentIdMatchType !== null && documentIdMatchType !== "pract"}
                    />
                    <label
                      htmlFor="toggle-pract"
                      className={cn(
                        "text-xs",
                        documentIdMatchType !== null && documentIdMatchType !== "pract"
                          ? "cursor-not-allowed text-muted-foreground"
                          : "cursor-pointer"
                      )}
                    >
                      Pract
                    </label>
                  </div>
                )}
              </div>

              <Button
                variant={filtersOpen ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <Filter className="h-3.5 w-3.5" />
                Scope
                {getActiveFilterChips().length > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                    {getActiveFilterChips().length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent>
              <div className="space-y-2 border-t border-border px-4 py-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-[200px] sm:w-[240px]">
                    <label className="mb-1 block text-[11px] text-muted-foreground">Examination</label>
                    <SearchableSelect
                      options={examOptions}
                      value={selectedExamId || ""}
                      onValueChange={handleExamChange}
                      placeholder="Select exam"
                      disabled={loadingFilters || !!pendingFilters.document_id}
                      allowAll={false}
                      searchPlaceholder="Search examinations..."
                      emptyMessage="No examinations found"
                      triggerClassName="h-8"
                    />
                  </div>
                  <div className="w-[180px] sm:w-[220px]">
                    <label className="mb-1 block text-[11px] text-muted-foreground">School</label>
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
                          handleFilterChange(
                            "school_id",
                            typeof value === "number" ? value : parseInt(value.toString())
                          );
                        }
                      }}
                      placeholder="Select school"
                      disabled={loadingFilters || !selectedExamId || !!pendingFilters.document_id}
                      allowAll={false}
                      searchPlaceholder="Search schools..."
                      emptyMessage="No schools found"
                      triggerClassName="h-8"
                    />
                  </div>
                  <div className="w-[160px]">
                    <label className="mb-1 block text-[11px] text-muted-foreground">Programme</label>
                    <Select
                      value={pendingFilters.programme_id?.toString() || undefined}
                      onValueChange={(value) =>
                        handleFilterChange(
                          "programme_id",
                          value && value !== "all" ? parseInt(value) : undefined
                        )
                      }
                      disabled={
                        loadingFilters ||
                        loadingProgrammes ||
                        !pendingFilters.school_id ||
                        !!pendingFilters.document_id
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All programmes</SelectItem>
                        {programmes.map((programme) => (
                          <SelectItem key={programme.id} value={programme.id.toString()}>
                            {programme.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[180px] sm:w-[220px]">
                    <label className="mb-1 block text-[11px] text-muted-foreground">Subject</label>
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
                          handleFilterChange(
                            "subject_id",
                            typeof value === "number" ? value : parseInt(value.toString())
                          );
                        }
                      }}
                      placeholder={!pendingFilters.school_id ? "School first" : "Select subject"}
                      disabled={loadingFilters || loadingSubjects || !pendingFilters.school_id}
                      allowAll={false}
                      searchPlaceholder="Search subjects..."
                      emptyMessage="No subjects found"
                      triggerClassName="h-8"
                    />
                  </div>
                  <div className="w-[140px]">
                    <label className="mb-1 block text-[11px] text-muted-foreground">Document ID</label>
                    <Input
                      type="text"
                      placeholder={!selectedExamId ? "Exam first" : "Optional…"}
                      value={pendingFilters.document_id || ""}
                      onChange={(e) => handleFilterChange("document_id", e.target.value || undefined)}
                      disabled={loadingFilters || !selectedExamId}
                      className="h-8"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={handleSearch}
                    disabled={
                      loading ||
                      !selectedExamId ||
                      (!pendingFilters.document_id &&
                        (!pendingFilters.school_id || !pendingFilters.subject_id))
                    }
                  >
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    Search
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={handleClearFilters}
                    disabled={loading}
                  >
                    Clear
                  </Button>
                </div>
                {getActiveFilterChips().length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getActiveFilterChips().map((chip, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="h-5 cursor-pointer gap-1 pr-1 text-xs hover:bg-secondary/80"
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

        {/* Table region */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <Input
              type="text"
              placeholder="Filter index or name…"
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              className="h-8 w-56"
            />
            <Select
              value={tableSubjectSeriesFilter === "all" ? "all" : tableSubjectSeriesFilter.toString()}
              onValueChange={(value) =>
                setTableSubjectSeriesFilter(value === "all" ? "all" : parseInt(value))
              }
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue placeholder="Series" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All series</SelectItem>
                {Array.from(
                  new Set(
                    candidates
                      .map((c) => c.subject_series)
                      .filter((s): s is number => s !== null)
                  )
                )
                  .sort((a, b) => a - b)
                  .map((series) => (
                    <SelectItem key={series} value={series.toString()}>
                      Series {series}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {documentIdMatchType && (
              <Badge variant="outline" className="text-xs">
                Showing:{" "}
                {documentIdMatchType === "obj"
                  ? "Objectives"
                  : documentIdMatchType === "essay"
                    ? "Essay"
                    : "Practicals"}
              </Badge>
            )}
            {hasScopedOnce && !filtersOpen && (
              <button
                type="button"
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setFiltersOpen(true)}
              >
                Change scope
                <ChevronDown className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
            {error && (
              <div className="mb-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {!filters.exam_id && !filters.exam_type ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <p className="text-sm font-medium text-foreground">Choose a scope to begin</p>
                <p className="text-xs">Select an examination, school, and subject, then Search.</p>
                {!filtersOpen && (
                  <Button size="sm" variant="outline" className="mt-1 h-8" onClick={() => setFiltersOpen(true)}>
                    Open scope
                  </Button>
                )}
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="mb-3 h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading candidates…</p>
              </div>
            ) : (
              (() => {
                const filteredCandidates = candidates.filter((candidate) => {
                  const searchLower = tableSearchQuery.toLowerCase();
                  const matchesSearch =
                    !searchLower ||
                    candidate.candidate_index_number.toLowerCase().includes(searchLower) ||
                    candidate.candidate_name.toLowerCase().includes(searchLower);
                  const matchesSeries =
                    tableSubjectSeriesFilter === "all" ||
                    candidate.subject_series === tableSubjectSeriesFilter;
                  return matchesSearch && matchesSeries;
                });

                const hasObj = showObj;
                const hasEssay = showEssay;
                const hasPract = showPract && candidates.some((c) => c.pract_pct !== null);
                const testTypeCount = [hasObj, hasEssay, hasPract].filter(Boolean).length;

                const fieldEnabled = (
                  candidate: CandidateScoreEntry,
                  field: "obj" | "essay" | "pract"
                ) => {
                  if (!candidate.score_id) return false;
                  if (field === "pract" && candidate.pract_pct === null) return false;
                  if (documentIdMatchType !== null && documentIdMatchType !== field) return false;
                  return true;
                };

                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Index</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-20">Series</TableHead>
                        {hasObj && <TableHead>Obj</TableHead>}
                        {hasEssay && <TableHead>Essay</TableHead>}
                        {hasPract && <TableHead>Pract</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3 + testTypeCount}
                            className="py-10 text-center text-muted-foreground"
                          >
                            {candidates.length === 0
                              ? "No candidates found with existing scores"
                              : "No candidates match the table filter"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCandidates.map((candidate) => {
                          const rowHasChanges = hasRowChanges(candidate);
                          return (
                            <TableRow
                              key={candidate.score_id || candidate.candidate_id}
                              className={cn(
                                rowHasChanges && "border-l-2 border-l-orange-500 bg-orange-50/40"
                              )}
                            >
                              <TableCell className="font-medium tabular-nums">
                                {candidate.candidate_index_number}
                              </TableCell>
                              <TableCell>{candidate.candidate_name}</TableCell>
                              <TableCell>{candidate.subject_series ?? "—"}</TableCell>
                              {hasObj && (
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={getScoreValue(candidate, "obj")}
                                    onChange={(e) =>
                                      handleScoreChange(candidate, "obj", e.target.value)
                                    }
                                    className={cn(
                                      "h-8 w-24",
                                      hasFieldChanged(candidate, "obj") &&
                                        "border-orange-500 focus-visible:border-orange-600"
                                    )}
                                    disabled={!fieldEnabled(candidate, "obj")}
                                  />
                                </TableCell>
                              )}
                              {hasEssay && (
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={getScoreValue(candidate, "essay")}
                                    onChange={(e) =>
                                      handleScoreChange(candidate, "essay", e.target.value)
                                    }
                                    className={cn(
                                      "h-8 w-24",
                                      hasFieldChanged(candidate, "essay") &&
                                        "border-orange-500 focus-visible:border-orange-600"
                                    )}
                                    disabled={!fieldEnabled(candidate, "essay")}
                                  />
                                </TableCell>
                              )}
                              {hasPract && (
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={getScoreValue(candidate, "pract")}
                                    onChange={(e) =>
                                      handleScoreChange(candidate, "pract", e.target.value)
                                    }
                                    className={cn(
                                      "h-8 w-24",
                                      hasFieldChanged(candidate, "pract") &&
                                        "border-orange-500 focus-visible:border-orange-600"
                                    )}
                                    disabled={!fieldEnabled(candidate, "pract")}
                                  />
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                );
              })()
            )}
          </div>

          {/* Sticky footer: save + pagination */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-2">
            <div className="flex items-center gap-2">
              {scoreChanges.size > 0 ? (
                <>
                  <Badge
                    variant="secondary"
                    className="h-6 gap-1 border-orange-300 bg-orange-50 text-orange-800"
                  >
                    <Edit className="h-3 w-3" />
                    {scoreChanges.size} unsaved
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={handleClearAllChanges}
                    disabled={saving}
                  >
                    Discard
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No unsaved changes</span>
              )}
            </div>

            <Button
              size="sm"
              className="h-8"
              onClick={() => void handleSave()}
              disabled={scoreChanges.size === 0 || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save{scoreChanges.size > 0 ? ` ${scoreChanges.size}` : ""}
                  <kbd className="ml-1.5 hidden rounded border border-border/60 px-1 text-[10px] font-normal opacity-70 sm:inline">
                    ⌘S
                  </kbd>
                </>
              )}
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select
                value={(filters.page_size || DEFAULT_PAGE_SIZE).toString()}
                onValueChange={(value) => changePageSize(parseInt(value))}
              >
                <SelectTrigger className="h-8 w-20">
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
              <span className="text-xs text-muted-foreground">per page</span>
              {totalPages > 1 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => changePage((filters.page || 1) - 1)}
                    disabled={currentPage === 1 || loading}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => changePage((filters.page || 1) + 1)}
                    disabled={currentPage === totalPages || loading}
                  >
                    Next
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
