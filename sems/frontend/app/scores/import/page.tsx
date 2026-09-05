"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  MinusCircle,
  Replace,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { examLabel } from "@/components/results/exam-label";
import { DATA_ENTRY_EXAM_STORAGE_KEY } from "@/hooks/useDataEntryExamScope";
import {
  downloadMissingScoresImportTemplate,
  downloadScoreImportJobErrors,
  downloadScoreImportTemplate,
  getAllExams,
  getAllSchools,
  getCurrentUser,
  importScores,
  listExamSubjects,
  type ExamSubject,
  type ScoreImportJobStatus,
  type ScoreImportPaper,
  type ScoreImportResponse,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import type { Exam, School } from "@/types/document";

const PAPER_OPTIONS: { value: ScoreImportPaper; short: string; label: string; hint: string }[] = [
  { value: 1, short: "P1", label: "Paper 1 · Objectives", hint: "Objectives marks" },
  { value: 2, short: "P2", label: "Paper 2 · Essay", hint: "Essay marks" },
];

const RULE_CHIPS = [
  { label: "Blank → skip", hint: "Empty score cells are ignored" },
  { label: "N/A → skip", hint: "Not registered / ignore row" },
  { label: "Filled → overwrite", hint: "Replaces existing marks for that paper" },
  { label: "CSV preferred", hint: "For 70k+ rows, CSV parses much faster than Excel" },
] as const;

const FLOW_STEPS = [
  { id: "scope", label: "Scope" },
  { id: "templates", label: "Templates" },
  { id: "upload", label: "Upload" },
] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toUpperCase() : "FILE";
}

