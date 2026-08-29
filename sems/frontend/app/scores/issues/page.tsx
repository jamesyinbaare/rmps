"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Layers, Play } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import {
  getCurrentUser,
  getValidationIssues,
  getAllExams,
  getAllSchools,
  getAllSubjects,
  getBatchSummary,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueStatus,
  ValidationIssueType,
  Exam,
  School,
  Subject,
  BatchSummaryResponse,
} from "@/types/document";
import { ValidationIssueWorkspace } from "@/components/ValidationIssueWorkspace";
import { ValidationIssuesDataTable } from "@/components/ValidationIssuesDataTable";
import {
  ValidationScopeFiltersBar,
  type BatchFilterValue,
} from "@/components/validation/ValidationScopeFiltersBar";
import {
  ValidationIssuesKpiStrip,
  type ValidationIssuesKpiData,
} from "@/components/validation/ValidationIssuesKpiStrip";
import {
  RunValidationDialog,
  type ValidationRunScope,
} from "@/components/validation/RunValidationDialog";
import type { SubjectTypeFilterValue } from "@/components/SubjectMultiSelectFilter";
import { Button } from "@/components/ui/button";

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

function parseBatchFilterParam(value: string | null): BatchFilterValue {
  if (value === "batched" || value === "unbatched") return value;
  return "all";
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
  const [batchFilter, setBatchFilter] = useState<BatchFilterValue>(
    parseBatchFilterParam(searchParams.get("batch_filter"))
  );

  const [batchSummary, setBatchSummary] = useState<BatchSummaryResponse | null>(null);
  const [kpiData, setKpiData] = useState<ValidationIssuesKpiData>({
    open: 0,
    missing: 0,
    invalid: 0,
    filtered: 0,
    filteredLabel: "Matching filters",
  });

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

  const filteredLabel = useMemo(() => {
    if (!statusFilter) return "All statuses";
    if (statusFilter === "pending") {
      if (issueTypeFilter === "missing_score") return "Open · missing";
      if (issueTypeFilter === "invalid_score") return "Open · invalid";
      return "Open · in view";
    }
    if (statusFilter === "resolved") return "Resolved";
    if (statusFilter === "ignored") return "Ignored";
    if (statusFilter === "skipped") return "Skipped";
    return "Matching filters";
  }, [statusFilter, issueTypeFilter]);

  const scopeFilters = useMemo(
    () => ({
      exam_id: selectedExamId,
      school_id: schoolId,
      subject_ids: subjectIds.length > 0 ? subjectIds : undefined,
      test_type: testTypeFilter,
      subject_type: subjectTypeFilter !== "ALL" ? subjectTypeFilter : undefined,
      batch_filter: batchFilter !== "all" ? batchFilter : undefined,
    }),
    [
      selectedExamId,
      schoolId,
      subjectIds,
      testTypeFilter,
      subjectTypeFilter,
      batchFilter,
    ]
  );

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResponse, openResponse, missingResponse, invalidResponse, summaryResponse] =
        await Promise.all([
          getValidationIssues({
            ...scopeFilters,
            page,
            page_size: pageSize,
            status: statusFilter ?? undefined,
            issue_type: issueTypeFilter ?? undefined,
          }),
          getValidationIssues({
            ...scopeFilters,
            page: 1,
            page_size: 1,
            status: "pending",
          }),
          getValidationIssues({
            ...scopeFilters,
            page: 1,
            page_size: 1,
            status: "pending",
            issue_type: "missing_score",
          }),
          getValidationIssues({
            ...scopeFilters,
            page: 1,
            page_size: 1,
            status: "pending",
            issue_type: "invalid_score",
          }),
          selectedExamId
            ? getBatchSummary(selectedExamId, { includeUnbatched: false })
            : Promise.resolve(null),
        ]);

      setIssues(listResponse.issues);
      setTotal(listResponse.total);
      setTotalPages(Math.ceil(listResponse.total / pageSize));
      setKpiData({
        open: openResponse.total,
        missing: missingResponse.total,
        invalid: invalidResponse.total,
        filtered: listResponse.total,
        filteredLabel,
      });
      setBatchSummary(summaryResponse);
      setCurrentIssueIndex((idx) => {
        if (idx !== null && idx >= listResponse.issues.length) {
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
    scopeFilters,
    statusFilter,
    issueTypeFilter,
    filteredLabel,
    selectedExamId,
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
        getAllSchools().catch(() => []),
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
    if (batchFilter !== "all") params.set("batch_filter", batchFilter);
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
    batchFilter,
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
    setBatchFilter("all");
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
    setKpiData((prev) => ({
      ...prev,
      open: Math.max(0, prev.open - 1),
      filtered: Math.max(0, prev.filtered - 1),
    }));
  };

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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border/70 bg-muted/20 px-4 py-2 sm:px-5">
            <div className="mx-auto max-w-[2000px]">
              <ValidationIssuesKpiStrip
                kpis={kpiData}
                batchSummary={batchSummary}
                examSelected={!!selectedExamId}
                loading={loading}
              />
            </div>
          </div>

          <div className="shrink-0 border-b border-border/70 bg-background px-4 py-2 sm:px-5">
            <div className="mx-auto max-w-[2000px]">
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
                batchFilter={batchFilter}
                onBatchFilterChange={(value) => {
                  setBatchFilter(value);
                  resetPage();
                }}
                loading={loadingFilterOptions}
                onRefresh={() => void loadIssues()}
                refreshing={loading}
                onClear={handleClearFilters}
                trailing={
                  <>
                    <Button
                      onClick={() => setRunDialogOpen(true)}
                      size="sm"
                      className="h-9 gap-1.5 shadow-sm"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Run validation
                    </Button>
                    {selectedExamId && kpiData.open > 0 && (
                      <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
                        <Link href={batchesHref}>
                          <Layers className="h-3.5 w-3.5" />
                          Prepare batches
                          <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                        </Link>
                      </Button>
                    )}
                  </>
                }
              />
            </div>
          </div>

          <section className="mx-4 mb-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm sm:mx-5 sm:mb-4">
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
          allowDownload
        />
      </div>
    </DashboardLayout>
  );
}
