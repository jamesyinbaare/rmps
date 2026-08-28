"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  getCurrentUser,
  getValidationIssues,
  getAllExams,
  listSchools,
  getAllSubjects,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueStatus,
  ValidationIssueType,
  Exam,
  School,
  Subject,
} from "@/types/document";
import { Play, AlertCircle, ArrowRight, Layers } from "lucide-react";
import { ValidationIssueWorkspace } from "@/components/ValidationIssueWorkspace";
import { ValidationIssuesDataTable } from "@/components/ValidationIssuesDataTable";
import { ValidationScopeFiltersBar } from "@/components/validation/ValidationScopeFiltersBar";
import {
  RunValidationDialog,
  type ValidationRunScope,
} from "@/components/validation/RunValidationDialog";
import type { SubjectTypeFilterValue } from "@/components/SubjectMultiSelectFilter";

function parseSubjectIdsParam(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => parseInt(part.trim(), 10))
    .filter((id) => !Number.isNaN(id));
}

function parseOptionalInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseSubjectTypeParam(value: string | null): SubjectTypeFilterValue {
  if (value === "CORE" || value === "ELECTIVE") return value;
  return "ALL";
}

function parseStatusParam(value: string | null): ValidationIssueStatus | null {
  if (
    value === "pending" ||
    value === "resolved" ||
    value === "ignored" ||
    value === "skipped"
  ) {
    return value;
  }
  return null;
}

function parseIssueTypeParam(value: string | null): ValidationIssueType | null {
  if (value === "missing_score" || value === "invalid_score") return value;
  return null;
}

