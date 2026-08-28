"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SubjectMultiSelectFilter,
  type SubjectTypeFilterValue,
} from "@/components/SubjectMultiSelectFilter";
import { ValidationRunningPanel } from "@/components/validation/ValidationRunningPanel";
import {
  runValidationForScope,
  type AggregatedValidationResult,
  type ValidationProgressUpdate,
} from "@/lib/run-validation-scope";
import type { Exam, School, Subject } from "@/types/document";
import { cn } from "@/lib/utils";

export type ValidationRunScope = {
  examId: number | null;
  schoolId: number | null;
  subjectIds: number[];
  subjectType: SubjectTypeFilterValue;
  testTypes: number[];
};

type RunValidationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exams: Exam[];
  schools: School[];
  subjects: Subject[];
  loadingOptions?: boolean;
  initialScope?: Partial<ValidationRunScope>;
  onCompleted?: () => void | Promise<void>;
};

type StepStatus = "pending" | "running" | "complete" | "error";

const ALL_TEST_TYPES = [1, 2, 3] as const;

const PAPER_META: Record<number, { label: string; hint: string }> = {
  1: { label: "Objectives", hint: "Multiple choice / obj scores" },
  2: { label: "Essay", hint: "Written / essay scores" },
  3: { label: "Practical", hint: "Practical / lab scores" },
};

function buildInitialStepStatuses(subjectIds: number[]): Map<string, StepStatus> {
  const map = new Map<string, StepStatus>();
  if (subjectIds.length === 0) {
    map.set("all", "pending");
  } else {
    for (const id of subjectIds) map.set(String(id), "pending");
  }
  return map;
}

function stepKey(subjectId: number | null) {
  return subjectId != null ? String(subjectId) : "all";
}