function ImportAnimationStyles() {
  useEffect(() => {
    const id = "score-import-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes score-import-shimmer {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }
      @keyframes score-import-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.06); opacity: 0.92; }
      }
      @media (prefers-reduced-motion: reduce) {
        .motion-safe\\:animate-\\[score-import-shimmer_1\\.6s_ease-in-out_infinite\\],
        .motion-safe\\:animate-\\[score-import-pulse_2s_ease-in-out_infinite\\] {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

export default function ScoreImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [testType, setTestType] = useState<ScoreImportPaper | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState(false);
  const [downloadingMissing, setDownloadingMissing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobProgress, setJobProgress] = useState<ScoreImportJobStatus | null>(null);
  const [result, setResult] = useState<ScoreImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingErrors, setDownloadingErrors] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        const role = normalizeRole(user.role);
        if (role === "DATACLERK") {
          toast.error("Officers and above can import scores");
          router.replace("/scores/data-entry/manual");
          return;
        }
        const [examList, schoolList] = await Promise.all([getAllExams(), getAllSchools()]);
        if (cancelled) return;
        setExams(examList);
        setSchools(schoolList);
        const stored =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem(DATA_ENTRY_EXAM_STORAGE_KEY)
            : null;
        const storedId = stored ? parseInt(stored, 10) : NaN;
        if (!Number.isNaN(storedId) && examList.some((e) => e.id === storedId)) {
          setExamId(storedId);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load page");
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (examId == null) {
      setExamSubjects([]);
      setSubjectId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const subjects = await listExamSubjects(examId);
        if (cancelled) return;
        setExamSubjects(subjects);
        setSubjectId((prev) =>
          prev != null && subjects.some((s) => s.subject_id === prev) ? prev : null
        );
      } catch (err) {
        if (!cancelled) {
          setExamSubjects([]);
          toast.error(err instanceof Error ? err.message : "Failed to load subjects");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const examOptions = useMemo(
    () =>
      exams.map((exam) => ({
        value: String(exam.id),
        label: examLabel(exam),
      })),
    [exams]
  );

  const schoolOptions = useMemo(
    () => [
      { value: "", label: "All schools" },
      ...schools.map((school) => ({
        value: String(school.id),
        label: `${school.code ? `${school.code} — ` : ""}${school.name}`,
      })),
    ],
    [schools]
  );

  const subjectOptionsForPaper = useMemo(() => {
    if (testType == null) return [];
    return examSubjects
      .filter((s) => {
        const max = testType === 1 ? s.obj_max_score : s.essay_max_score;
        return max != null && max > 0;
      })
      .map((s) => ({
        value: String(s.subject_id),
        label: `${s.original_code || s.subject_code} — ${s.subject_name} (${s.subject_type})`,
      }));
  }, [examSubjects, testType]);

  const selectedExam = exams.find((e) => e.id === examId) ?? null;
  const selectedSchool = schools.find((s) => s.id === schoolId) ?? null;
  const selectedPaper = PAPER_OPTIONS.find((o) => o.value === testType) ?? null;
  const paperShortLabel = selectedPaper
    ? selectedPaper.value === 1
      ? "Paper 1 (Objectives)"
      : "Paper 2 (Essay)"
    : null;

  const scopeReady = examId != null && testType != null;
  const canImport = scopeReady && file != null && !uploading;
  const missingTemplateReady = examId != null && testType != null && subjectId != null;
  const missingHelper =
    examId == null
      ? "Select an examination in Scope first."
      : testType == null
        ? "Select a paper in Scope first."
        : subjectId == null
          ? "Select a subject to download candidates missing this paper."
          : schoolId != null
            ? "School filter will limit which candidates are included."
            : null;

  const progressPct =
    jobProgress && jobProgress.total_rows > 0
      ? Math.min(100, Math.round((jobProgress.processed_rows / jobProgress.total_rows) * 100))
      : 0;

  const validateAndSetFile = (selectedFile: File) => {
    const validExtensions = [".xlsx", ".csv"];
    const ext = selectedFile.name
      .toLowerCase()
      .substring(selectedFile.name.lastIndexOf("."));
    if (!validExtensions.includes(ext)) {
      setError(
        "Invalid file type. Please select Excel (.xlsx) or CSV (.csv). Legacy .xls is not supported."
      );
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportAnother = () => {
    clearFile();
    setResult(null);
    setError(null);
    setJobProgress(null);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploading || !scopeReady) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (uploading || !scopeReady) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleDownloadFormatTemplate = async () => {
    if (testType == null) {
      toast.error("Select a paper first");
      return;
    }
    setDownloadingFormat(true);
    try {
      await downloadScoreImportTemplate({
        test_type: testType,
        exam_id: examId ?? undefined,
      });
      toast.success(`Format template downloaded (${paperShortLabel})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download template");
    } finally {
      setDownloadingFormat(false);
    }
  };

  const handleDownloadMissingTemplate = async () => {
    if (examId == null) {
      toast.error("Select an examination");
      return;
    }
    if (testType == null) {
      toast.error("Select a paper first");
      return;
    }
    if (subjectId == null) {
      toast.error("Select a subject for the missing-scores template");
      return;
    }
    setDownloadingMissing(true);
    try {
      await downloadMissingScoresImportTemplate({
        exam_id: examId,
        test_type: testType,
        subject_id: subjectId,
        school_id: schoolId ?? undefined,
      });
      toast.success(`Missing-scores template downloaded (${paperShortLabel})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download template");
    } finally {
      setDownloadingMissing(false);
    }
  };

  const handleUpload = async (opts?: { dryRun?: boolean }) => {
    const useDryRun = opts?.dryRun === true;
    if (examId == null) {
      setError("Select an examination first");
      return;
    }
    if (testType == null) {
      setError("Select a paper first — import writes only that paper’s scores");
      return;
    }
    if (!file) {
      setError("Please select a file to upload");
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    setJobProgress(null);
    try {
      const response = await importScores(
        {
          exam_id: examId,
          test_type: testType,
          file,
          school_id: schoolId ?? undefined,
          dry_run: useDryRun,
        },
        (status) => setJobProgress(status)
      );
      setResult(response);
      setJobProgress(null);
      if (response.dry_run) {
        toast.success(
          `Dry run: ${response.updated} would update, ${response.failed} failed, ${response.skipped} skipped`
        );
      } else if (response.failed === 0) {
        toast.success(`Updated ${response.updated} ${paperShortLabel} score(s)`);
      } else {
        toast.warning(
          `Updated ${response.updated} ${paperShortLabel}; ${response.failed} row(s) failed`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (result?.job_id == null) {
      toast.error("No error report available");
      return;
    }
    setDownloadingErrors(true);
    try {
      await downloadScoreImportJobErrors(result.job_id);
      toast.success("Error report downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download errors");
    } finally {
      setDownloadingErrors(false);
    }
  };

  if (loadingAuth) {
    return (
      <DashboardLayout>
        <TopBar title="Import Scores" />
        <div className="flex items-center justify-center p-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ImportAnimationStyles />
      <div className="flex h-full min-h-0 flex-col">
        <TopBar title="Import Scores" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 pb-16">
        {/* Header */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Import CORE and ELECTIVE scores for one paper at a time — the file has no paper
            column, so choose carefully before uploading.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RULE_CHIPS.map((chip) => (
              <span
                key={chip.label}
                title={chip.hint}
                className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {chip.label}
              </span>
            ))}
          </div>

          {/* Step strip */}
          <ol className="flex flex-wrap items-center gap-2 pt-1" aria-label="Import steps">
            {FLOW_STEPS.map((step, index) => {
              const isComplete =
                step.id === "scope"
                  ? scopeReady
                  : step.id === "upload"
                    ? Boolean(result)
                    : false;
              const isActive =
                step.id === "scope"
                  ? !scopeReady
                  : step.id === "upload"
                    ? scopeReady && !result
                    : scopeReady && !result;
              return (
                <li key={step.id} className="flex items-center gap-2">
                  {index > 0 && (
                    <span className="hidden h-px w-4 bg-border sm:block" aria-hidden />
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      isComplete &&
                        "bg-emerald-600/10 text-emerald-800 dark:text-emerald-400",
                      isActive && !isComplete && "bg-foreground text-background",
                      !isActive &&
                        !isComplete &&
                        "bg-muted/60 text-muted-foreground"
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <span className="tabular-nums">{index + 1}</span>
                    )}
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Step 1 — Scope */}
        <section aria-labelledby="import-scope-heading">
          <h2 id="import-scope-heading" className="sr-only">
            Scope
          </h2>
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Scope
              </p>
              {scopeReady && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-600/10 text-emerald-800 dark:text-emerald-400"
                >
                  Ready
                </Badge>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Examination</label>
                <SearchableSelect
                  options={examOptions}
                  value={examId != null ? String(examId) : ""}
                  onValueChange={(value) => {
                    const id = value ? parseInt(value, 10) : NaN;
                    setExamId(Number.isNaN(id) ? null : id);
                    setSubjectId(null);
                    setResult(null);
                    if (!Number.isNaN(id) && typeof window !== "undefined") {
                      window.sessionStorage.setItem(DATA_ENTRY_EXAM_STORAGE_KEY, String(id));
                    }
                  }}
                  placeholder="Select examination"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">
                  Paper <span className="text-destructive">*</span>
                </label>
                <div
                  role="radiogroup"
                  aria-label="Paper"
                  aria-required="true"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {PAPER_OPTIONS.map((opt) => {
                    const selected = testType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setTestType(opt.value);
                          setSubjectId(null);
                          setResult(null);
                          setError(null);
                        }}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/5 shadow-[inset_0_0_0_1px] shadow-primary/20"
                            : testType == null
                              ? "border-amber-300/80 bg-background hover:border-amber-400"
                              : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {opt.short}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{opt.label}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.hint} only — the other paper is untouched
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {testType == null
                    ? "Required — choose which paper this import will update."
                    : `Import will overwrite ${paperShortLabel} only.`}
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">School</label>
                <SearchableSelect
                  options={schoolOptions}
                  value={schoolId != null ? String(schoolId) : ""}
                  onValueChange={(value) => {
                    const id = value ? parseInt(value, 10) : NaN;
                    setSchoolId(Number.isNaN(id) ? null : id);
                    setResult(null);
                  }}
                  placeholder="All schools"
                />
                <p className="text-[11px] text-muted-foreground">
                  Optional — limits missing template and upload matching.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2 — Templates (secondary, compact) */}
        <section
          aria-labelledby="import-templates-heading"
          className={cn(
            "transition-opacity duration-300",
            !scopeReady && "pointer-events-none opacity-45"
          )}
        >
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2
                id="import-templates-heading"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Templates
              </h2>
              {!scopeReady && (
                <p className="text-[11px] text-muted-foreground">Finish Scope first</p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleDownloadFormatTemplate}
                disabled={testType == null || downloadingFormat}
              >
                {downloadingFormat ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                )}
                Format example
              </Button>
              <div className="hidden h-4 w-px bg-border sm:block" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <SearchableSelect
                  options={subjectOptionsForPaper}
                  value={subjectId != null ? String(subjectId) : ""}
                  onValueChange={(value) => {
                    const id = value ? parseInt(value, 10) : NaN;
                    setSubjectId(Number.isNaN(id) ? null : id);
                  }}
                  placeholder={
                    examId == null
                      ? "Exam first"
                      : testType == null
                        ? "Paper first"
                        : "Subject for missing scores"
                  }
                  disabled={examId == null || testType == null}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={handleDownloadMissingTemplate}
                  disabled={!missingTemplateReady || downloadingMissing}
                >
                  {downloadingMissing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Missing scores
                </Button>
              </div>
            </div>
            {missingHelper && scopeReady && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">{missingHelper}</p>
            )}
          </div>
        </section>

        {/* Step 3 — Hero upload */}
        <section
          aria-labelledby="import-upload-heading"
          className={cn(
            "transition-opacity duration-300",
            !scopeReady && "pointer-events-none opacity-45"
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2
              id="import-upload-heading"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Upload
            </h2>
            {!scopeReady && (
              <p className="text-[11px] text-muted-foreground">Finish Scope first</p>
            )}
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            {scopeReady && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="font-normal">
                  {selectedExam ? examLabel(selectedExam) : "Examination"}
                </Badge>
                <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                  {selectedPaper?.short} · {selectedPaper?.value === 1 ? "Objectives" : "Essay"}
                </Badge>
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  {selectedSchool
                    ? `${selectedSchool.code ? `${selectedSchool.code} — ` : ""}${selectedSchool.name}`
                    : "All schools"}
                </Badge>
              </div>
            )}

            {!file ? (
              <div
                role="button"
                tabIndex={scopeReady && !uploading ? 0 : -1}
                aria-disabled={!scopeReady || uploading}
                aria-label="Select Excel or CSV file to import"
                onClick={() => {
                  if (!scopeReady || uploading) return;
                  fileInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if (!scopeReady || uploading) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "group relative flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center outline-none transition-all duration-300",
                  scopeReady && !uploading && "cursor-pointer",
                  isDragging
                    ? "scale-[1.01] border-primary bg-primary/5 shadow-[inset_0_0_0_1px] shadow-primary/25"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                    isDragging
                      ? "bg-primary text-primary-foreground motion-safe:animate-[score-import-pulse_2s_ease-in-out_infinite]"
                      : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                  )}
                >
                  <Upload className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {isDragging
                    ? `Drop to import ${selectedPaper?.short ?? "scores"}`
                    : "Drop Excel or CSV here"}
                </p>
                <p className="text-xs text-muted-foreground">
                  or{" "}
                  <span className="font-medium text-primary underline-offset-2 group-hover:underline">
                    browse
                  </span>
                  {" · "}
                  .xlsx · .csv (CSV preferred for large files)
                </p>
              </div>
            ) : (
              <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 space-y-3 duration-300">
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center",
                    uploading && "opacity-80"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{file.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {fileExtension(file.name)}
                        </Badge>
                        <span>{formatFileSize(file.size)}</span>
                        {paperShortLabel && <span>· ready for {selectedPaper?.short}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Replace className="mr-1.5 h-3.5 w-3.5" />
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploading}
                      onClick={clearFile}
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {testType != null && !uploading && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <span>
                      Import will overwrite{" "}
                      <span className="font-semibold">{paperShortLabel}</span> for matching
                      rows. The other paper is not changed.
                    </span>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              id="score-import-file"
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={!scopeReady || uploading}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) validateAndSetFile(selected);
                e.target.value = "";
              }}
            />

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {(uploading || jobProgress) && (
              <div className="motion-safe:animate-in motion-safe:fade-in-0 space-y-3 overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.03] p-4 duration-300">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {jobProgress
                      ? "Large file — importing in background…"
                      : "Importing scores…"}
                  </span>
                  {jobProgress && (
                    <span className="tabular-nums text-muted-foreground">
                      {progressPct}% · {jobProgress.processed_rows.toLocaleString()} /{" "}
                      {Math.max(jobProgress.total_rows, 1).toLocaleString()} rows
                    </span>
                  )}
                  {!jobProgress && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-primary/80 transition-[width] duration-300",
                      !jobProgress &&
                        "w-1/3 motion-safe:animate-[score-import-pulse_2s_ease-in-out_infinite]"
                    )}
                    style={jobProgress ? { width: `${Math.max(progressPct, 4)}%` } : undefined}
                  />
                  <div
                    className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-[score-import-shimmer_1.6s_ease-in-out_infinite]"
                    aria-hidden
                  />
                </div>
                {jobProgress && (
                  <p className="text-[11px] text-muted-foreground">
                    Updated {jobProgress.updated.toLocaleString()} · Skipped{" "}
                    {jobProgress.skipped.toLocaleString()} · Failed{" "}
                    {jobProgress.failed.toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {!scopeReady
                  ? "Select examination and paper to enable import."
                  : !file
                    ? "Drop or browse a file to continue."
                    : uploading
                      ? "Please wait…"
                      : `Validate first for large files, then import ${selectedPaper?.short} only.`}
              </p>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => void handleUpload({ dryRun: true })}
                  disabled={!canImport}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Validate
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto sm:min-w-[11rem]"
                  onClick={() => void handleUpload({ dryRun: false })}
                  disabled={!canImport}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {paperShortLabel
                        ? `Import ${selectedPaper?.short} scores`
                        : "Import scores"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Results */}
        {result && (
          <section
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 space-y-4 duration-500"
            aria-labelledby="import-results-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    result.failed === 0
                      ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-800 dark:text-amber-400"
                  )}
                >
                  {result.failed === 0 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <h2
                    id="import-results-heading"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Results
                    {paperShortLabel ? ` · ${selectedPaper?.short}` : ""}
                  </h2>
                  <p className="text-sm text-foreground">
                    Updated {result.updated.toLocaleString()} · Skipped{" "}
                    {result.skipped.toLocaleString()} · Failed{" "}
                    {result.failed.toLocaleString()}
                    {result.total_rows != null
                      ? ` · ${result.total_rows.toLocaleString()} rows`
                      : ""}
                  </p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleImportAnother}>
                Import another file
              </Button>
            </div>

            <div
              className={cn(
                "grid gap-3 rounded-xl border p-1 sm:grid-cols-3",
                result.failed === 0
                  ? "border-emerald-600/25 bg-gradient-to-br from-emerald-600/[0.06] to-transparent"
                  : "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] to-transparent"
              )}
            >
              <div className="rounded-lg bg-card/80 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Updated
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {result.updated.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-card/80 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <MinusCircle className="h-3.5 w-3.5" />
                  Skipped
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {result.skipped.toLocaleString()}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Blank / N/A</p>
              </div>
              <div className="rounded-lg bg-card/80 p-4">
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs font-medium uppercase tracking-wide",
                    result.failed > 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Failed
                </div>
                <div
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums",
                    result.failed > 0 && "text-destructive"
                  )}
                >
                  {result.failed.toLocaleString()}
                </div>
              </div>
            </div>
            {result.errors.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-600/5 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {result.dry_run
                  ? "Dry run complete — all rows would apply with no errors."
                  : "All rows applied — no errors."}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {result.errors_truncated ? (
                    <p className="text-xs text-muted-foreground">
                      Showing the first errors only; download the full report for all failures.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {result.dry_run ? "Dry run errors (nothing written)." : "Row errors"}
                    </p>
                  )}
                  {(result.errors_file_available || result.job_id != null) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={downloadingErrors || result.job_id == null}
                      onClick={() => void handleDownloadErrors()}
                    >
                      {downloadingErrors ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-3.5 w-3.5" />
                      )}
                      Download errors CSV
                    </Button>
                  )}
                </div>
                <div className="max-h-80 overflow-auto rounded-xl border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Index</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((err, i) => (
                        <TableRow key={`${err.row}-${i}`}>
                          <TableCell className="tabular-nums">{err.row}</TableCell>
                          <TableCell>{err.index_number || "—"}</TableCell>
                          <TableCell>{err.subject_code || "—"}</TableCell>
                          <TableCell className="text-destructive">{err.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </section>
        )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
