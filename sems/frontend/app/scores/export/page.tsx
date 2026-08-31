"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  SubjectMultiSelectFilter,
  type SubjectTypeFilterValue,
} from "@/components/SubjectMultiSelectFilter";
import {
  getCandidatesForManualEntry,
  getAllExams,
  listProgrammes,
  listSubjects,
  listSchools,
  listSchoolProgrammes,
  listProgrammeSubjects,
  exportCandidateResults,
  startResultsExportJob,
  getResultsExportJob,
  downloadResultsExportJobFile,
  type ResultsExportJobStatus,
} from "@/lib/api";
import { DATA_ENTRY_EXAM_STORAGE_KEY } from "@/hooks/useDataEntryExamScope";
import { examLabel } from "@/components/results/exam-label";
import { buildExportColumnShape, type ExportPaper } from "@/lib/export-column-preview";
import { cn } from "@/lib/utils";
import type {
  Exam,
  Programme,
  Subject,
  School,
  ManualEntryFilters,
  CandidateScoreEntry,
  ExportFormat,
} from "@/types/document";
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  LayoutList,
  Table2,
  ChevronsUpDown,
  X,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

const PREVIEW_PAGE_SIZE = 20;
const PREVIEW_DEBOUNCE_MS = 300;
const JOB_POLL_MS = 1500;
const JOB_STORAGE_KEY = "sems.results_export.job_id";

const EXPORT_PAPER_OPTIONS: { id: ExportPaper; label: string; short: string }[] = [
  { id: "obj", label: "Paper 1 (Objectives)", short: "P1" },
  { id: "essay", label: "Paper 2 (Essay)", short: "P2" },
];

const EXPORT_FIELDS = {
  candidate: [
    { id: "candidate_name", label: "Candidate Name" },
    { id: "candidate_index_number", label: "Index Number" },
  ],
  school: [
    { id: "school_name", label: "School Name" },
    { id: "school_code", label: "School Code" },
  ],
  exam: [
    { id: "exam_name", label: "Exam Name" },
    { id: "exam_type", label: "Exam Type" },
    { id: "exam_year", label: "Exam Year" },
    { id: "exam_series", label: "Exam Series" },
  ],
  programme: [
    { id: "programme_name", label: "Programme Name" },
    { id: "programme_code", label: "Programme Code" },
  ],
  subject: [
    { id: "subject_name", label: "Subject Name" },
    { id: "subject_code", label: "Subject Code" },
    { id: "subject_series", label: "Subject Series" },
  ],
  rawScores: [
    { id: "obj_raw_score", label: "Objectives Raw Score" },
    { id: "essay_raw_score", label: "Essay Raw Score" },
    { id: "pract_raw_score", label: "Practical Raw Score" },
  ],
  normalizedScores: [
    { id: "obj_normalized", label: "Objectives Normalized" },
    { id: "essay_normalized", label: "Essay Normalized" },
    { id: "pract_normalized", label: "Practical Normalized" },
  ],
  results: [
    { id: "total_score", label: "Total Score" },
    { id: "grade", label: "Grade" },
  ],
  documentIds: [
    { id: "obj_document_id", label: "Objectives Document ID" },
    { id: "essay_document_id", label: "Essay Document ID" },
    { id: "pract_document_id", label: "Practical Document ID" },
  ],
  metadata: [
    { id: "created_at", label: "Created At" },
    { id: "updated_at", label: "Updated At" },
  ],
} as const;

const ALL_FIELD_IDS = Object.values(EXPORT_FIELDS).flatMap((category) =>
  category.map((field) => field.id)
);

const MULTI_SUBJECT_ALLOWED = new Set([
  "candidate_name",
  "candidate_index_number",
  "school_name",
  "school_code",
  "exam_name",
  "exam_type",
  "exam_year",
  "exam_series",
  "programme_name",
  "programme_code",
]);

const PRESET_SCORES = [
  "candidate_name",
  "candidate_index_number",
  "school_name",
  "subject_name",
  "subject_code",
  "obj_raw_score",
  "essay_raw_score",
  "pract_raw_score",
  "total_score",
  "grade",
];

const PRESET_GRADES = [
  "candidate_name",
  "candidate_index_number",
  "school_name",
  "subject_name",
  "subject_code",
  "total_score",
  "grade",
];

const PREVIEWABLE_FIELDS = new Set([
  "candidate_name",
  "candidate_index_number",
  "exam_name",
  "exam_type",
  "exam_year",
  "exam_series",
  "programme_name",
  "programme_code",
  "subject_name",
  "subject_code",
  "subject_series",
  "obj_raw_score",
  "essay_raw_score",
  "pract_raw_score",
  "obj_document_id",
  "essay_document_id",
  "pract_document_id",
]);

type ScopeMode = "CORE" | "ELECTIVE" | "subject";
type FieldPreset = "scores" | "grades" | "all" | "custom";

type JobDockState = {
  jobId: number;
  status: ResultsExportJobStatus | null;
  error: string | null;
};

function allowedFieldIds(format: ExportFormat): string[] {
  if (format === "multi_subject") {
    return ALL_FIELD_IDS.filter((id) => MULTI_SUBJECT_ALLOWED.has(id));
  }
  return [...ALL_FIELD_IDS];
}

function pruneFieldsToFormat(fields: Set<string>, format: ExportFormat): Set<string> {
  const allowed = new Set(allowedFieldIds(format));
  const next = new Set([...fields].filter((id) => allowed.has(id)));
  if (next.size === 0) return presetFieldSet("scores", format);
  return next;
}

