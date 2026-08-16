"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  getCandidatesForManualEntry,
  getAllExams,
  listProgrammes,
  listSubjects,
  listSchools,
  listSchoolProgrammes,
  exportCandidateResults,
  startResultsExportJob,
  getResultsExportJob,
  downloadResultsExportJobFile,
} from "@/lib/api";
import { DATA_ENTRY_EXAM_STORAGE_KEY } from "@/hooks/useDataEntryExamScope";
import { examLabel } from "@/components/results/exam-label";
import { cn } from "@/lib/utils";
import type {
  Exam,
  Programme,
  Subject,
  School,
  ManualEntryFilters,
  CandidateScoreEntry,
  ExportFormat,
  TestType,
} from "@/types/document";
import { Loader2, Download, ChevronDown, ChevronUp, LayoutList, Table2 } from "lucide-react";
import { toast } from "sonner";

const PREVIEW_PAGE_SIZE = 20;
const PREVIEW_DEBOUNCE_MS = 300;

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

function allowedFieldIds(format: ExportFormat): string[] {
  if (format === "multi_subject") {
    return ALL_FIELD_IDS.filter((id) => MULTI_SUBJECT_ALLOWED.has(id));
  }
  return [...ALL_FIELD_IDS];
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

export default function ExportResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restoredExamRef = useRef(false);

  const [candidates, setCandidates] = useState<CandidateScoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null);
  const [exportElapsedSec, setExportElapsedSec] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<number | undefined>();
  const [programmeId, setProgrammeId] = useState<number | undefined>();
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const [scopeMode, setScopeMode] = useState<ScopeMode | null>(null);

  const [exportFormat, setExportFormat] = useState<ExportFormat>("standard");
  const [testType, setTestType] = useState<TestType>("obj");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<number>>(new Set());

  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    () => presetFieldSet("scores", "standard")
  );
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);

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
      } catch (err) {
        console.error("Error loading programmes:", err);
      } finally {
        setLoadingProgrammes(false);
      }
    }
    void loadProgrammes();
  }, [schoolId, scopeMode]);

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

  const hasValidScope = useMemo(() => {
    if (scopeMode === "CORE") return true;
    if (scopeMode === "ELECTIVE") return programmeId != null;
    if (scopeMode === "subject") {
      return exportFormat === "standard" ? subjectId != null : selectedSubjectIds.size > 0;
    }
    return false;
  }, [scopeMode, programmeId, subjectId, selectedSubjectIds, exportFormat]);

  const exportDisableReason = useMemo(() => {
    if (!selectedExamId) return "Select an examination";
    if (selectedFields.size === 0) return "Select at least one column";
    if (!scopeMode) {
      return exportFormat === "multi_subject"
        ? "Select Core, Elective, or specific subjects"
        : "Select Core, Elective, or one subject";
    }
    if (scopeMode === "ELECTIVE" && !programmeId) {
      return "Select a programme for elective subjects";
    }
    if (scopeMode === "subject" && exportFormat === "standard" && !subjectId) {
      return "Select a subject";
    }
    if (scopeMode === "subject" && exportFormat === "multi_subject" && selectedSubjectIds.size === 0) {
      return "Select at least one subject";
    }
    return null;
  }, [
    selectedExamId,
    selectedFields.size,
    scopeMode,
    exportFormat,
    programmeId,
    subjectId,
    selectedSubjectIds,
  ]);

  const scopeSummary = useMemo(() => {
    if (scopeMode === "CORE") return "Core subjects";
    if (scopeMode === "ELECTIVE") {
      const programme = programmes.find((item) => item.id === programmeId);
      return programme ? `Elective · ${programme.name}` : "Elective";
    }
    if (scopeMode === "subject") {
      if (exportFormat === "multi_subject") {
        return `${selectedSubjectIds.size} subject${selectedSubjectIds.size === 1 ? "" : "s"}`;
      }
      const subject = allSubjects.find((item) => item.id === subjectId);
      return subject ? `${subjectDisplayCode(subject)} — ${subject.name}` : "One subject";
    }
    return "No scope";
  }, [scopeMode, programmeId, programmes, exportFormat, selectedSubjectIds, allSubjects, subjectId]);

  const activePreset = useMemo<FieldPreset>(() => {
    if (setsEqual(selectedFields, presetFieldSet("scores", exportFormat))) return "scores";
    if (setsEqual(selectedFields, presetFieldSet("grades", exportFormat))) return "grades";
    if (setsEqual(selectedFields, presetFieldSet("all", exportFormat))) return "all";
    return "custom";
  }, [selectedFields, exportFormat]);

  const previewColumns = useMemo(
    () => Array.from(selectedFields).filter((fieldId) => PREVIEWABLE_FIELDS.has(fieldId)),
    [selectedFields]
  );

  const buildFilters = useCallback(
    (forPreview = false): ManualEntryFilters => {
      const firstSelectedSubject =
        selectedSubjectIds.size > 0 ? Array.from(selectedSubjectIds)[0] : undefined;
      return {
        exam_id: selectedExamId ?? undefined,
        school_id: schoolId,
        programme_id: scopeMode === "ELECTIVE" ? programmeId : undefined,
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
      programmeId,
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
    setSelectedFields(presetFieldSet(activePreset === "custom" ? "scores" : activePreset, format));
    if (format === "standard") {
      setSelectedSubjectIds(new Set());
      setTestType("obj");
    } else {
      setSubjectId(undefined);
    }
  };

  const handleScopeChange = (mode: ScopeMode) => {
    setScopeMode(mode);
    if (mode !== "ELECTIVE") setProgrammeId(undefined);
    if (mode !== "subject") {
      setSubjectId(undefined);
      setSelectedSubjectIds(new Set());
    }
  };

  const handleSchoolChange = (value: string | number | "all" | "") => {
    if (value === "" || value === "all" || value === undefined) {
      setSchoolId(undefined);
    } else {
      setSchoolId(typeof value === "number" ? value : parseInt(value.toString(), 10));
    }
    setProgrammeId(undefined);
  };

  const handleClearScope = () => {
    setSchoolId(undefined);
    setProgrammeId(undefined);
    setSubjectId(undefined);
    setScopeMode(null);
    setSelectedSubjectIds(new Set());
    setExportFormat("standard");
    setTestType("obj");
    setSelectedFields(presetFieldSet("scores", "standard"));
    setCustomFieldsOpen(false);
  };

  useEffect(() => {
    if (!exporting || exportStartedAt == null) {
      setExportElapsedSec(0);
      return;
    }
    const tick = () => setExportElapsedSec(Math.floor((Date.now() - exportStartedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [exporting, exportStartedAt]);

  const handleExport = async () => {
    if (exporting) return;
    if (exportDisableReason) {
      toast.error(exportDisableReason);
      return;
    }

    const fieldsToExport = Array.from(selectedFields);
    const subjectIdsArray =
      exportFormat === "multi_subject" && selectedSubjectIds.size > 0
        ? Array.from(selectedSubjectIds)
        : undefined;
    const exportSubjectType: "CORE" | "ELECTIVE" | undefined =
      scopeMode === "CORE" || scopeMode === "ELECTIVE" ? scopeMode : undefined;
    const filters = buildFilters(false);
    const useJob =
      total > 5000 ||
      (!schoolId &&
        !subjectId &&
        (scopeMode === "CORE" || scopeMode === "ELECTIVE" || exportFormat === "multi_subject"));

    setExporting(true);
    setExportStartedAt(Date.now());
    setExportMessage(useJob ? "Preparing file…" : "Downloading…");
    try {
      if (useJob) {
        const job = await startResultsExportJob(
          filters,
          fieldsToExport,
          exportSubjectType,
          exportFormat,
          exportFormat === "multi_subject" ? testType : undefined,
          subjectIdsArray
        );
        let status = job.status.toLowerCase();
        while (status === "pending" || status === "in_progress") {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          const snapshot = await getResultsExportJob(job.job_id);
          status = snapshot.status.toLowerCase();
          if (snapshot.message) setExportMessage(snapshot.message);
          if (status === "failed") {
            throw new Error(snapshot.error_message || "Export failed");
          }
        }
        if (status !== "completed") {
          throw new Error("Export did not complete");
        }
        const filename = await downloadResultsExportJobFile(job.job_id);
        toast.success(`Downloaded ${filename}`);
      } else {
        const filename = await exportCandidateResults(
          filters,
          fieldsToExport,
          exportSubjectType,
          exportFormat,
          exportFormat === "multi_subject" ? testType : undefined,
          subjectIdsArray
        );
        toast.success(`Downloaded ${filename}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export results");
    } finally {
      setExporting(false);
      setExportStartedAt(null);
      setExportMessage(null);
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

  return (
    <DashboardLayout title="Export Results">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Export Results</h1>
                <p className="mt-1 text-muted-foreground">
                  Download candidate scores for one examination.
                </p>
              </div>
              <div className="max-w-md">
                <Label className="mb-1.5 text-xs text-muted-foreground">
                  Examination <span className="text-destructive">*</span>
                </Label>
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
            {selectedExamId ? (
              <Button variant="ghost" size="sm" onClick={handleClearScope}>
                Reset options
              </Button>
            ) : null}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedExamId ? (
            <div className="mx-auto max-w-lg rounded-xl border border-dashed p-12 text-center">
              <p className="font-medium">Select an examination to export</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Format, columns, and preview appear after you choose an examination.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
              <Card className="gap-4 py-4">
                <CardHeader className="px-6">
                  <CardTitle>Format</CardTitle>
                  <CardDescription>How rows are arranged in the spreadsheet.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleFormatChange("standard")}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      exportFormat === "standard"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <LayoutList className="h-4 w-4" />
                      Standard
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      One row per candidate-subject combination.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatChange("multi_subject")}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      exportFormat === "multi_subject"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Table2 className="h-4 w-4" />
                      Multi-subject
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      One row per candidate, subject codes as columns.
                    </p>
                  </button>
                </CardContent>
              </Card>

              <Card className="gap-4 py-4">
                <CardHeader className="px-6">
                  <CardTitle>Scope</CardTitle>
                  <CardDescription>
                    {exportFormat === "multi_subject"
                      ? "Choose Core, Elective, or specific subjects."
                      : "Choose Core, Elective, or one subject."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                    {(
                      [
                        { value: "CORE", label: "Core" },
                        { value: "ELECTIVE", label: "Elective" },
                        {
                          value: "subject",
                          label: exportFormat === "multi_subject" ? "Subjects" : "One subject",
                        },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleScopeChange(option.value)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          scopeMode === option.value
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {!scopeMode ? (
                    <p className="text-sm text-muted-foreground">
                      {exportFormat === "multi_subject"
                        ? "Select Core, Elective, or specific subjects."
                        : "Select Core, Elective, or one subject."}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 text-xs text-muted-foreground">School (optional)</Label>
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

                    {scopeMode === "ELECTIVE" ? (
                      <div>
                        <Label className="mb-1.5 text-xs text-muted-foreground">
                          Programme <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={programmeId?.toString()}
                          onValueChange={(value) =>
                            setProgrammeId(value ? parseInt(value, 10) : undefined)
                          }
                          disabled={loadingFilters || loadingProgrammes}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                loadingProgrammes ? "Loading programmes..." : "Select programme"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {programmes.map((programme) => (
                              <SelectItem key={programme.id} value={programme.id.toString()}>
                                {programme.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!programmeId ? (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            A programme is required for elective subjects.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {exportFormat === "multi_subject" ? (
                      <div>
                        <Label className="mb-1.5 text-xs text-muted-foreground">
                          Test type <span className="text-destructive">*</span>
                        </Label>
                        <Select value={testType} onValueChange={(value) => setTestType(value as TestType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="obj">Objectives (OBJ)</SelectItem>
                            <SelectItem value="essay">Essay</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  {scopeMode === "subject" && exportFormat === "standard" ? (
                    <div className="max-w-md">
                      <Label className="mb-1.5 text-xs text-muted-foreground">
                        Subject <span className="text-destructive">*</span>
                      </Label>
                      <SearchableSelect
                        options={sortedSubjects.map((subject) => ({
                          value: subject.id,
                          label: `${subjectDisplayCode(subject)} - ${subject.name}`,
                        }))}
                        value={subjectId || ""}
                        onValueChange={(value) => {
                          if (value === "" || value === undefined) setSubjectId(undefined);
                          else setSubjectId(typeof value === "number" ? value : parseInt(value.toString(), 10));
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
                    <div className="max-h-60 overflow-y-auto rounded-md border p-3">
                      {sortedSubjects.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No subjects found</p>
                      ) : (
                        <div className="space-y-2">
                          {sortedSubjects.map((subject) => (
                            <label key={subject.id} className="flex cursor-pointer items-center gap-2 text-sm">
                              <Checkbox
                                checked={selectedSubjectIds.has(subject.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedSubjectIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(subject.id);
                                    else next.delete(subject.id);
                                    return next;
                                  });
                                }}
                              />
                              {subjectDisplayCode(subject)} — {subject.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="gap-4 py-4">
                <CardHeader className="px-6">
                  <CardTitle>Columns</CardTitle>
                  <CardDescription>
                    {exportFormat === "multi_subject"
                      ? "Candidate information only. Subject scores become column headers."
                      : "Choose a preset, or customize the spreadsheet columns."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                    {(
                      [
                        { value: "scores", label: "Scores" },
                        { value: "grades", label: "Grades" },
                        { value: "all", label: "All" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedFields(presetFieldSet(option.value, exportFormat))}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          activePreset === option.value
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {activePreset === "custom" ? (
                    <p className="text-xs text-muted-foreground">Custom column set ({selectedFields.size})</p>
                  ) : null}

                  <Collapsible open={customFieldsOpen} onOpenChange={setCustomFieldsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="px-0">
                        Customize columns
                        {customFieldsOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-3">
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
                            <div key={category.key} className="space-y-2">
                              <div className="flex items-center gap-2 border-b pb-2">
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
                                <span className="text-sm font-medium">{categoryLabel}</span>
                              </div>
                              <div className="space-y-1 pl-6">
                                {category.fields.map((field) => (
                                  <label
                                    key={field.id}
                                    className="flex cursor-pointer items-center gap-2 text-sm"
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
                </CardContent>
              </Card>

              <Card className="gap-4 py-4">
                <CardHeader className="px-6">
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    {hasValidScope
                      ? exportFormat === "multi_subject" && scopeMode === "subject" && selectedSubjectIds.size > 1
                        ? `Sample of the first selected subject (${Math.min(candidates.length, PREVIEW_PAGE_SIZE)} of ${total} rows). Export includes all selected subjects.`
                        : `Sample of ${Math.min(candidates.length, PREVIEW_PAGE_SIZE)} of ${total} matching rows.`
                      : "A short sample appears once the examination and scope are set."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {error ? (
                    <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
                      {error}
                    </div>
                  ) : null}
                  {loading ? (
                    <div className="flex h-32 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : candidates.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      {emptyPreviewMessage}
                    </div>
                  ) : previewColumns.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Selected columns are not available in preview. Export still includes them.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {previewColumns.map((fieldId) => (
                              <TableHead key={fieldId}>{fieldLabel(fieldId)}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {candidates.map((candidate, idx) => (
                            <TableRow key={`${candidate.subject_registration_id}-${idx}`}>
                              {previewColumns.map((fieldId) => (
                                <TableCell key={fieldId}>{previewValue(candidate, fieldId, originalCodeById)}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-border bg-background px-6 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {selectedExam ? examLabel(selectedExam) : "No examination selected"}
                {selectedExamId ? ` · ${scopeSummary} · ${exportFormat === "standard" ? "Standard" : "Multi-subject"}` : ""}
              </p>
              <p className="text-muted-foreground">
                {exporting
                  ? `${exportMessage || "Exporting…"} · ${exportElapsedSec}s`
                  : exportDisableReason
                    ? exportDisableReason
                    : total > 0
                      ? `${total} candidate row${total === 1 ? "" : "s"} ready to export`
                      : "Ready to export"}
              </p>
            </div>
            <Button onClick={handleExport} disabled={exporting || !!exportDisableReason}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {exportMessage || "Exporting..."}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export to Excel
                </>
              )}
            </Button>
          </div>
        </footer>
      </div>
    </DashboardLayout>
  );
}
