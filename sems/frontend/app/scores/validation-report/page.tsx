"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MinusCircle,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import {
  SubjectMultiSelectFilter,
  type SubjectTypeFilterValue,
} from "@/components/SubjectMultiSelectFilter";
import {
  SchoolMultiSelectFilter,
  type SchoolRegionFilterValue,
} from "@/components/SchoolMultiSelectFilter";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { examLabel } from "@/components/results/exam-label";
import { DATA_ENTRY_EXAM_STORAGE_KEY } from "@/hooks/useDataEntryExamScope";
import {
  isValidationReportCancelled,
  useValidationReportJob,
  validationReportJobProgress,
  validationReportJobStageLabel,
  type ValidationReportFormat,
} from "@/hooks/useValidationReportJob";
import {
  downloadScoreValidationReport,
  getAllExams,
  getAllSchools,
  getAllSubjects,
  getCurrentUser,
  ScoreValidationReportHttpError,
  type ScoreValidationReportFilters,
  type ScoreValidationReportStatus,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import type { Exam, School, Subject } from "@/types/document";

const PAPER_CHIPS: { id: number; short: string; label: string }[] = [
  { id: 1, short: "P1", label: "Objectives" },
  { id: 2, short: "P2", label: "Essay" },
  { id: 3, short: "P3", label: "Practical" },
];

const STATUS_OPTIONS: {
  id: ScoreValidationReportStatus;
  label: string;
  hint: string;
  icon: typeof MinusCircle;
  accent: string;
  selected: string;
}[] = [
  {
    id: "missing",
    label: "Missing",
    hint: "Write-in score worksheet",
    icon: MinusCircle,
    accent: "text-amber-700",
    selected:
      "border-amber-400/80 bg-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.35)] scale-[1.02]",
  },
  {
    id: "invalid",
    label: "Invalid",
    hint: "Out of range or wrong value",
    icon: XCircle,
    accent: "text-red-700",
    selected:
      "border-red-400/80 bg-red-50 shadow-[0_0_0_1px_rgba(248,113,113,0.35)] scale-[1.02]",
  },
];

function ScoreValidationReportPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [examId, setExamId] = useState<number | undefined>();
  const [schoolIds, setSchoolIds] = useState<number[]>([]);
  const [regionFilter, setRegionFilter] = useState<SchoolRegionFilterValue>("ALL");
  const [packaging, setPackaging] = useState<"zip" | "merged">("zip");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilterValue>("ALL");
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [testTypes, setTestTypes] = useState<number[]>([]);
  const [combineP1P2, setCombineP1P2] = useState(false);
  const [selectedStatus, setSelectedStatus] =
    useState<ScoreValidationReportStatus>("missing");
  const [reportFormat, setReportFormat] = useState<ValidationReportFormat>("xlsx");

  const {
    jobDock,
    starting,
    setStarting,
    cancelling,
    startJob,
    cancelJob,
    dismiss,
    downloadReadyFile,
  } = useValidationReportJob({ enabled: !loadingAuth });

  const hasExam = examId != null;
  const isMultiSchool = schoolIds.length !== 1;
  const effectiveStatus = combineP1P2 ? "missing" : selectedStatus;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        const role = normalizeRole(user.role);
        if (role === "DATACLERK") {
          toast.error("Officers and above can generate validation reports");
          router.replace("/scores/issues");
          return;
        }
        const [examList, schoolList, subjectList] = await Promise.all([
          getAllExams(),
          getAllSchools(),
          getAllSubjects(),
        ]);
        if (cancelled) return;
        setExams(examList);
        setSchools(schoolList);
        setSubjects(subjectList);
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

  const examOptions = useMemo(
    () =>
      exams.map((exam) => ({
        value: exam.id,
        label: examLabel(exam),
      })),
    [exams]
  );

  const selectedExam = useMemo(
    () => exams.find((exam) => exam.id === examId) ?? null,
    [exams, examId]
  );

  const papersLabel = useMemo(() => {
    if (combineP1P2) return "P1/P2 combined";
    if (testTypes.length === 0) return "All papers";
    return testTypes
      .slice()
      .sort((a, b) => a - b)
      .map((id) => PAPER_CHIPS.find((p) => p.id === id)?.short ?? `P${id}`)
      .join(", ");
  }, [combineP1P2, testTypes]);

  const schoolsLabel = useMemo(() => {
    if (schoolIds.length === 0) return "All schools";
    if (schoolIds.length === 1) {
      const school = schools.find((item) => item.id === schoolIds[0]);
      return school ? school.code : "1 school";
    }
    return `${schoolIds.length} schools`;
  }, [schoolIds, schools]);

  const subjectsLabel = useMemo(() => {
    if (subjectIds.length === 0) {
      if (subjectTypeFilter === "CORE") return "All core";
      if (subjectTypeFilter === "ELECTIVE") return "All elective";
      return "All subjects";
    }
    if (subjectIds.length === 1) {
      const subject = subjects.find((item) => item.id === subjectIds[0]);
      return subject ? subject.code : "1 subject";
    }
    return `${subjectIds.length} subjects`;
  }, [subjectIds, subjectTypeFilter, subjects]);

  const statusMeta = STATUS_OPTIONS.find((s) => s.id === effectiveStatus)!;

  const recipeChips = useMemo(() => {
    const chips: string[] = [];
    chips.push(selectedExam ? examLabel(selectedExam) : "No examination");
    chips.push(schoolsLabel);
    if (isMultiSchool && packaging === "merged") chips.push("Merged file");
    else if (isMultiSchool) chips.push("Zip per school");
    chips.push(subjectsLabel);
    chips.push(papersLabel);
    chips.push(statusMeta.label);
    chips.push(reportFormat === "pdf" ? "PDF" : "Excel");
    return chips;
  }, [
    selectedExam,
    schoolsLabel,
    isMultiSchool,
    packaging,
    subjectsLabel,
    papersLabel,
    statusMeta.label,
    reportFormat,
  ]);

  const buildFilters = useCallback((): ScoreValidationReportFilters | null => {
    if (!examId) return null;
    return {
      exam_id: examId,
      school_ids: schoolIds.length ? schoolIds : undefined,
      subject_type: subjectTypeFilter === "ALL" ? undefined : subjectTypeFilter,
      subject_ids: subjectIds.length ? subjectIds : undefined,
      test_types: combineP1P2
        ? [1, 2]
        : testTypes.length
          ? [...testTypes].sort((a, b) => a - b)
          : undefined,
      status: effectiveStatus,
      combine_p1_p2: combineP1P2 || undefined,
      packaging: schoolIds.length !== 1 ? packaging : undefined,
      format: reportFormat,
    };
  }, [
    examId,
    schoolIds,
    packaging,
    subjectTypeFilter,
    subjectIds,
    testTypes,
    effectiveStatus,
    combineP1P2,
    reportFormat,
  ]);

  const handleGenerate = async () => {
    const filters = buildFilters();
    if (!filters) {
      toast.error("Select an examination first");
      return;
    }
    setStarting(true);
    try {
      const useJob =
        reportFormat === "pdf" || (filters.school_ids?.length ?? 0) !== 1;

      if (useJob) {
        await startJob(filters, reportFormat);
      } else {
        try {
          await downloadScoreValidationReport(filters);
          toast.success("Excel downloaded");
        } catch (err) {
          if (err instanceof ScoreValidationReportHttpError && err.status === 413) {
            toast.message("Report is large — generating in the background");
            await startJob(filters, reportFormat);
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setStarting(false);
    }
  };

  const togglePaper = (paperId: number) => {
    setCombineP1P2(false);
    setTestTypes((prev) => {
      if (prev.includes(paperId)) {
        return prev.filter((id) => id !== paperId);
      }
      return [...prev, paperId].sort((a, b) => a - b);
    });
  };

  const jobProgress = validationReportJobProgress(jobDock);
  const jobCancelled = isValidationReportCancelled(jobDock?.status);
  const jobRunning =
    !!jobDock &&
    !jobCancelled &&
    (jobDock.status?.status === "pending" || jobDock.status?.status === "in_progress");

  if (loadingAuth) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TopBar title="Validation Report" showSearch={false} />

      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 10% -10%, color-mix(in oklab, var(--clet-primary) 18%, transparent), transparent 55%), radial-gradient(ellipse 70% 45% at 95% 0%, color-mix(in oklab, var(--chart-2) 16%, transparent), transparent 50%), linear-gradient(180deg, color-mix(in oklab, var(--clet-primary) 4%, transparent), transparent 42%)",
          }}
        />

        <div className="space-y-6 p-4 pb-36 lg:p-6 xl:p-8">
          <header className="validation-fade-up max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Validation report
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Find missing or invalid scores, then export Excel or PDF.
            </p>
          </header>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
            <div className="space-y-5">
              {/* Scope */}
              <section
                className="validation-fade-up rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur-sm sm:p-5"
                style={{ animationDelay: "60ms" }}
              >
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--clet-primary)] text-xs font-bold text-[color:var(--clet-on-primary)]">
                    1
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Scope</h2>
                    <p className="text-xs text-muted-foreground">Examination and centres</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Examination
                    </p>
                    <SearchableSelect
                      options={examOptions}
                      value={examId ?? ""}
                      onValueChange={(value) => {
                        const id =
                          typeof value === "number" ? value : parseInt(String(value), 10);
                        setExamId(Number.isNaN(id) ? undefined : id);
                        if (!Number.isNaN(id) && typeof window !== "undefined") {
                          window.sessionStorage.setItem(
                            DATA_ENTRY_EXAM_STORAGE_KEY,
                            String(id)
                          );
                        }
                      }}
                      placeholder="Select examination"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Schools
                    </p>
                    <SchoolMultiSelectFilter
                      schools={schools}
                      value={schoolIds}
                      onChange={setSchoolIds}
                      region={regionFilter}
                      onRegionChange={setRegionFilter}
                      fullWidth
                      disabled={!hasExam}
                    />
                  </div>

                  {isMultiSchool && (
                    <div className="rounded-lg border border-dashed border-border/80">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => setAdvancedOpen((open) => !open)}
                      >
                        Advanced delivery
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            advancedOpen && "rotate-180"
                          )}
                        />
                      </button>
                      {advancedOpen && (
                        <div className="space-y-2 border-t border-border/70 px-3 py-3">
                          <p className="text-[11px] text-muted-foreground">
                            Default is one file per school in a zip. Choose merged for a single
                            combined file.
                          </p>
                          <div
                            role="group"
                            aria-label="Multi-school delivery"
                            className="flex rounded-lg border bg-background p-1"
                          >
                            <button
                              type="button"
                              onClick={() => setPackaging("zip")}
                              className={cn(
                                "flex-1 rounded-md px-3 py-2 text-sm transition-colors",
                                packaging === "zip"
                                  ? "bg-[color:var(--clet-primary)] text-[color:var(--clet-on-primary)]"
                                  : "text-muted-foreground hover:bg-muted/60"
                              )}
                            >
                              Zip
                            </button>
                            <button
                              type="button"
                              onClick={() => setPackaging("merged")}
                              className={cn(
                                "flex-1 rounded-md px-3 py-2 text-sm transition-colors",
                                packaging === "merged"
                                  ? "bg-[color:var(--clet-primary)] text-[color:var(--clet-on-primary)]"
                                  : "text-muted-foreground hover:bg-muted/60"
                              )}
                            >
                              Merged
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Coverage */}
              <section
                className={cn(
                  "validation-fade-up rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur-sm transition-opacity sm:p-5",
                  !hasExam && "pointer-events-none opacity-45"
                )}
                style={{ animationDelay: "120ms" }}
                aria-disabled={!hasExam}
              >
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--chart-2)] text-xs font-bold text-white">
                    2
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Coverage</h2>
                    <p className="text-xs text-muted-foreground">
                      {hasExam ? "Subjects and papers" : "Select an examination first"}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Subjects
                    </p>
                    <SubjectMultiSelectFilter
                      subjects={subjects}
                      value={subjectIds}
                      onChange={setSubjectIds}
                      subjectType={subjectTypeFilter}
                      onSubjectTypeChange={setSubjectTypeFilter}
                      fullWidth
                      disabled={!hasExam}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Papers
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PAPER_CHIPS.map((paper) => {
                        const active = !combineP1P2 && testTypes.includes(paper.id);
                        return (
                          <button
                            key={paper.id}
                            type="button"
                            disabled={!hasExam}
                            onClick={() => togglePaper(paper.id)}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-left transition-all duration-200",
                              active
                                ? "border-[color:var(--clet-primary)] bg-[color:color-mix(in_oklab,var(--clet-primary)_12%,transparent)]"
                                : "border-border/80 bg-background hover:border-foreground/20"
                            )}
                          >
                            <span className="block text-sm font-semibold">{paper.short}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {paper.label}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        disabled={!hasExam}
                        onClick={() => {
                          setCombineP1P2(true);
                          setTestTypes([1, 2]);
                          setSelectedStatus("missing");
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition-all duration-200",
                          combineP1P2
                            ? "border-amber-400 bg-amber-50"
                            : "border-border/80 bg-background hover:border-foreground/20"
                        )}
                      >
                        <span className="block text-sm font-semibold">P1/P2</span>
                        <span className="block text-[10px] text-muted-foreground">Combined</span>
                      </button>
                      {(combineP1P2 || testTypes.length > 0) && (
                        <button
                          type="button"
                          disabled={!hasExam}
                          onClick={() => {
                            setCombineP1P2(false);
                            setTestTypes([]);
                          }}
                          className="rounded-lg px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          All papers
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Status */}
              <section
                className={cn(
                  "validation-fade-up rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur-sm transition-opacity sm:p-5",
                  !hasExam && "pointer-events-none opacity-45"
                )}
                style={{ animationDelay: "180ms" }}
                aria-disabled={!hasExam}
              >
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--chart-3)] text-xs font-bold text-slate-900">
                    3
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Status</h2>
                    <p className="text-xs text-muted-foreground">
                      {combineP1P2
                        ? "Combined papers use Missing"
                        : hasExam
                          ? "One status per report"
                          : "Select an examination first"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = effectiveStatus === opt.id;
                    const lockedOut = combineP1P2 && opt.id !== "missing";
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={!hasExam || lockedOut}
                        onClick={() => setSelectedStatus(opt.id)}
                        className={cn(
                          "group flex items-start gap-3 rounded-xl border border-border/80 bg-background/80 px-3.5 py-3 text-left transition-all duration-200",
                          selected && opt.selected,
                          !selected &&
                            !lockedOut &&
                            hasExam &&
                            "hover:border-foreground/20 hover:bg-muted/40",
                          lockedOut && "cursor-not-allowed opacity-40"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70",
                            selected && "bg-background/80",
                            opt.accent
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold tracking-tight">
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {opt.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Deliver */}
            <aside
              className="validation-fade-up xl:sticky xl:top-4"
              style={{ animationDelay: "220ms" }}
            >
              <div className="relative overflow-hidden rounded-2xl border border-[color:color-mix(in_oklab,var(--clet-primary)_35%,var(--border))] bg-background/85 p-5 shadow-lg backdrop-blur-md">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[color:var(--clet-primary)] opacity-[0.08] blur-2xl"
                />

                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Generate
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Report recipe</h2>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {recipeChips.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex max-w-full truncate rounded-md border border-border/80 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground/90"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                <div
                  role="group"
                  aria-label="Report format"
                  className="mt-5 flex rounded-lg border bg-background p-1"
                >
                  <button
                    type="button"
                    onClick={() => setReportFormat("xlsx")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
                      reportFormat === "xlsx"
                        ? "bg-[color:var(--clet-primary)] text-[color:var(--clet-on-primary)]"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportFormat("pdf")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
                      reportFormat === "pdf"
                        ? "bg-[color:var(--clet-primary)] text-[color:var(--clet-on-primary)]"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>

                <Button
                  className="mt-3 h-11 w-full text-sm font-semibold"
                  onClick={() => void handleGenerate()}
                  disabled={!hasExam || starting}
                >
                  {starting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : reportFormat === "pdf" ? (
                    <FileText className="mr-2 h-4 w-4" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Generate report
                </Button>

                {!hasExam ? (
                  <p className="mt-3 text-center text-xs text-amber-700">
                    Select an examination to enable generation
                  </p>
                ) : (
                  <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                    {reportFormat === "pdf" || isMultiSchool
                      ? "Runs in the background — download starts when ready"
                      : "Downloads immediately when small enough"}
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {jobDock && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold tracking-tight">
                  {jobCancelled
                    ? "Report cancelled"
                    : jobDock.status?.status === "completed"
                      ? "Report ready"
                      : jobDock.status?.status === "failed"
                        ? "Report failed"
                        : "Generating report…"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {jobCancelled
                    ? "Generation stopped."
                    : jobDock.error ||
                      jobDock.status?.message ||
                      "Working in the background."}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={dismiss}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!jobCancelled && jobDock.status?.status !== "failed" && (
              <div className="mt-3 space-y-1.5">
                <Progress
                  value={jobProgress}
                  className="h-2 transition-[width] duration-500 ease-out"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    {validationReportJobStageLabel(
                      jobDock.status?.stage,
                      jobDock.status?.status,
                      jobCancelled
                    )}
                  </span>
                  <span>
                    {jobDock.status?.schools_total
                      ? `${jobDock.status.schools_done ?? 0} / ${jobDock.status.schools_total} schools`
                      : jobDock.status?.row_count != null
                        ? `${jobDock.status.row_count.toLocaleString()} rows`
                        : ""}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {jobDock.status?.status === "completed" && !jobCancelled && (
                <Button
                  size="sm"
                  onClick={() => void downloadReadyFile(jobDock.jobId)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {jobDock.status.is_zip ? "Download zip again" : "Download again"}
                </Button>
              )}
              {jobDock.status?.status === "failed" && !jobCancelled && (
                <Button size="sm" variant="secondary" onClick={() => void handleGenerate()}>
                  Retry
                </Button>
              )}
              {jobRunning && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancelling}
                  onClick={() => void cancelJob()}
                >
                  {cancelling ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {cancelling || jobDock.status?.stage === "cancelled"
                    ? "Cancelling…"
                    : "Cancel"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default ScoreValidationReportPage;