function presetFieldSet(preset: Exclude<FieldPreset, "custom">, format: ExportFormat): Set<string> {
  const allowed = new Set(allowedFieldIds(format));
  if (preset === "all") return allowed;
  const source = preset === "scores" ? PRESET_SCORES : PRESET_GRADES;
  return new Set(source.filter((id) => allowed.has(id)));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function subjectDisplayCode(subject: Pick<Subject, "code" | "original_code">): string {
  return subject.original_code || subject.code;
}

function previewValue(
  candidate: CandidateScoreEntry,
  fieldId: string,
  originalCodes: Map<number, string>
): string {
  switch (fieldId) {
    case "candidate_name":
      return candidate.candidate_name;
    case "candidate_index_number":
      return candidate.candidate_index_number;
    case "exam_name":
      return candidate.exam_name;
    case "exam_type":
      return candidate.exam_name;
    case "exam_year":
      return String(candidate.exam_year);
    case "exam_series":
      return candidate.exam_series;
    case "programme_name":
      return candidate.programme_name || "—";
    case "programme_code":
      return candidate.programme_code || "—";
    case "subject_name":
      return candidate.subject_name;
    case "subject_code":
      return originalCodes.get(candidate.subject_id) || candidate.subject_code;
    case "subject_series":
      return candidate.subject_series != null ? String(candidate.subject_series) : "—";
    case "obj_raw_score":
      return candidate.obj_raw_score || "—";
    case "essay_raw_score":
      return candidate.essay_raw_score || "—";
    case "pract_raw_score":
      return candidate.pract_raw_score || "—";
    case "obj_document_id":
      return candidate.obj_document_id || "—";
    case "essay_document_id":
      return candidate.essay_document_id || "—";
    case "pract_document_id":
      return candidate.pract_document_id || "—";
    default:
      return "—";
  }
}

function fieldLabel(fieldId: string): string {
  for (const category of Object.values(EXPORT_FIELDS)) {
    const field = category.find((item) => item.id === fieldId);
    if (field) return field.label;
  }
  return fieldId;
}

function FilterLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </p>
  );
}