export default function ValidationIssuesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastUrlQueryRef = useRef<string | null>(null);

  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [issues, setIssues] = useState<SubjectScoreValidationIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(
    parseOptionalInt(searchParams.get("exam_id"))
  );
  const [schoolId, setSchoolId] = useState<number | undefined>(
    parseOptionalInt(searchParams.get("school_id"))
  );
  const [subjectIds, setSubjectIds] = useState<number[]>(
    parseSubjectIdsParam(searchParams.get("subject_ids"))
  );
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilterValue>(
    parseSubjectTypeParam(searchParams.get("subject_type"))
  );
  const [testTypeFilter, setTestTypeFilter] = useState<number | undefined>(
    parseOptionalInt(searchParams.get("test_type"))
  );
  const [statusFilter, setStatusFilter] = useState<ValidationIssueStatus | null>(
    parseStatusParam(searchParams.get("status")) ?? "pending"
  );
  const [issueTypeFilter, setIssueTypeFilter] = useState<ValidationIssueType | null>(
    parseIssueTypeParam(searchParams.get("issue_type"))
  );
  const [batchIdFilter, setBatchIdFilter] = useState<number | undefined>(
    parseOptionalInt(searchParams.get("batch_id"))
  );

  const [runDialogOpen, setRunDialogOpen] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [currentIssueIndex, setCurrentIssueIndex] = useState<number | null>(null);

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

  const validationRunScope = useMemo<Partial<ValidationRunScope>>(
    () => ({
      examId: selectedExamId ?? null,
      schoolId: schoolId ?? null,
      subjectIds,
      subjectType: subjectTypeFilter,
      testTypes: testTypeFilter ? [testTypeFilter] : [1, 2, 3],
    }),
    [selectedExamId, schoolId, subjectIds, subjectTypeFilter, testTypeFilter]
  );

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getValidationIssues({
        page,
        page_size: pageSize,
        exam_id: selectedExamId,
        school_id: schoolId,
        subject_ids: subjectIds.length > 0 ? subjectIds : undefined,
        status: statusFilter ?? undefined,
        issue_type: issueTypeFilter ?? undefined,
        test_type: testTypeFilter,
        subject_type: subjectTypeFilter !== "ALL" ? subjectTypeFilter : undefined,
        batch_id: batchIdFilter,
      });
      setIssues(response.issues);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / pageSize));
      setCurrentIssueIndex((idx) => {
        if (idx !== null && idx >= response.issues.length) {
          setIssueModalOpen(false);
          return null;
        }
        return idx;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load validation issues");
      console.error("Error loading validation issues:", err);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    selectedExamId,
    schoolId,
    subjectIds,
    statusFilter,
    issueTypeFilter,
    testTypeFilter,
    subjectTypeFilter,
    batchIdFilter,
  ]);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        if (normalizeRole(user.role) === "DATACLERK") {
          router.replace("/clerk");
          return;
        }
        setAuthorized(true);
      } catch {
        router.replace("/login");
      } finally {
        setAuthChecked(true);
      }
    };
    void checkAccess();
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    void loadIssues();
  }, [authorized, loadIssues]);

  const loadFilterOptions = useCallback(async () => {
    setLoadingFilterOptions(true);
    try {
      const [examsData, schoolsData, subjectsData] = await Promise.all([
        getAllExams().catch(() => []),
        listSchools(1, 100).catch(() => []),
        getAllSubjects().catch(() => []),
      ]);
      setExams(Array.isArray(examsData) ? examsData : []);
      setSchools(Array.isArray(schoolsData) ? schoolsData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (err) {
      console.error("Error loading filter options:", err);
    } finally {
      setLoadingFilterOptions(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadFilterOptions();
  }, [authorized, loadFilterOptions]);

  useEffect(() => {
    if (!authorized) return;
    const params = new URLSearchParams();
    if (selectedExamId) params.set("exam_id", String(selectedExamId));
    if (schoolId) params.set("school_id", String(schoolId));
    if (subjectIds.length) params.set("subject_ids", subjectIds.join(","));
    if (subjectTypeFilter !== "ALL") params.set("subject_type", subjectTypeFilter);
    if (testTypeFilter) params.set("test_type", String(testTypeFilter));
    if (statusFilter) params.set("status", statusFilter);
    if (issueTypeFilter) params.set("issue_type", issueTypeFilter);
    if (batchIdFilter) params.set("batch_id", String(batchIdFilter));
    const next = params.toString();
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/scores/issues${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    authorized,
    selectedExamId,
    schoolId,
    subjectIds,
    subjectTypeFilter,
    testTypeFilter,
    statusFilter,
    issueTypeFilter,
    batchIdFilter,
    router,
  ]);

  const resetPage = () => setPage(1);

  const parseNumericFilter = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") return undefined;
    return typeof value === "number" ? value : parseInt(String(value), 10);
  };

  const handleSubjectTypeFilterChange = (value: SubjectTypeFilterValue) => {
    setSubjectTypeFilter(value);
    if (value !== "ALL" && subjectIds.length > 0) {
      const allowed = new Set(subjects.filter((s) => s.subject_type === value).map((s) => s.id));
      const pruned = subjectIds.filter((id) => allowed.has(id));
      setSubjectIds(pruned);
    }
    resetPage();
  };

  const handleClearFilters = () => {
    setSelectedExamId(undefined);
    setSchoolId(undefined);
    setSubjectIds([]);
    setSubjectTypeFilter("ALL");
    setTestTypeFilter(undefined);
    setStatusFilter("pending");
    setIssueTypeFilter(null);
    setBatchIdFilter(undefined);
    resetPage();
    lastUrlQueryRef.current = "";
    router.replace("/scores/issues?status=pending", { scroll: false });
  };

  const handleOpenIssueModal = (_issue: SubjectScoreValidationIssue, index: number) => {
    setCurrentIssueIndex(index);
    setIssueModalOpen(true);
  };

  const handleIssueHandled = (issueId: number) => {
    setIssues((prev) => prev.filter((issue) => issue.id !== issueId));
    setTotal((prev) => Math.max(0, prev - 1));
  };

  const openIssuesInScope = statusFilter === "pending" ? total : null;
  const batchesHref = selectedExamId
    ? `/clerk/batches?exam_id=${selectedExamId}`
    : "/clerk/batches";

  if (!authChecked || !authorized) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            <div className="flex min-w-0 items-baseline gap-3">
              <span>Validation Issues</span>
              <span className="hidden truncate text-sm font-normal text-muted-foreground lg:inline">
                Review missing and invalid scores, then route work to clerks.
              </span>
            </div>
          }
        />

        <div className="mx-auto flex w-full max-w-[2000px] min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
          <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="border-b border-border/70 bg-gradient-to-r from-muted/50 via-background to-background px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-[140px] flex-col rounded-lg border border-border/70 bg-background/90 px-4 py-3 shadow-sm">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {openIssuesInScope != null ? "Open in scope" : "Issues in scope"}
                    </span>
                    <span className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
                      {(openIssuesInScope ?? total).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex min-w-[120px] flex-col rounded-lg border border-border/70 bg-background/60 px-4 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Showing
                    </span>
                    <span className="mt-0.5 text-lg font-medium tabular-nums">
                      {issues.length.toLocaleString()}
                      <span className="text-sm font-normal text-muted-foreground"> / page</span>
                    </span>
                  </div>
                  {selectedExamId && openIssuesInScope != null && openIssuesInScope > 0 && (
                    <Link
                      href={batchesHref}
                      className="group inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Layers className="h-4 w-4" />
                      Prepare batches
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>

                <Button
                  onClick={() => setRunDialogOpen(true)}
                  className="h-10 shrink-0 gap-2 shadow-sm"
                >
                  <Play className="h-4 w-4" />
                  Run validation
                </Button>
              </div>
            </div>

            <div className="px-4 py-4 sm:px-5">
              <ValidationScopeFiltersBar
                examOptions={examOptions}
                selectedExamId={selectedExamId}
                onExamChange={(value) => {
                  setSelectedExamId(parseNumericFilter(value));
                  resetPage();
                }}
                schools={schools}
                subjects={subjects}
                schoolId={schoolId}
                onSchoolChange={(value) => {
                  setSchoolId(parseNumericFilter(value));
                  resetPage();
                }}
                subjectIds={subjectIds}
                onSubjectIdsChange={(ids) => {
                  setSubjectIds(ids);
                  resetPage();
                }}
                subjectTypeFilter={subjectTypeFilter}
                onSubjectTypeFilterChange={handleSubjectTypeFilterChange}
                testType={testTypeFilter}
                onTestTypeChange={(value) => {
                  setTestTypeFilter(value);
                  resetPage();
                }}
                statusFilter={statusFilter}
                onStatusFilterChange={(value) => {
                  setStatusFilter(value);
                  resetPage();
                }}
                issueTypeFilter={issueTypeFilter}
                onIssueTypeFilterChange={(value) => {
                  setIssueTypeFilter(value);
                  resetPage();
                }}
                batchId={batchIdFilter}
                onBatchIdChange={(value) => {
                  setBatchIdFilter(value);
                  resetPage();
                }}
                loading={loadingFilterOptions}
                onRefresh={() => void loadIssues()}
                refreshing={loading}
                onClear={handleClearFilters}
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            {!loading && !error && issues.length === 0 && (
              <div className="flex items-center gap-2 border-b border-border/70 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No issues match the current filters. Adjust scope above or run validation to scan for
                new problems.
              </div>
            )}
            <ValidationIssuesDataTable
              issues={issues}
              loading={loading}
              error={error}
              onRowClick={handleOpenIssueModal}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                resetPage();
              }}
              currentPage={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          </section>
        </div>

        <RunValidationDialog
          open={runDialogOpen}
          onOpenChange={setRunDialogOpen}
          exams={exams}
          schools={schools}
          subjects={subjects}
          loadingOptions={loadingFilterOptions}
          initialScope={validationRunScope}
          onCompleted={() => loadIssues()}
        />

        <ValidationIssueWorkspace
          open={issueModalOpen}
          onOpenChange={setIssueModalOpen}
          issues={issues}
          currentIndex={currentIssueIndex}
          onCurrentIndexChange={setCurrentIssueIndex}
          onHandled={handleIssueHandled}
          allowIgnore
        />
      </div>
    </DashboardLayout>
  );
}