function ResultStat({
  label,
  value,
  accent,
  delayMs = 0,
}: {
  label: string;
  value: number;
  accent?: "success" | "warning" | "default";
  delayMs?: number;
}) {
  return (
    <div
      className={cn(
        "validation-fade-up rounded-xl border px-4 py-3",
        accent === "success" &&
          "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30",
        accent === "warning" &&
          "border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30",
        !accent && "border-border/80 bg-background/90"
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</p>
    </div>
  );
}

function ValidationCompleteBurst({ examLabel }: { examLabel?: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-8 py-10">
      <div className="validation-pop relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
        <span className="validation-ring-pulse absolute inset-0 rounded-full border-2 border-emerald-400/40" />
        <CheckCircle2 className="relative h-12 w-12 text-emerald-600" />
      </div>
      <p className="validation-fade-up mt-6 text-xl font-semibold tracking-tight" style={{ animationDelay: "120ms" }}>
        Validation complete
      </p>
      {examLabel && (
        <p className="validation-fade-up mt-2 text-sm text-muted-foreground" style={{ animationDelay: "200ms" }}>
          {examLabel}
        </p>
      )}
      <p className="validation-fade-up mt-2 text-sm text-muted-foreground" style={{ animationDelay: "280ms" }}>
        Preparing your results…
      </p>
    </div>
  );
}

export function RunValidationDialog({
  open,
  onOpenChange,
  exams,
  schools,
  subjects,
  loadingOptions = false,
  initialScope,
  onCompleted,
}: RunValidationDialogProps) {
  const [examId, setExamId] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [subjectType, setSubjectType] = useState<SubjectTypeFilterValue>("ALL");
  const [testTypes, setTestTypes] = useState<number[]>([...ALL_TEST_TYPES]);
  const [running, setRunning] = useState(false);
  const [showCompleteBurst, setShowCompleteBurst] = useState(false);
  const [progress, setProgress] = useState<ValidationProgressUpdate | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Map<string, StepStatus>>(new Map());
  const [result, setResult] = useState<AggregatedValidationResult | null>(null);

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return (a.exam_type || "").localeCompare(b.exam_type || "");
        })
        .map((exam) => {
          const typeLabel =
            exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
          return {
            value: exam.id,
            label: `${exam.year} ${exam.series} ${typeLabel}`,
          };
        }),
    [exams]
  );

  const selectedExamLabel = examOptions.find((e) => e.value === examId)?.label;

  const applyInitialScope = () => {
    if (!initialScope) return;
    setExamId(initialScope.examId ?? null);
    setSchoolId(initialScope.schoolId ?? null);
    setSubjectIds(initialScope.subjectIds ?? []);
    setSubjectType(initialScope.subjectType ?? "ALL");
    setTestTypes(initialScope.testTypes?.length ? initialScope.testTypes : [...ALL_TEST_TYPES]);
    setResult(null);
    setShowCompleteBurst(false);
    setProgress(null);
    setStepStatuses(new Map());
  };

  useEffect(() => {
    if (open) {
      applyInitialScope();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetForm = () => {
    setExamId(null);
    setSchoolId(null);
    setSubjectIds([]);
    setSubjectType("ALL");
    setTestTypes([...ALL_TEST_TYPES]);
    setProgress(null);
    setStepStatuses(new Map());
    setResult(null);
    setShowCompleteBurst(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && running) return;
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleProgress = (update: ValidationProgressUpdate) => {
    setProgress(update);
    const key = stepKey(update.subjectId);
    setStepStatuses((prev) => {
      const next = new Map(prev);
      if (update.phase === "start") {
        next.set(key, "running");
      } else if (update.phase === "complete") {
        next.set(key, "complete");
      } else {
        next.set(key, "error");
      }
      return next;
    });
  };

  const handleTestTypeToggle = (testType: number, checked: boolean) => {
    if (checked) {
      setTestTypes((prev) => [...prev, testType].sort((a, b) => a - b));
    } else {
      setTestTypes((prev) => prev.filter((t) => t !== testType));
    }
  };

  const handleRun = async () => {
    if (!examId) {
      toast.error("Select an examination to limit scope");
      return;
    }
    if (testTypes.length === 0) {
      toast.error("Select at least one paper");
      return;
    }

    setRunning(true);
    setShowCompleteBurst(false);
    setProgress(null);
    setResult(null);
    setStepStatuses(buildInitialStepStatuses(subjectIds));

    try {
      const aggregated = await runValidationForScope({
        examId,
        subjectIds,
        schoolId,
        subjectType: subjectType === "ALL" ? null : subjectType,
        testTypes,
        subjects,
        onProgress: handleProgress,
      });

      setShowCompleteBurst(true);
      await new Promise((resolve) => setTimeout(resolve, 750));

      setResult(aggregated);
      setShowCompleteBurst(false);

      if (aggregated.subjectsFailed === 0) {
        toast.success(
          `Validation done · checked ${aggregated.total_scores_checked}, created ${aggregated.issues_created}, resolved ${aggregated.issues_resolved}`
        );
      } else if (aggregated.subjectsSucceeded > 0) {
        toast.warning(
          `Validation partial · ${aggregated.subjectsSucceeded} ok, ${aggregated.subjectsFailed} failed`
        );
      } else {
        toast.error("Validation failed for all scopes");
      }

      await onCompleted?.();
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const showResults = result !== null;
  const showRunning = running && !showCompleteBurst;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(960px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div
          className={cn(
            "shrink-0 border-b px-8 pb-5 pt-7 transition-colors duration-500",
            showRunning || showCompleteBurst
              ? "bg-gradient-to-br from-primary/15 via-primary/5 to-background"
              : "bg-gradient-to-br from-primary/10 via-background to-background"
          )}
        >
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 transition-all duration-500",
                  showRunning || showCompleteBurst
                    ? "bg-primary/20 text-primary ring-primary/30"
                    : "bg-primary/15 text-primary ring-primary/20"
                )}
              >
                {showRunning ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : showResults ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                ) : (
                  <ClipboardCheck className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-2xl tracking-tight">
                  {showRunning
                    ? "Validating scores…"
                    : showCompleteBurst
                      ? "Finishing up…"
                      : showResults
                        ? "Validation results"
                        : "Run validation"}
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  {showRunning
                    ? "Scanning candidate scores and reconciling open issues. Please keep this window open."
                    : showCompleteBurst
                      ? "Almost done — compiling your validation summary."
                      : showResults
                        ? "Review the outcome below. The issues list has been refreshed. Close when you are done."
                        : "Scan candidate scores for missing or invalid values. Pick an examination, then optionally narrow by school, subjects, and papers."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {!showResults && !showRunning && !showCompleteBurst && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 bg-background/80 shadow-sm"
                disabled={running || !initialScope}
                onClick={applyInitialScope}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Use current page filters
              </Button>
              {!examId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  <Sparkles className="h-3 w-3" />
                  Examination required
                </span>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {showRunning ? (
            <ValidationRunningPanel
              progress={progress}
              stepStatuses={stepStatuses}
              subjectIds={subjectIds}
              subjects={subjects}
              examLabel={selectedExamLabel}
            />
          ) : showCompleteBurst ? (
            <ValidationCompleteBurst examLabel={selectedExamLabel} />
          ) : showResults && result ? (
            <div className="flex h-full flex-col px-8 py-6">
              <div className="validation-fade-up mb-5 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-lg font-medium">Validation complete</p>
                {selectedExamLabel && (
                  <span className="text-sm text-muted-foreground">· {selectedExamLabel}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <ResultStat label="Scores checked" value={result.total_scores_checked} delayMs={0} />
                <ResultStat label="Issues found" value={result.issues_found} accent="warning" delayMs={60} />
                <ResultStat label="Created" value={result.issues_created} delayMs={120} />
                <ResultStat label="Auto-resolved" value={result.issues_resolved} accent="success" delayMs={180} />
                <ResultStat label="Reopened" value={result.issues_reopened} delayMs={240} />
                <ResultStat label="Subjects ok" value={result.subjectsSucceeded} accent="success" delayMs={300} />
              </div>

              {result.subjectsFailed > 0 && (
                <p
                  className="validation-fade-up mt-4 text-sm text-amber-700 dark:text-amber-300"
                  style={{ animationDelay: "360ms" }}
                >
                  {result.subjectsFailed} subject scope{result.subjectsFailed === 1 ? "" : "s"} failed.
                </p>
              )}

              {result.failures.length > 0 && (
                <div className="validation-fade-up mt-4 min-h-0 flex-1" style={{ animationDelay: "420ms" }}>
                  <p className="mb-2 text-sm font-medium text-destructive">Failures</p>
                  <ul className="max-h-[min(28vh,240px)] space-y-2 overflow-y-auto rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {result.failures.map((failure) => (
                      <li key={`${failure.subject_id}-${failure.message}`}>
                        {failure.subject_code ?? failure.subject_id}: {failure.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full overflow-y-auto px-8 py-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-1.5 lg:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Examination
                  </p>
                  <SearchableSelect
                    options={examOptions}
                    value={examId ?? ""}
                    onValueChange={(value) => {
                      if (value === "all" || value === "") {
                        setExamId(null);
                      } else {
                        setExamId(typeof value === "number" ? value : parseInt(String(value), 10));
                      }
                    }}
                    placeholder="Select an examination"
                    disabled={running || loadingOptions}
                    searchPlaceholder="Search examinations..."
                    emptyMessage="No examinations found"
                    triggerClassName="h-11 w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    School
                  </p>
                  <SearchableSelect
                    options={schools.map((school) => ({
                      value: school.id,
                      label: `${school.code} - ${school.name}`,
                    }))}
                    value={schoolId ?? "all"}
                    onValueChange={(value) => {
                      if (value === "all" || value === "") {
                        setSchoolId(null);
                      } else {
                        setSchoolId(typeof value === "number" ? value : parseInt(String(value), 10));
                      }
                    }}
                    placeholder="All schools"
                    disabled={running || loadingOptions}
                    allowAll
                    allLabel="All schools"
                    searchPlaceholder="Search schools..."
                    emptyMessage="No schools found"
                    triggerClassName="h-11 w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subjects
                  </p>
                  <SubjectMultiSelectFilter
                    subjects={subjects}
                    value={subjectIds}
                    onChange={setSubjectIds}
                    subjectType={subjectType}
                    onSubjectTypeChange={setSubjectType}
                    disabled={running || loadingOptions}
                    className="w-full [&>button]:h-11 [&>button]:min-w-0 [&>button]:max-w-none [&>button]:w-full"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to validate all subjects in scope.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Papers
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ALL_TEST_TYPES.map((testType) => {
                    const meta = PAPER_META[testType];
                    const selected = testTypes.includes(testType);
                    return (
                      <button
                        key={testType}
                        type="button"
                        disabled={running}
                        onClick={() => handleTestTypeToggle(testType, !selected)}
                        className={cn(
                          "flex flex-col rounded-xl border px-4 py-4 text-left transition-all duration-300",
                          selected
                            ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                            : "border-border/80 bg-muted/20 hover:border-border hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{meta.label}</span>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) =>
                              handleTestTypeToggle(testType, checked === true)
                            }
                            disabled={running}
                            className="pointer-events-none"
                          />
                        </div>
                        <span className="mt-1.5 text-xs text-muted-foreground">{meta.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {loadingOptions && (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Loading options…
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-8 py-5 sm:justify-between">
          {showResults ? (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Close
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setResult(null)}>
                  Run again
                </Button>
                <Button onClick={() => handleClose(false)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)} disabled={running}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleRun()}
                disabled={running || loadingOptions || !examId}
                className="min-w-[160px] gap-2 shadow-sm"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run validation
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