export default function ExportResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restoredExamRef = useRef(false);
  const pollCancelRef = useRef(false);

  const [candidates, setCandidates] = useState<CandidateScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingExport, setStartingExport] = useState(false);
  const [total, setTotal] = useState(0);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [electiveCodes, setElectiveCodes] = useState<string[]>([]);
  const [loadingElectiveCodes, setLoadingElectiveCodes] = useState(false);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<number | undefined>();
  const [programmeIds, setProgrammeIds] = useState<number[]>([]);
  const [programmeSearch, setProgrammeSearch] = useState("");
  const [programmesOpen, setProgrammesOpen] = useState(false);
  const [papersOpen, setPapersOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(true);
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const [scopeMode, setScopeMode] = useState<ScopeMode | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilterValue>("ALL");

  const [exportFormat, setExportFormat] = useState<ExportFormat>("standard");
  const [testTypes, setTestTypes] = useState<ExportPaper[]>(["obj", "essay"]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);

  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => presetFieldSet("scores", "standard")
  );
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [jobDock, setJobDock] = useState<JobDockState | null>(null);

  useEffect(() => {
    async function loadFilterOptions() {
      setLoadingFilters(true);
      try {
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
            const loaded: Subject[] = [];
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const subjectsPage = await listSubjects(page, 100);
              loaded.push(...subjectsPage);
              hasMore = subjectsPage.length === 100;
              page++;
            }
            return loaded;
          })(),
        ]);
        setExams(Array.isArray(examsData) ? examsData : []);
        setSchools(schoolsData);
        setAllSubjects(subjectsData);
      } catch (err) {
        console.error("Error loading filter options:", err);
        toast.error("Failed to load examinations");
      } finally {
        setLoadingFilters(false);
      }
    }
    void loadFilterOptions();
  }, []);

  const persistExamId = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id != null) {
        try {
          localStorage.setItem(DATA_ENTRY_EXAM_STORAGE_KEY, String(id));
        } catch {
          /* ignore */
        }
        params.set("exam_id", String(id));
      } else {
        params.delete("exam_id");
      }
      const qs = params.toString();
      router.replace(qs ? `/scores/export?${qs}` : "/scores/export");
    },
    [router, searchParams]
  );

  const applyExamId = useCallback(
    (id: number | null) => {
      setSelectedExamId(id);
      persistExamId(id);
    },
    [persistExamId]
  );

  useEffect(() => {
    if (restoredExamRef.current || loadingFilters) return;
    restoredExamRef.current = true;

    const fromQuery = searchParams.get("exam_id");
    let initial: number | null = fromQuery ? Number(fromQuery) : null;
    if (initial == null || Number.isNaN(initial)) {
      try {
        const stored = localStorage.getItem(DATA_ENTRY_EXAM_STORAGE_KEY);
        if (stored) initial = Number(stored);
      } catch {
        /* ignore */
      }
    }
    if (initial == null || Number.isNaN(initial)) return;
    if (exams.length > 0 && !exams.some((exam) => exam.id === initial)) return;
    setSelectedExamId(initial);
    try {
      localStorage.setItem(DATA_ENTRY_EXAM_STORAGE_KEY, String(initial));
    } catch {
      /* ignore */
    }
    if (!fromQuery) persistExamId(initial);
  }, [loadingFilters, exams, searchParams, persistExamId]);

  useEffect(() => {
    async function loadProgrammes() {
      if (scopeMode !== "ELECTIVE") {
        setProgrammes([]);
        return;
      }
      setLoadingProgrammes(true);
      try {
        let programmesData: Programme[] = [];
        if (schoolId) {
          programmesData = await listSchoolProgrammes(schoolId);
        } else {
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const programmesPage = await listProgrammes(page, 100);
            programmesData.push(...programmesPage.items);
            hasMore = page < programmesPage.total_pages;
            page++;
          }
        }
        setProgrammes(programmesData);
        setProgrammeIds((prev) => prev.filter((id) => programmesData.some((p) => p.id === id)));
      } catch (err) {
        console.error("Error loading programmes:", err);
      } finally {
        setLoadingProgrammes(false);
      }
    }
    void loadProgrammes();
  }, [schoolId, scopeMode]);

  // Resolve elective original_codes for selected programmes (column shape)
  useEffect(() => {
    if (scopeMode !== "ELECTIVE" || programmeIds.length === 0) {
      setElectiveCodes([]);
      return;
    }
    let cancelled = false;
    setLoadingElectiveCodes(true);
    void (async () => {
      try {
        const results = await Promise.all(programmeIds.map((id) => listProgrammeSubjects(id)));
        if (cancelled) return;
        const subjectIds = new Set<number>();
        for (const list of results) {
          for (const row of list) {
            if (row.subject_type === "ELECTIVE") subjectIds.add(row.subject_id);
          }
        }
        const codes = allSubjects
          .filter((s) => subjectIds.has(s.id))
          .map((s) => subjectDisplayCode(s));
        setElectiveCodes(codes);
      } catch {
        if (!cancelled) setElectiveCodes([]);
      } finally {
        if (!cancelled) setLoadingElectiveCodes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeMode, programmeIds, allSubjects]);

  const examOptions = useMemo(
    () =>
      [...exams]
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return a.exam_type.localeCompare(b.exam_type);
        })
        .map((exam) => ({
          value: exam.id,
          label: examLabel(exam),
        })),
    [exams]
  );

  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? null;

  const sortedSubjects = useMemo(
    () =>
      [...allSubjects].sort((a, b) =>
        subjectDisplayCode(a).localeCompare(subjectDisplayCode(b), undefined, { numeric: true })
      ),
    [allSubjects]
  );

  const originalCodeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const subject of allSubjects) {
      map.set(subject.id, subjectDisplayCode(subject));
    }
    return map;
  }, [allSubjects]);

  const filteredProgrammes = useMemo(() => {
    const q = programmeSearch.trim().toLowerCase();
    if (!q) return programmes;
    return programmes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q)
    );
  }, [programmes, programmeSearch]);

  const hasValidScope = useMemo(() => {
    if (scopeMode === "CORE") return true;
    if (scopeMode === "ELECTIVE") return programmeIds.length > 0;
    if (scopeMode === "subject") {
      return exportFormat === "standard" ? subjectId != null : selectedSubjectIds.length > 0;
    }
    return false;
  }, [scopeMode, programmeIds, subjectId, selectedSubjectIds, exportFormat]);

  const exportDisableReason = useMemo(() => {
    if (!selectedExamId) return "Select an examination";
    if (selectedFields.size === 0) return "Select at least one column";
    if (!scopeMode) {
      return exportFormat === "multi_subject"
        ? "Select Core, Elective, or specific subjects"
        : "Select Core, Elective, or one subject";
    }
    if (scopeMode === "ELECTIVE" && programmeIds.length === 0) {
      return "Select at least one programme for elective subjects";
    }
    if (exportFormat === "multi_subject" && testTypes.length === 0) {
      return "Select at least one paper";
    }
    if (scopeMode === "subject" && exportFormat === "standard" && !subjectId) {
      return "Select a subject";
    }
    if (scopeMode === "subject" && exportFormat === "multi_subject" && selectedSubjectIds.length === 0) {
      return "Select at least one subject";
    }
    return null;
  }, [
    selectedExamId,
    selectedFields.size,
    scopeMode,
    exportFormat,
    programmeIds,
    testTypes,
    subjectId,
    selectedSubjectIds,
  ]);

  const selectedSubjectCodes = useMemo(() => {
    if (scopeMode === "subject") {
      return selectedSubjectIds
        .map((id) => {
          const s = allSubjects.find((item) => item.id === id);
          return s ? subjectDisplayCode(s) : null;
        })
        .filter((c): c is string => !!c);
    }
    return [];
  }, [scopeMode, allSubjects, selectedSubjectIds]);

  const selectedSubjectsAreAllElective = useMemo(() => {
    if (scopeMode !== "subject" || selectedSubjectIds.length === 0) return false;
    return selectedSubjectIds.every((id) => {
      const s = allSubjects.find((item) => item.id === id);
      return s?.subject_type === "ELECTIVE";
    });
  }, [scopeMode, selectedSubjectIds, allSubjects]);

  const columnShape = useMemo(
    () =>
      buildExportColumnShape({
        format: exportFormat,
        scopeMode,
        papers: testTypes,
        subjectCodes: selectedSubjectCodes,
        electiveCodes:
          scopeMode === "ELECTIVE"
            ? electiveCodes
            : selectedSubjectsAreAllElective
              ? selectedSubjectCodes
              : [],
        fieldCount: selectedFields.size,
      }),
    [
      exportFormat,
      scopeMode,
      testTypes,
      selectedSubjectCodes,
      electiveCodes,
      selectedSubjectsAreAllElective,
      selectedFields.size,
    ]
  );

  const scopeSummary = useMemo(() => {
    const paperLabel =
      exportFormat === "multi_subject"
        ? testTypes.length === 0 || testTypes.length === EXPORT_PAPER_OPTIONS.length
          ? "All papers"
          : testTypes.length === 1
            ? EXPORT_PAPER_OPTIONS.find((p) => p.id === testTypes[0])?.short ?? "1 paper"
            : `${testTypes.length} papers`
        : null;
    if (scopeMode === "CORE") {
      return paperLabel ? `Core · ${paperLabel}` : "Core subjects";
    }
    if (scopeMode === "ELECTIVE") {
      if (programmeIds.length === 0) return "Elective";
      const base =
        programmeIds.length === 1
          ? programmes.find((item) => item.id === programmeIds[0])?.name ?? "1 programme"
          : `${programmeIds.length} programmes`;
      return paperLabel ? `Elective · ${base} · ${paperLabel}` : `Elective · ${base}`;
    }
    if (scopeMode === "subject") {
      if (exportFormat === "multi_subject") {
        const subjectPart = `${selectedSubjectIds.length} subject${selectedSubjectIds.length === 1 ? "" : "s"}`;
        return paperLabel ? `${subjectPart} · ${paperLabel}` : subjectPart;
      }
      const subject = allSubjects.find((item) => item.id === subjectId);
      return subject ? `${subjectDisplayCode(subject)} — ${subject.name}` : "One subject";
    }
    return "No scope";
  }, [
    scopeMode,
    programmeIds,
    programmes,
    exportFormat,
    selectedSubjectIds,
    allSubjects,
    subjectId,
    testTypes,
  ]);

  const activePreset = useMemo<FieldPreset>(() => {
    if (setsEqual(selectedFields, presetFieldSet("scores", exportFormat))) return "scores";
    if (setsEqual(selectedFields, presetFieldSet("grades", exportFormat))) return "grades";
    if (setsEqual(selectedFields, presetFieldSet("all", exportFormat))) return "all";
    return "custom";
  }, [selectedFields, exportFormat]);

  const previewColumns = useMemo(() => {
    const identity = Array.from(selectedFields).filter((fieldId) => PREVIEWABLE_FIELDS.has(fieldId));
    // Multi-subject: prefer identity columns that make sense without per-subject scores
    if (exportFormat === "multi_subject") {
      const preferred = [
        "candidate_index_number",
        "candidate_name",
        "programme_name",
        "programme_code",
        "exam_year",
        "exam_series",
      ];
      const ordered = preferred.filter((id) => identity.includes(id));
      for (const id of identity) {
        if (!ordered.includes(id) && MULTI_SUBJECT_ALLOWED.has(id) && PREVIEWABLE_FIELDS.has(id)) {
          ordered.push(id);
        }
      }
      return ordered;
    }
    return identity;
  }, [selectedFields, exportFormat]);

  const buildFilters = useCallback(
    (forPreview = false): ManualEntryFilters => {
      const firstSelectedSubject =
        selectedSubjectIds.length > 0 ? selectedSubjectIds[0] : undefined;
      return {
        exam_id: selectedExamId ?? undefined,
        school_id: schoolId,
        programme_ids: scopeMode === "ELECTIVE" && programmeIds.length > 0 ? programmeIds : undefined,
        subject_id:
          scopeMode === "subject" && exportFormat === "standard"
            ? subjectId
            : forPreview && scopeMode === "subject" && exportFormat === "multi_subject"
              ? firstSelectedSubject
              : undefined,
        subject_type: scopeMode === "CORE" || scopeMode === "ELECTIVE" ? scopeMode : undefined,
        page: 1,
        page_size: PREVIEW_PAGE_SIZE,
      };
    },
    [
      selectedExamId,
      schoolId,
      scopeMode,
      programmeIds,
      exportFormat,
      subjectId,
      selectedSubjectIds,
    ]
  );

  const loadPreview = useCallback(async () => {
    if (!selectedExamId || !hasValidScope) {
      setCandidates([]);
      setTotal(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getCandidatesForManualEntry(buildFilters(true));
      setCandidates(response.items);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
      setCandidates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, hasValidScope, buildFilters]);

  useEffect(() => {
    if (!selectedExamId || !hasValidScope) {
      setCandidates([]);
      setTotal(0);
      setError(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      void loadPreview();
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [selectedExamId, hasValidScope, loadPreview]);

  const handleFormatChange = (format: ExportFormat) => {
    setExportFormat(format);
    setSelectedFields((prev) => pruneFieldsToFormat(prev, format));
    if (format === "multi_subject") {
      setSubjectId(undefined);
      setTestTypes((prev) => (prev.length === 0 ? ["obj", "essay"] : prev));
    }
    // Keep programmes / multi-subject selections
  };

  const handleScopeChange = (mode: ScopeMode) => {
    setScopeMode(mode);
    if (mode !== "ELECTIVE") {
      setProgrammeIds([]);
      setElectiveCodes([]);
    }
    if (mode !== "subject") {
      setSubjectId(undefined);
      setSelectedSubjectIds([]);
    }
  };

  const handleSchoolChange = (value: string | number | "all" | "") => {
    const hadProgrammes = programmeIds.length > 0;
    if (value === "" || value === "all" || value === undefined) {
      setSchoolId(undefined);
    } else {
      setSchoolId(typeof value === "number" ? value : parseInt(value.toString(), 10));
    }
    setProgrammeIds([]);
    if (hadProgrammes && scopeMode === "ELECTIVE") {
      toast.message("Programmes cleared — school filter changed");
    }
  };

  const handleClearScope = () => {
    setSchoolId(undefined);
    setProgrammeIds([]);
    setSubjectId(undefined);
    setScopeMode(null);
    setSelectedSubjectIds([]);
    setExportFormat("standard");
    setTestTypes(["obj", "essay"]);
    setSelectedFields(presetFieldSet("scores", "standard"));
    setCustomFieldsOpen(false);
    setElectiveCodes([]);
  };

  const pollJob = useCallback(async (jobId: number) => {
    pollCancelRef.current = false;
    for (;;) {
      if (pollCancelRef.current) return;
      const job = await getResultsExportJob(jobId);
      setJobDock({ jobId, status: job, error: null });
      const status = job.status.toLowerCase();
      if (status === "completed") {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(JOB_STORAGE_KEY);
        }
        toast.success("Export ready — download from the panel");
        return;
      }
      if (status === "failed") {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(JOB_STORAGE_KEY);
        }
        setJobDock({
          jobId,
          status: job,
          error: job.error_message || "Export failed",
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
    }
  }, []);

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.sessionStorage.getItem(JOB_STORAGE_KEY) : null;
    if (!stored) return;
    const jobId = parseInt(stored, 10);
    if (Number.isNaN(jobId)) return;
    setJobDock({ jobId, status: null, error: null });
    void pollJob(jobId);
    return () => {
      pollCancelRef.current = true;
    };
  }, [pollJob]);

  const dismissJobDock = () => {
    pollCancelRef.current = true;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(JOB_STORAGE_KEY);
    }
    setJobDock(null);
  };

  const handleDownloadJobFile = async () => {
    if (!jobDock) return;
    try {
      const filename = await downloadResultsExportJobFile(jobDock.jobId);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleExport = async () => {
    if (startingExport) return;
    if (exportDisableReason) {
      toast.error(exportDisableReason);
      return;
    }

    const fieldsToExport = Array.from(selectedFields);
    const subjectIdsArray =
      exportFormat === "multi_subject" && selectedSubjectIds.length > 0
        ? selectedSubjectIds
        : undefined;
    const exportSubjectType: "CORE" | "ELECTIVE" | undefined =
      scopeMode === "CORE" || scopeMode === "ELECTIVE" ? scopeMode : undefined;
    const filters = buildFilters(false);
    const useJob =
      total > 5000 ||
      (!schoolId &&
        !subjectId &&
        (scopeMode === "CORE" || scopeMode === "ELECTIVE" || exportFormat === "multi_subject"));

    setStartingExport(true);
    try {
      if (useJob) {
        const job = await startResultsExportJob(
          filters,
          fieldsToExport,
          exportSubjectType,
          exportFormat,
          exportFormat === "multi_subject" ? testTypes : undefined,
          subjectIdsArray
        );
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(JOB_STORAGE_KEY, String(job.job_id));
        }
        setJobDock({
          jobId: job.job_id,
          status: {
            job_id: job.job_id,
            exam_id: filters.exam_id!,
            status: "pending",
            message: "Queued…",
          },
          error: null,
        });
        toast.message("Export started in the background — you can keep adjusting filters");
        void pollJob(job.job_id);
      } else {
        const filename = await exportCandidateResults(
          filters,
          fieldsToExport,
          exportSubjectType,
          exportFormat,
          exportFormat === "multi_subject" ? testTypes : undefined,
          subjectIdsArray
        );
        toast.success(`Downloaded ${filename}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export results");
    } finally {
      setStartingExport(false);
    }
  };

  const visibleFieldCategories = useMemo(() => {
    return Object.entries(EXPORT_FIELDS)
      .map(([key, fields]) => {
        const filtered =
          exportFormat === "multi_subject"
            ? fields.filter((field) => MULTI_SUBJECT_ALLOWED.has(field.id))
            : [...fields];
        return { key, fields: filtered };
      })
      .filter((category) => category.fields.length > 0);
  }, [exportFormat]);

  const emptyPreviewMessage = !selectedExamId
    ? "Select an examination to export"
    : !hasValidScope
      ? exportFormat === "multi_subject"
        ? "Choose Core, Elective, or specific subjects to preview"
        : "Choose Core, Elective, or a subject to preview"
      : "No candidates match these filters";

  const jobProgress =
    jobDock?.status?.status?.toLowerCase() === "completed"
      ? 100
      : jobDock?.status?.status?.toLowerCase() === "in_progress"
        ? 55
        : jobDock
          ? 12
          : 0;

  const recipeChecklist = useMemo(() => {
    const items: { ok: boolean; label: string }[] = [
      { ok: !!selectedExamId, label: selectedExam ? examLabel(selectedExam) : "Examination" },
      {
        ok: !!scopeMode && hasValidScope,
        label: scopeMode
          ? scopeMode === "CORE"
            ? "Core subjects"
            : scopeMode === "ELECTIVE"
              ? programmeIds.length
                ? `${programmeIds.length} programme${programmeIds.length === 1 ? "" : "s"}`
                : "Programmes required"
              : exportFormat === "multi_subject"
                ? `${selectedSubjectIds.length || 0} subject(s)`
                : subjectId
                  ? "Subject selected"
                  : "Subject required"
          : "Choose scope",
      },
      {
        ok: exportFormat !== "multi_subject" || testTypes.length > 0,
        label:
          exportFormat === "multi_subject"
            ? testTypes.length
              ? `Papers: ${testTypes.map((t) => (t === "obj" ? "P1" : "P2")).join(", ")}`
              : "Select papers"
            : "Standard layout",
      },
      {
        ok: selectedFields.size > 0,
        label: `${selectedFields.size} identity/field column${selectedFields.size === 1 ? "" : "s"}`,
      },
    ];
    return items;
  }, [
    selectedExamId,
    selectedExam,
    scopeMode,
    hasValidScope,
    programmeIds,
    exportFormat,
    selectedSubjectIds,
    subjectId,
    testTypes,
    selectedFields.size,
  ]);

  const ExportButton = (
    <Button
      onClick={() => void handleExport()}
      disabled={startingExport || !!exportDisableReason}
      size="default"
      className="shrink-0"
    >
      {startingExport ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Export to Excel
        </>
      )}
    </Button>
  );

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-0 flex-col">
        <TopBar
          title="Export"
          showSearch={false}
          trailing={
            selectedExamId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground"
                onClick={handleClearScope}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            ) : null
          }
        />

        <div className={cn("flex-1 overflow-y-auto p-4 lg:p-5", jobDock && "pb-36")}>
          {!selectedExamId ? (
            <div className="mx-auto max-w-md rounded-xl border border-dashed p-10 text-center">
              <p className="font-medium">Choose an examination</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Then pick format, scope, and columns.
              </p>
              <div className="mx-auto mt-5 max-w-sm text-left">
                <FilterLabel required>Examination</FilterLabel>
                <SearchableSelect
                  options={examOptions}
                  value={selectedExamId ?? ""}
                  onValueChange={(value) => {
                    if (value === "" || value === "all" || value === undefined) {
                      applyExamId(null);
                    } else {
                      applyExamId(typeof value === "number" ? value : Number(value));
                    }
                  }}
                  placeholder="Select examination"
                  disabled={loadingFilters}
                  allowAll={false}
                  searchPlaceholder="Search by year, series, or type..."
                  emptyMessage="No examinations found"
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5">
              <div className="min-w-0 space-y-3">
                <section className="rounded-lg border bg-card p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="sm:col-span-2 xl:col-span-2">
                      <FilterLabel required>Examination</FilterLabel>
                      <SearchableSelect
                        options={examOptions}
                        value={selectedExamId ?? ""}
                        onValueChange={(value) => {
                          if (value === "" || value === "all" || value === undefined) {
                            applyExamId(null);
                          } else {
                            applyExamId(typeof value === "number" ? value : Number(value));
                          }
                        }}
                        placeholder="Select examination"
                        disabled={loadingFilters}
                        allowAll={false}
                        searchPlaceholder="Search by year, series, or type..."
                        emptyMessage="No examinations found"
                      />
                    </div>

                    <div>
                      <FilterLabel>School</FilterLabel>
                      <SearchableSelect
                        options={schools.map((school) => ({
                          value: school.id,
                          label: `${school.code} - ${school.name}`,
                        }))}
                        value={schoolId || ""}
                        onValueChange={handleSchoolChange}
                        placeholder="All schools"
                        disabled={loadingFilters}
                        allowAll
                        allLabel="All schools"
                        searchPlaceholder="Search schools..."
                        emptyMessage="No schools found"
                      />
                    </div>

                    <div>
                      <FilterLabel>Format</FilterLabel>
                      <div className="inline-flex h-9 w-full rounded-md border border-border bg-muted/40 p-0.5">
                        {(
                          [
                            { value: "standard" as const, label: "Standard", icon: LayoutList },
                            {
                              value: "multi_subject" as const,
                              label: "Multi-subject",
                              icon: Table2,
                            },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleFormatChange(option.value)}
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors",
                              exportFormat === option.value
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <option.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div>
                      <FilterLabel required>Scope</FilterLabel>
                      <div className="inline-flex h-9 rounded-md border border-border bg-muted/40 p-0.5">
                        {(
                          [
                            { value: "CORE" as const, label: "Core" },
                            { value: "ELECTIVE" as const, label: "Elective" },
                            {
                              value: "subject" as const,
                              label: exportFormat === "multi_subject" ? "Subjects" : "Subject",
                            },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleScopeChange(option.value)}
                            className={cn(
                              "rounded-sm px-3 text-xs font-medium transition-colors",
                              scopeMode === option.value
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {exportFormat === "multi_subject" ? (
                      <div className="min-w-[160px] flex-1 sm:max-w-[220px]">
                        <FilterLabel required>Papers</FilterLabel>
                        <Popover open={papersOpen} onOpenChange={setPapersOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 w-full justify-between font-normal"
                            >
                              <span className="truncate">
                                {testTypes.length === 0
                                  ? "Select papers"
                                  : testTypes.length === EXPORT_PAPER_OPTIONS.length
                                    ? "All papers"
                                    : testTypes.length === 1
                                      ? EXPORT_PAPER_OPTIONS.find((p) => p.id === testTypes[0])
                                          ?.label
                                      : `${testTypes.length} papers`}
                              </span>
                              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-2"
                            align="start"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setTestTypes([])}
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setTestTypes(EXPORT_PAPER_OPTIONS.map((p) => p.id))
                                }
                              >
                                Select all
                              </button>
                            </div>
                            <div className="space-y-1">
                              {EXPORT_PAPER_OPTIONS.map((paper) => {
                                const checked = testTypes.includes(paper.id);
                                return (
                                  <label
                                    key={paper.id}
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(value) => {
                                        const on = value === true;
                                        setTestTypes((prev) => {
                                          if (on) {
                                            return prev.includes(paper.id)
                                              ? prev
                                              : [...prev, paper.id].sort();
                                          }
                                          return prev.filter((id) => id !== paper.id);
                                        });
                                      }}
                                    />
                                    {paper.label}
                                  </label>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : null}

                    {scopeMode === "ELECTIVE" ? (
                      <div className="min-w-0 flex-1 sm:min-w-[220px]">
                        <FilterLabel required>Programmes</FilterLabel>
                        <Popover
                          open={programmesOpen}
                          onOpenChange={(open) => {
                            setProgrammesOpen(open);
                            if (!open) setProgrammeSearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 w-full justify-between font-normal"
                              disabled={loadingFilters || loadingProgrammes}
                            >
                              <span className="truncate">
                                {loadingProgrammes
                                  ? "Loading…"
                                  : programmeIds.length === 0
                                    ? "Select programmes"
                                    : programmeIds.length === 1
                                      ? programmes.find((p) => p.id === programmeIds[0])?.name ??
                                        "1 programme"
                                      : `${programmeIds.length} programmes`}
                              </span>
                              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[min(100vw-2rem,360px)] space-y-2 p-2"
                            align="start"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2 px-1">
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setProgrammeIds([])}
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setProgrammeIds(programmes.map((p) => p.id))}
                              >
                                Select all
                              </button>
                            </div>
                            <Input
                              value={programmeSearch}
                              onChange={(e) => setProgrammeSearch(e.target.value)}
                              placeholder="Search programmes…"
                              className="h-8"
                            />
                            <div className="max-h-60 space-y-1 overflow-y-auto">
                              {filteredProgrammes.length === 0 ? (
                                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                                  No programmes found
                                </p>
                              ) : (
                                filteredProgrammes.map((programme) => {
                                  const checked = programmeIds.includes(programme.id);
                                  return (
                                    <label
                                      key={programme.id}
                                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(value) => {
                                          const on = value === true;
                                          setProgrammeIds((prev) => {
                                            if (on) {
                                              return prev.includes(programme.id)
                                                ? prev
                                                : [...prev, programme.id].sort((a, b) => a - b);
                                            }
                                            return prev.filter((id) => id !== programme.id);
                                          });
                                        }}
                                      />
                                      <span className="min-w-0 truncate">{programme.name}</span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {programmeIds.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {programmeIds.slice(0, 5).map((id) => {
                              const p = programmes.find((item) => item.id === id);
                              if (!p) return null;
                              return (
                                <Badge
                                  key={id}
                                  variant="secondary"
                                  className="h-5 max-w-[120px] gap-1 pr-1 text-[10px]"
                                >
                                  <span className="truncate">{p.code || p.name}</span>
                                  <button
                                    type="button"
                                    className="rounded-sm hover:bg-muted"
                                    onClick={() =>
                                      setProgrammeIds((prev) => prev.filter((pid) => pid !== id))
                                    }
                                    aria-label={`Remove ${p.name}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              );
                            })}
                            {programmeIds.length > 5 ? (
                              <Badge variant="outline" className="h-5 text-[10px]">
                                +{programmeIds.length - 5}
                              </Badge>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Union of electives · component columns by code digit
                          </p>
                        )}
                      </div>
                    ) : null}

                    {scopeMode === "subject" && exportFormat === "standard" ? (
                      <div className="min-w-0 flex-1 sm:min-w-[240px]">
                        <FilterLabel required>Subject</FilterLabel>
                        <SearchableSelect
                          options={sortedSubjects.map((subject) => ({
                            value: subject.id,
                            label: `${subjectDisplayCode(subject)} - ${subject.name}`,
                          }))}
                          value={subjectId || ""}
                          onValueChange={(value) => {
                            if (value === "" || value === undefined) setSubjectId(undefined);
                            else
                              setSubjectId(
                                typeof value === "number"
                                  ? value
                                  : parseInt(value.toString(), 10)
                              );
                          }}
                          placeholder="Select subject"
                          disabled={loadingFilters}
                          allowAll={false}
                          searchPlaceholder="Search subjects..."
                          emptyMessage="No subjects found"
                        />
                      </div>
                    ) : null}

                    {scopeMode === "subject" && exportFormat === "multi_subject" ? (
                      <div className="min-w-0 flex-1">
                        <FilterLabel required>Subjects</FilterLabel>
                        <SubjectMultiSelectFilter
                          subjects={sortedSubjects}
                          value={selectedSubjectIds}
                          onChange={setSelectedSubjectIds}
                          subjectType={subjectTypeFilter}
                          onSubjectTypeChange={setSubjectTypeFilter}
                          disabled={loadingFilters}
                          emptyLabel="Select subjects"
                          fullWidth
                        />
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-lg border bg-card p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Columns
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {exportFormat === "multi_subject"
                          ? "Identity fields · scores become dynamic headers"
                          : "Preset or customize spreadsheet fields"}
                      </p>
                    </div>
                    <div className="inline-flex h-8 rounded-md border border-border bg-muted/40 p-0.5">
                      {(
                        [
                          { value: "scores" as const, label: "Scores" },
                          { value: "grades" as const, label: "Grades" },
                          { value: "all" as const, label: "All" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setSelectedFields(presetFieldSet(option.value, exportFormat))
                          }
                          className={cn(
                            "rounded-sm px-2.5 text-xs font-medium transition-colors",
                            activePreset === option.value
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activePreset === "custom" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Custom · {selectedFields.size} fields
                    </p>
                  ) : null}

                  <Collapsible open={customFieldsOpen} onOpenChange={setCustomFieldsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="mt-1 h-7 px-0 text-xs">
                        Customize
                        {customFieldsOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {visibleFieldCategories.map((category) => {
                          const categoryLabel = category.key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase());
                          const allSelected = category.fields.every((field) =>
                            selectedFields.has(field.id)
                          );
                          const someSelected = category.fields.some((field) =>
                            selectedFields.has(field.id)
                          );
                          return (
                            <div key={category.key} className="space-y-1.5">
                              <div className="flex items-center gap-2 border-b pb-1.5">
                                <Checkbox
                                  checked={allSelected}
                                  ref={(el) => {
                                    if (el) el.indeterminate = someSelected && !allSelected;
                                  }}
                                  onCheckedChange={() => {
                                    const ids = category.fields.map((field) => field.id);
                                    setSelectedFields((prev) => {
                                      const next = new Set(prev);
                                      const selected = ids.every((id) => next.has(id));
                                      ids.forEach((id) => {
                                        if (selected) next.delete(id);
                                        else next.add(id);
                                      });
                                      return next;
                                    });
                                  }}
                                />
                                <span className="text-xs font-medium">{categoryLabel}</span>
                              </div>
                              <div className="space-y-1 pl-6">
                                {category.fields.map((field) => (
                                  <label
                                    key={field.id}
                                    className="flex cursor-pointer items-center gap-2 text-xs"
                                  >
                                    <Checkbox
                                      checked={selectedFields.has(field.id)}
                                      onCheckedChange={() => {
                                        setSelectedFields((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(field.id)) next.delete(field.id);
                                          else next.add(field.id);
                                          return next;
                                        });
                                      }}
                                    />
                                    {field.label}
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </section>

                <section className="rounded-lg border bg-card p-3 sm:p-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Preview
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {hasValidScope
                          ? exportFormat === "multi_subject"
                            ? "Sample candidates · score columns below match the export"
                            : `${Math.min(candidates.length, PREVIEW_PAGE_SIZE)} of ${total.toLocaleString()} rows`
                          : "Set scope to load a sample"}
                      </p>
                    </div>
                    {loadingElectiveCodes && scopeMode === "ELECTIVE" ? (
                      <span className="text-[11px] text-muted-foreground">Resolving electives…</span>
                    ) : null}
                  </div>

                  {exportFormat === "multi_subject" && columnShape.headers.length > 0 ? (
                    <div className="mt-2.5 overflow-x-auto rounded-md border border-dashed bg-muted/15 px-2 py-2">
                      <div className="flex min-w-max gap-1">
                        {columnShape.headers.map((header) => (
                          <span
                            key={header}
                            className="rounded-sm border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {header}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {columnShape.summary}
                        {columnShape.mode === "component" ? " · cells fill on download" : null}
                      </p>
                    </div>
                  ) : exportFormat === "multi_subject" && hasValidScope ? (
                    <p className="mt-2 text-xs text-muted-foreground">{columnShape.summary}</p>
                  ) : null}

                  <div className="mt-2.5">
                    {error ? (
                      <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    ) : null}
                    {loading ? (
                      <div className="flex h-28 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : candidates.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        {emptyPreviewMessage}
                      </div>
                    ) : previewColumns.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        Selected columns aren’t shown in preview. Export still includes them.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              {previewColumns.map((fieldId) => (
                                <TableHead key={fieldId} className="h-9 text-xs">
                                  {fieldLabel(fieldId)}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {candidates.map((candidate, idx) => (
                              <TableRow key={`${candidate.subject_registration_id}-${idx}`}>
                                {previewColumns.map((fieldId) => (
                                  <TableCell key={fieldId} className="py-2 text-sm">
                                    {previewValue(candidate, fieldId, originalCodeById)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <aside className="lg:sticky lg:top-3 lg:self-start">
                <div className="overflow-hidden rounded-lg border bg-card">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 lg:pointer-events-none"
                    onClick={() => setRecipeOpen((o) => !o)}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Recipe
                    </p>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform lg:hidden",
                        recipeOpen && "rotate-180"
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "space-y-3 border-t border-border/60 px-3 pb-3 pt-2.5",
                      !recipeOpen && "hidden lg:block"
                    )}
                  >
                    <ul className="space-y-1.5">
                      {recipeChecklist.map((item) => (
                        <li key={item.label} className="flex items-start gap-2 text-xs">
                          {item.ok ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          )}
                          <span
                            className={cn(
                              "leading-snug",
                              !item.ok && "text-amber-800 dark:text-amber-200"
                            )}
                          >
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="rounded-md bg-muted/40 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Shape
                      </p>
                      <p className="mt-1 text-xs leading-snug">{columnShape.summary}</p>
                      {columnShape.headers.length > 0 ? (
                        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {columnShape.headers.slice(0, 6).join(" · ")}
                          {columnShape.headers.length > 6
                            ? ` · +${columnShape.headers.length - 6}`
                            : ""}
                        </p>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {exportDisableReason ? (
                        <span className="text-amber-800 dark:text-amber-200">
                          {exportDisableReason}
                        </span>
                      ) : total > 0 ? (
                        <>
                          ~{total.toLocaleString()} row{total === 1 ? "" : "s"}
                          {exportFormat === "standard" ? " · sheets per subject" : ""}
                        </>
                      ) : (
                        "Waiting for matching candidates"
                      )}
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-5">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {selectedExam ? examLabel(selectedExam) : "No examination"}
                {selectedExamId
                  ? ` · ${scopeSummary} · ${exportFormat === "standard" ? "Standard" : "Multi-subject"}`
                  : ""}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {jobDock && jobDock.status?.status?.toLowerCase() !== "completed"
                  ? jobDock.status?.message || "Export running in background…"
                  : exportDisableReason
                    ? exportDisableReason
                    : total > 0
                      ? `${total.toLocaleString()} matching row${total === 1 ? "" : "s"}`
                      : "Ready when scope is complete"}
              </p>
            </div>
            {ExportButton}
          </div>
        </footer>

        {jobDock ? (
          <div className="fixed inset-x-4 bottom-16 z-40 mx-auto max-w-lg rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-md lg:bottom-20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold tracking-tight">
                  {jobDock.status?.status?.toLowerCase() === "completed"
                    ? "Export ready"
                    : jobDock.status?.status?.toLowerCase() === "failed"
                      ? "Export failed"
                      : "Generating export…"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {jobDock.error ||
                    jobDock.status?.message ||
                    "Working in the background — feel free to keep adjusting filters."}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={dismissJobDock}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {jobDock.status?.status?.toLowerCase() !== "failed" ? (
              <div className="mt-3 min-w-0 space-y-1.5">
                <Progress value={jobProgress} className="h-2" />
                <div className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-muted-foreground">
                  <span className="shrink-0 capitalize">
                    {jobDock.status?.status || "queued"}
                  </span>
                  {jobDock.status?.filename ? (
                    <>
                      <span className="shrink-0">·</span>
                      <span className="min-w-0 truncate" title={jobDock.status.filename}>
                        {jobDock.status.filename}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {jobDock.status?.status?.toLowerCase() === "completed" ? (
                <Button size="sm" onClick={() => void handleDownloadJobFile()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download file
                </Button>
              ) : null}
              {jobDock.status?.status?.toLowerCase() === "failed" ? (
                <Button size="sm" variant="secondary" onClick={() => void handleExport()}>
                  Retry
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={dismissJobDock}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
