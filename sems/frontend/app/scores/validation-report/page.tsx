"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronsUpDown,
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { examLabel } from "@/components/results/exam-label";
import { DATA_ENTRY_EXAM_STORAGE_KEY } from "@/hooks/useDataEntryExamScope";
import {
  downloadScoreValidationReport,
  downloadScoreValidationReportJobFile,
  getAllExams,
  getAllSchools,
  getAllSubjects,
  getCurrentUser,
  getScoreValidationReportJob,
  previewScoreValidationReport,
  startScoreValidationReportJob,
  type ScoreValidationReportDetailRow,
  type ScoreValidationReportFilters,
  type ScoreValidationReportJobStatus,
  type ScoreValidationReportStatus,
  type ScoreValidationReportSummary,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import type { Exam, School, Subject } from "@/types/document";

const PREVIEW_PAGE_SIZE = 50;
const PREVIEW_DEBOUNCE_MS = 350;
const JOB_POLL_MS = 1500;
const SYNC_ROW_LIMIT = 5000;
const JOB_STORAGE_KEY = "sems.validation_report.job_id";

const PAPER_OPTIONS: { id: number; label: string; short: string }[] = [
  { id: 1, label: "Paper 1 (Objectives)", short: "P1" },
  { id: 2, label: "Paper 2 (Essay)", short: "P2" },
  { id: 3, label: "Paper 3 (Practical)", short: "P3" },
];

const STATUS_OPTIONS: { id: ScoreValidationReportStatus; label: string; hint: string }[] = [
  { id: "missing", label: "Missing", hint: "Write-in score worksheet" },
  { id: "invalid", label: "Invalid", hint: "Value, expected, correct score" },
  { id: "entered", label: "Entered", hint: "Recorded score + correction" },
  { id: "absent", label: "Absent", hint: "Write-in if sat" },
];

type PreviewColumn = { key: string; header: string };

function previewColumnsForStatus(
  status: ScoreValidationReportStatus,
  combineP1P2: boolean
): PreviewColumn[] {
  const base: PreviewColumn[] = [
    { key: "index_number", header: "Index" },
    { key: "candidate_name", header: "Candidate" },
  ];
  if (status === "missing" && combineP1P2) {
    return [...base, { key: "missing_papers", header: "Missing papers" }];
  }
  base.push({ key: "paper_label", header: "Paper" });
  if (status === "invalid") {
    return [
      ...base,
      { key: "raw_score", header: "Value" },
      { key: "expected", header: "Expected" },
    ];
  }
  if (status === "entered") {
    return [...base, { key: "raw_score", header: "Score" }];
  }
  return base;
}

function cellValue(row: ScoreValidationReportDetailRow, key: string): string {
  if (key === "raw_score") return row.raw_score ?? "—";
  if (key === "max_score") {
    if (row.max_score == null) return "—";
    return Number.isInteger(row.max_score) ? String(row.max_score) : String(row.max_score);
  }
  if (key === "expected") return row.expected ?? "—";
  if (key === "missing_papers") return row.missing_papers || row.paper_short || "—";
  if (key === "paper_label") return row.paper_short || row.paper_label;
  const value = row[key as keyof ScoreValidationReportDetailRow];
  return value == null ? "—" : String(value);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "entered":
      return "bg-emerald-100 text-emerald-800";
    case "missing":
      return "bg-amber-100 text-amber-900";
    case "invalid":
      return "bg-red-100 text-red-800";
    case "absent":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

type JobDockState = {
  jobId: number;
  format: "xlsx" | "pdf";
  status: ScoreValidationReportJobStatus | null;
  error: string | null;
};

export default function ScoreValidationReportPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [examId, setExamId] = useState<number | undefined>();
  const [schoolId, setSchoolId] = useState<number | undefined>();
  const [packaging, setPackaging] = useState<"zip" | "merged">("zip");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilterValue>("ALL");
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [testTypes, setTestTypes] = useState<number[]>([]);
  const [combineP1P2, setCombineP1P2] = useState(false);
  const [selectedStatus, setSelectedStatus] =
    useState<ScoreValidationReportStatus>("missing");
  const [papersOpen, setPapersOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [summary, setSummary] = useState<ScoreValidationReportSummary | null>(null);
  const [rows, setRows] = useState<ScoreValidationReportDetailRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [startingFormat, setStartingFormat] = useState<"xlsx" | "pdf" | null>(null);
  const [jobDock, setJobDock] = useState<JobDockState | null>(null);

  const previewReqId = useRef(0);
  const pollCancelRef = useRef(false);

  const columns = useMemo(
    () => previewColumnsForStatus(selectedStatus, combineP1P2),
    [selectedStatus, combineP1P2]
  );

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

  const schoolOptions = useMemo(
    () =>
      schools.map((school) => ({
        value: school.id,
        label: `${school.code} — ${school.name}`,
      })),
    [schools]
  );

  const buildFilters = useCallback(
    (overrides?: Partial<ScoreValidationReportFilters>): ScoreValidationReportFilters | null => {
      if (!examId) return null;
      const status = combineP1P2 ? "missing" : selectedStatus;
      return {
        exam_id: examId,
        school_id: schoolId,
        subject_type: subjectTypeFilter === "ALL" ? undefined : subjectTypeFilter,
        subject_ids: subjectIds.length ? subjectIds : undefined,
        test_types: combineP1P2
          ? [1, 2]
          : testTypes.length
            ? [...testTypes].sort((a, b) => a - b)
            : undefined,
        status,
        combine_p1_p2: combineP1P2 || undefined,
        packaging: schoolId == null ? packaging : undefined,
        page,
        page_size: PREVIEW_PAGE_SIZE,
        ...overrides,
      };
    },
    [
      examId,
      schoolId,
      packaging,
      subjectTypeFilter,
      subjectIds,
      testTypes,
      selectedStatus,
      combineP1P2,
      page,
    ]
  );

  const loadPreview = useCallback(async () => {
    const filters = buildFilters();
    if (!filters) {
      setSummary(null);
      setRows([]);
      setTotalRows(0);
      return;
    }
    const reqId = ++previewReqId.current;
    setPreviewLoading(true);
    try {
      const data = await previewScoreValidationReport(filters);
      if (reqId !== previewReqId.current) return;
      setSummary(data.summary);
      setRows(data.rows);
      setTotalRows(data.total_rows);
    } catch (err) {
      if (reqId !== previewReqId.current) return;
      toast.error(err instanceof Error ? err.message : "Failed to load preview");
      setSummary(null);
      setRows([]);
      setTotalRows(0);
    } finally {
      if (reqId === previewReqId.current) setPreviewLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPreview();
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [loadPreview]);

  const pollJob = useCallback(async (jobId: number, format: "xlsx" | "pdf") => {
    pollCancelRef.current = false;
    for (;;) {
      if (pollCancelRef.current) return;
      const job = await getScoreValidationReportJob(jobId);
      setJobDock({ jobId, format, status: job, error: null });
      if (job.status === "completed") {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(JOB_STORAGE_KEY);
        }
        toast.success(
          job.is_zip
            ? "Zip ready — download from the report panel"
            : "Report ready — download from the report panel"
        );
        return;
      }
      if (job.status === "failed") {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(JOB_STORAGE_KEY);
        }
        setJobDock({
          jobId,
          format,
          status: job,
          error: job.error_message || "Report job failed",
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
    }
  }, []);

  // Resume in-flight job after navigation back to this page
  useEffect(() => {
    if (loadingAuth) return;
    const stored =
      typeof window !== "undefined" ? window.sessionStorage.getItem(JOB_STORAGE_KEY) : null;
    if (!stored) return;
    const jobId = parseInt(stored, 10);
    if (Number.isNaN(jobId)) return;
    setJobDock({ jobId, format: "xlsx", status: null, error: null });
    void pollJob(jobId, "xlsx");
    return () => {
      pollCancelRef.current = true;
    };
  }, [loadingAuth, pollJob]);

  const handleDownload = async (format: "xlsx" | "pdf") => {
    const filters = buildFilters({ format, page: undefined, page_size: undefined });
    if (!filters) {
      toast.error("Select an examination first");
      return;
    }
    setStartingFormat(format);
    try {
      const useJob =
        !filters.school_id ||
        totalRows > SYNC_ROW_LIMIT ||
        (format === "pdf" && totalRows > 1500);

      if (useJob) {
        const { job_id } = await startScoreValidationReportJob(filters);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(JOB_STORAGE_KEY, String(job_id));
        }
        setJobDock({
          jobId: job_id,
          format,
          status: {
            job_id,
            exam_id: filters.exam_id,
            status: "pending",
            message: "Queued…",
            stage: "queued",
          },
          error: null,
        });
        toast.message("Report started in the background — you can keep working");
        void pollJob(job_id, format);
      } else {
        await downloadScoreValidationReport(filters);
        toast.success(format === "pdf" ? "PDF downloaded" : "Excel downloaded");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setStartingFormat(null);
    }
  };

  const handleDownloadJobFile = async () => {
    if (!jobDock) return;
    try {
      await downloadScoreValidationReportJobFile(jobDock.jobId);
      toast.success("Download started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const dismissJobDock = () => {
    pollCancelRef.current = true;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(JOB_STORAGE_KEY);
    }
    setJobDock(null);
  };

  const totalPages = Math.max(1, Math.ceil(totalRows / PREVIEW_PAGE_SIZE));
  const statusCount = summary ? summary[selectedStatus] : 0;
  const jobProgress =
    jobDock?.status?.schools_total && jobDock.status.schools_total > 0
      ? Math.round(
          ((jobDock.status.schools_done ?? 0) / jobDock.status.schools_total) * 100
        )
      : jobDock?.status?.status === "completed"
        ? 100
        : jobDock?.status?.stage === "building"
          ? 15
          : jobDock?.status?.stage === "zipping"
            ? 90
            : 8;

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
      <TopBar
        title={
          <div className="flex min-w-0 items-baseline gap-3">
            <span>Validation Report</span>
            <span className="hidden truncate text-sm font-normal text-muted-foreground lg:inline">
              One status at a time · zip or merge when all schools
            </span>
          </div>
        }
        showSearch={false}
      />

      <div className="space-y-4 p-4 pb-28 lg:p-6">
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Examination
            </p>
            <SearchableSelect
              options={examOptions}
              value={examId ?? ""}
              onValueChange={(value) => {
                const id = typeof value === "number" ? value : parseInt(String(value), 10);
                setExamId(Number.isNaN(id) ? undefined : id);
                setPage(1);
                if (!Number.isNaN(id) && typeof window !== "undefined") {
                  window.sessionStorage.setItem(DATA_ENTRY_EXAM_STORAGE_KEY, String(id));
                }
              }}
              placeholder="Select examination"
            />
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              School
            </p>
            <SearchableSelect
              options={schoolOptions}
              value={schoolId ?? "all"}
              allowAll
              allLabel="All schools"
              onValueChange={(value) => {
                if (value === "all" || value === "") {
                  setSchoolId(undefined);
                } else {
                  const id = typeof value === "number" ? value : parseInt(String(value), 10);
                  setSchoolId(Number.isNaN(id) ? undefined : id);
                }
                setPage(1);
              }}
              placeholder="All schools"
            />
          </div>

          {schoolId == null && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Multi-school delivery
              </p>
              <div
                role="group"
                aria-label="Multi-school delivery"
                className="flex rounded-md border bg-background p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setPackaging("zip")}
                  className={cn(
                    "flex-1 rounded-sm px-3 py-2 text-center text-sm transition-colors",
                    packaging === "zip"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  Zip (separate)
                </button>
                <button
                  type="button"
                  onClick={() => setPackaging("merged")}
                  className={cn(
                    "flex-1 rounded-sm px-3 py-2 text-center text-sm transition-colors",
                    packaging === "merged"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  Merged file
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {packaging === "zip"
                  ? "One PDF/Excel per school, packaged as a zip."
                  : "All schools combined into a single PDF or Excel file."}
              </p>
            </div>
          )}

          <div className="space-y-1 md:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Subjects
            </p>
            <SubjectMultiSelectFilter
              subjects={subjects}
              value={subjectIds}
              onChange={(ids) => {
                setSubjectIds(ids);
                setPage(1);
              }}
              subjectType={subjectTypeFilter}
              onSubjectTypeChange={(value) => {
                setSubjectTypeFilter(value);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Papers
            </p>
            <Popover open={papersOpen} onOpenChange={setPapersOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {combineP1P2
                      ? "Paper 1 or 2 (combined)"
                      : testTypes.length === 0
                        ? "All papers"
                        : testTypes.length === 1
                          ? PAPER_OPTIONS.find((p) => p.id === testTypes[0])?.label
                          : `${testTypes.length} papers`}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setCombineP1P2(false);
                      setTestTypes([]);
                      setPage(1);
                    }}
                  >
                    Clear (all)
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    disabled={combineP1P2}
                    onClick={() => {
                      setCombineP1P2(false);
                      setTestTypes(PAPER_OPTIONS.map((p) => p.id));
                      setPage(1);
                    }}
                  >
                    Select all
                  </button>
                </div>
                <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-md border border-amber-200/80 bg-amber-50/50 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <Checkbox
                    checked={combineP1P2}
                    onCheckedChange={(value) => {
                      const on = value === true;
                      setCombineP1P2(on);
                      if (on) {
                        setTestTypes([1, 2]);
                        setSelectedStatus("missing");
                      }
                      setPage(1);
                    }}
                  />
                  <span className="text-sm font-medium">Paper 1 or 2 (combined)</span>
                </label>
                <p className="mb-2 px-1 text-[11px] text-muted-foreground">
                  One row per candidate when P1 and/or P2 is missing. Shows Missing papers as P1,
                  P2, or P1/P2.
                </p>
                <div className="space-y-1">
                  {PAPER_OPTIONS.map((paper) => {
                    const checked = !combineP1P2 && testTypes.includes(paper.id);
                    return (
                      <label
                        key={paper.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60",
                          combineP1P2 && "opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={combineP1P2}
                          onCheckedChange={(value) => {
                            const on = value === true;
                            setCombineP1P2(false);
                            setTestTypes((prev) => {
                              if (on) {
                                return prev.includes(paper.id)
                                  ? prev
                                  : [...prev, paper.id].sort((a, b) => a - b);
                              }
                              return prev.filter((id) => id !== paper.id);
                            });
                            setPage(1);
                          }}
                        />
                        <span className="text-sm">{paper.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                  {combineP1P2
                    ? "Combined mode uses Missing status and lists P1/P2 gaps together."
                    : "Exports keep Paper 1 and Paper 2 on separate pages/sheets."}
                </p>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Status (one at a time)
            </p>
            <Select
              value={combineP1P2 ? "missing" : selectedStatus}
              disabled={combineP1P2}
              onValueChange={(value) => {
                setSelectedStatus(value as ScoreValidationReportStatus);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label} — {opt.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Matching rows
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">
                  {previewLoading && !summary ? "—" : totalRows.toLocaleString()}
                </p>
              </div>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5",
              selectedStatus === "missing" && "border-amber-200 bg-amber-50/50",
              selectedStatus === "invalid" && "border-red-200 bg-red-50/40",
              selectedStatus === "entered" && "border-emerald-200 bg-emerald-50/50",
              selectedStatus === "absent" && "border-slate-200 bg-slate-50/60"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {STATUS_OPTIONS.find((s) => s.id === selectedStatus)?.label}
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">
                  {previewLoading && !summary ? "—" : statusCount.toLocaleString()}
                </p>
              </div>
              {selectedStatus === "missing" ? (
                <MinusCircle className="h-4 w-4 text-muted-foreground" />
              ) : selectedStatus === "invalid" ? (
                <XCircle className="h-4 w-4 text-muted-foreground" />
              ) : selectedStatus === "entered" ? (
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void handleDownload("xlsx")}
            disabled={!examId || startingFormat != null}
          >
            {startingFormat === "xlsx" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Download Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleDownload("pdf")}
            disabled={!examId || startingFormat != null}
          >
            {startingFormat === "pdf" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Download PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => void loadPreview()}
            disabled={!examId || previewLoading}
          >
            {previewLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Refresh preview
          </Button>
          {!examId && (
            <span className="text-sm text-muted-foreground">Select an examination to begin</span>
          )}
          {!schoolId && examId && (
            <span className="text-sm text-muted-foreground">
              {packaging === "zip"
                ? "All schools → one file per school (zip)"
                : "All schools → single merged file"}
            </span>
          )}
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">
              Preview{" "}
              <span className="font-normal text-muted-foreground">
                ({totalRows.toLocaleString()} {selectedStatus} row
                {totalRows === 1 ? "" : "s"})
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || previewLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || previewLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right text-muted-foreground">#</TableHead>
                  {columns.map((col) => (
                    <TableHead key={col.key}>{col.header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!examId ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="text-center text-muted-foreground"
                    >
                      Select an examination to preview rows
                    </TableCell>
                  </TableRow>
                ) : previewLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="text-center text-muted-foreground"
                    >
                      No rows match the current filters
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, idx) => (
                    <TableRow
                      key={`${row.candidate_id}-${row.subject_id}-${row.test_type}-${idx}`}
                    >
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {(page - 1) * PREVIEW_PAGE_SIZE + idx + 1}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={cn(
                            col.key === "index_number" && "font-mono text-xs",
                            (col.key === "paper_label" || col.key === "expected") &&
                              "whitespace-nowrap"
                          )}
                        >
                          {col.key === "index_number" ? (
                            <div>
                              <div className="font-mono text-xs">{row.index_number}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {row.school_code} · {row.subject_code}
                              </div>
                            </div>
                          ) : (
                            cellValue(row, col.key)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Sorted by paper, then subject, then index. Each paper+subject starts on a new page
          (PDF) or sheet (Excel). Multi-school exports run in the background and download as a
          zip.
        </p>
      </div>

      {jobDock && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold tracking-tight">
                {jobDock.status?.status === "completed"
                  ? "Report ready"
                  : jobDock.status?.status === "failed"
                    ? "Report failed"
                    : "Generating report…"}
              </p>
              <p className="text-xs text-muted-foreground">
                {jobDock.error ||
                  jobDock.status?.message ||
                  "Working in the background — feel free to keep filtering."}
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

          {jobDock.status?.status !== "failed" && (
            <div className="mt-3 space-y-1.5">
              <Progress value={jobProgress} className="h-2" />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="capitalize">{jobDock.status?.stage || "queued"}</span>
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
            {jobDock.status?.status === "completed" && (
              <Button size="sm" onClick={() => void handleDownloadJobFile()}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {jobDock.status.is_zip ? "Download zip" : "Download file"}
              </Button>
            )}
            {jobDock.status?.status === "failed" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleDownload(jobDock.format)}
              >
                Retry
              </Button>
            )}
            {(jobDock.status?.status === "pending" ||
              jobDock.status?.status === "in_progress") && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                  statusBadgeClass("missing")
                )}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                Running
              </span>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
