"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ValidationIssueWorkspace } from "@/components/ValidationIssueWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAllExams,
  getMyValidationStats,
  getValidationIssues,
  listMyBatches,
  listSubjects,
} from "@/lib/api";
import type {
  ClerkBatchItem,
  Exam,
  MyValidationStats,
  Subject,
  SubjectScoreValidationIssue,
} from "@/types/document";

function getTestTypeLabel(testType: number) {
  switch (testType) {
    case 1:
      return "Obj";
    case 2:
      return "Essay";
    case 3:
      return "Pract";
    default:
      return `${testType}`;
  }
}

function getFieldNameLabel(fieldName: string) {
  switch (fieldName) {
    case "obj_raw_score":
      return "Objectives Score";
    case "essay_raw_score":
      return "Essay Score";
    case "pract_raw_score":
      return "Practical Score";
    default:
      return fieldName.replace(/_raw_score$/, "").replace(/_/g, " ");
  }
}

function getIssueTypeLabel(issueType: string) {
  return issueType.replace(/_/g, " ");
}

type DocFilter = "all" | "doc" | "nod";
type AllocTab = "in_progress" | "completed";

export default function ClerkDashboardPage() {
  const [stats, setStats] = useState<MyValidationStats | null>(null);
  const [batches, setBatches] = useState<ClerkBatchItem[]>([]);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<AllocTab>("in_progress");
  const [docFilter, setDocFilter] = useState<DocFilter>("all");
  const [examIdFilter, setExamIdFilter] = useState<number | null>(null);
  const [subjectIdFilter, setSubjectIdFilter] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);

  const [activeBatch, setActiveBatch] = useState<ClerkBatchItem | null>(null);
  const [batchIssues, setBatchIssues] = useState<SubjectScoreValidationIssue[]>([]);
  const [batchIssuesLoading, setBatchIssuesLoading] = useState(false);
  const [batchIssuesError, setBatchIssuesError] = useState<string | null>(null);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [currentIssueIndex, setCurrentIssueIndex] = useState<number | null>(null);

  const quotaBlocked = (stats?.quota_remaining ?? 1) <= 0;

  const loadStats = useCallback(async () => {
    try {
      const data = await getMyValidationStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listMyBatches({
        status: "all",
        exam_id: examIdFilter || undefined,
        subject_id: subjectIdFilter || undefined,
        has_document:
          docFilter === "all" ? undefined : docFilter === "doc" ? true : false,
      });
      setBatches(response.batches);
      setInProgressCount(response.in_progress_count);
      setCompletedCount(response.completed_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batches");
      setBatches([]);
      setInProgressCount(0);
      setCompletedCount(0);
    } finally {
      setLoading(false);
    }
  }, [docFilter, examIdFilter, subjectIdFilter]);

  const loadBatchIssues = useCallback(
    async (batchId: number, pendingOnly: boolean) => {
      setBatchIssuesLoading(true);
      setBatchIssuesError(null);
      try {
        const response = await getValidationIssues({
          status: pendingOnly ? "pending" : undefined,
          batch_id: batchId,
          page: 1,
          page_size: 1000,
        });
        setBatchIssues(response.issues);
        return response.issues;
      } catch (err) {
        setBatchIssuesError(err instanceof Error ? err.message : "Failed to load batch issues");
        setBatchIssues([]);
        return [];
      } finally {
        setBatchIssuesLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadStats();
    void loadBatches();
  }, [loadStats, loadBatches]);

  useEffect(() => {
    const loadFilterOptions = async () => {
      setLoadingFilterOptions(true);
      try {
        const allSubjects: Subject[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const subjectsData = await listSubjects(page, 100);
          allSubjects.push(...subjectsData);
          hasMore = subjectsData.length === 100;
          page++;
        }
        const examsData = await getAllExams().catch(() => []);
        setExams(Array.isArray(examsData) ? examsData : []);
        setSubjects(allSubjects);
      } catch {
        toast.error("Failed to load filters");
      } finally {
        setLoadingFilterOptions(false);
      }
    };
    void loadFilterOptions();
  }, []);

  const inProgressBatches = useMemo(
    () => batches.filter((b) => b.progress_status === "in_progress"),
    [batches]
  );
  const completedBatches = useMemo(
    () => batches.filter((b) => b.progress_status === "completed"),
    [batches]
  );

  const openBatchWork = async (batch: ClerkBatchItem) => {
    const isInProgress = batch.progress_status === "in_progress";
    setActiveBatch(batch);
    setWorkspaceOpen(false);
    setCurrentIssueIndex(null);
    const issues = await loadBatchIssues(batch.id, isInProgress);
    if (isInProgress) {
      setActiveBatch((prev) =>
        prev && prev.id === batch.id
          ? {
              ...prev,
              pending_count: issues.length,
              done_count: Math.max(0, (batch.total_count || issues.length) - issues.length),
              total_count: batch.total_count || batch.pending_count + batch.done_count,
            }
          : prev
      );
      const canAutoOpen = issues.length > 0 && !quotaBlocked;
      if (canAutoOpen) {
        setCurrentIssueIndex(0);
        setWorkspaceOpen(true);
      }
    }
  };

  const exitWorkMode = () => {
    setActiveBatch(null);
    setBatchIssues([]);
    setBatchIssuesError(null);
    setWorkspaceOpen(false);
    setCurrentIssueIndex(null);
    void loadBatches();
    void loadStats();
  };

  const openIssueAt = (index: number) => {
    if (quotaBlocked) {
      toast.error("Daily resolve quota reached");
      return;
    }
    if (index < 0 || index >= batchIssues.length) return;
    setCurrentIssueIndex(index);
    setWorkspaceOpen(true);
  };

  const handleContinueResolving = () => {
    if (quotaBlocked) {
      toast.error("Daily resolve quota reached — ask a registrar for an override");
      return;
    }
    if (batchIssues.length === 0) {
      toast.message("No pending issues left in this batch");
      return;
    }
    openIssueAt(0);
  };

  const handleHandled = (issueId: number) => {
    setBatchIssues((prev) => {
      const next = prev.filter((issue) => issue.id !== issueId);
      if (next.length === 0) {
        toast.success("Batch complete — all issues resolved");
        setTimeout(() => {
          setActiveBatch(null);
          setWorkspaceOpen(false);
          setCurrentIssueIndex(null);
          void loadBatches();
          void loadStats();
        }, 400);
      } else {
        setActiveBatch((prevBatch) =>
          prevBatch
            ? {
                ...prevBatch,
                pending_count: next.length,
                done_count: prevBatch.done_count + 1,
              }
            : prevBatch
        );
      }
      return next;
    });
    void loadStats();
  };

  if (activeBatch) {
    const isInProgress = activeBatch.progress_status === "in_progress";
    const total = Math.max(
      activeBatch.total_count,
      activeBatch.done_count + activeBatch.pending_count,
      batchIssues.length,
      1
    );
    const done = isInProgress
      ? Math.max(0, total - batchIssues.length)
      : activeBatch.done_count || batchIssues.length;
    const pct = Math.min(100, Math.round((done / total) * 100));

    return (
      <DashboardLayout title="Batch work">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title={activeBatch.name} showSearch={false} />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-6 py-8 space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 min-w-0">
                  <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={exitWorkMode}>
                    <ArrowLeft className="h-4 w-4" />
                    Back to allocations
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight truncate">
                      {activeBatch.name}
                    </h1>
                    <Badge variant={activeBatch.has_document ? "default" : "secondary"}>
                      {activeBatch.has_document ? "DOC" : "NOD"}
                    </Badge>
                    {!isInProgress ? (
                      <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                        Completed
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[
                      activeBatch.exam_year,
                      activeBatch.subject_code,
                      getTestTypeLabel(activeBatch.test_type),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {activeBatch.subject_name ? ` · ${activeBatch.subject_name}` : ""}
                  </p>
                  <div className="max-w-md space-y-1.5 pt-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="tabular-nums font-medium">
                        {done} / {total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
                {isInProgress ? (
                  <Button
                    size="lg"
                    className="gap-2 shrink-0"
                    onClick={handleContinueResolving}
                    disabled={batchIssuesLoading || batchIssues.length === 0 || quotaBlocked}
                  >
                    {batchIssuesLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Continue resolving
                  </Button>
                ) : null}
              </div>

              {quotaBlocked && isInProgress && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                  Daily quota reached
                  {stats ? ` (${stats.resolved_today}/${stats.quota_limit})` : ""}. Ask a
                  registrar for an override.
                </div>
              )}

              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {isInProgress
                    ? `Remaining · ${batchIssues.length}`
                    : `Issues · ${batchIssues.length}`}
                </h2>
                {batchIssuesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : batchIssuesError ? (
                  <Card>
                    <CardContent className="flex items-center gap-2 py-8 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {batchIssuesError}
                    </CardContent>
                  </Card>
                ) : batchIssues.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      <p className="font-medium text-foreground">
                        {isInProgress ? "Batch complete" : "No issues in this batch"}
                      </p>
                      <Button variant="outline" onClick={exitWorkMode}>
                        Back to allocations
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <ul className="rounded-lg border divide-y">
                    {batchIssues.map((issue, index) => {
                      const canResolve = isInProgress && issue.status === "pending";
                      return (
                        <li key={issue.id}>
                          <button
                            type="button"
                            disabled={!canResolve}
                            onClick={() => {
                              if (canResolve) openIssueAt(index);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-4 disabled:opacity-80 disabled:hover:bg-transparent disabled:cursor-default"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold tabular-nums truncate">
                                {issue.candidate_index_number || "No index"}
                                {issue.candidate_name ? (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    · {issue.candidate_name}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                                {getFieldNameLabel(issue.field_name)} ·{" "}
                                {getIssueTypeLabel(issue.issue_type)}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0 capitalize">
                              {issue.status === "pending"
                                ? getIssueTypeLabel(issue.issue_type)
                                : issue.status}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </main>
        </div>

        <ValidationIssueWorkspace
          open={workspaceOpen}
          onOpenChange={setWorkspaceOpen}
          issues={batchIssues}
          currentIndex={currentIssueIndex}
          onCurrentIndexChange={setCurrentIssueIndex}
          onHandled={handleHandled}
          resolvedTodayHint={stats?.resolved_today}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="My Allocations">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="My Allocations" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-8">
            <section className="space-y-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">My batch allocations</h1>
                <p className="text-muted-foreground mt-1">
                  Open a batch to resolve remaining issues. Enter to resolve, Ctrl+I to ignore.
                </p>
              </div>

              {quotaBlocked && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                  Daily quota reached
                  {stats ? ` (${stats.resolved_today}/${stats.quota_limit})` : ""}. Ask a
                  registrar for an override.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatTile
                  label="Assigned pending"
                  value={stats?.assigned_pending_count ?? 0}
                  accent="text-amber-600"
                  loading={!stats && loading}
                />
                <StatTile
                  label="Resolved today"
                  value={stats?.resolved_today ?? 0}
                  accent="text-emerald-600"
                  loading={!stats}
                />
                <StatTile
                  label="Quota left"
                  value={stats?.quota_remaining ?? 0}
                  accent={quotaBlocked ? "text-destructive" : "text-emerald-600"}
                  loading={!stats}
                  hint={
                    stats
                      ? `${stats.resolved_today}/${stats.quota_limit}${
                          stats.quota_overridden ? " · override" : ""
                        }`
                      : undefined
                  }
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-end">
                <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                      {filtersOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-2">
                      <SearchableSelect
                        options={[
                          { value: "doc", label: "DOC only" },
                          { value: "nod", label: "NOD only" },
                        ]}
                        value={docFilter === "all" ? "all" : docFilter}
                        onValueChange={(value) => {
                          if (value === "all" || value === "") setDocFilter("all");
                          else if (value === "doc" || value === "nod") setDocFilter(value);
                        }}
                        placeholder="DOC / NOD"
                        allowAll
                        allLabel="All streams"
                      />
                      <SearchableSelect
                        options={exams.map((exam) => ({
                          value: exam.id,
                          label: `${exam.exam_type} · ${exam.series} ${exam.year}`,
                        }))}
                        value={examIdFilter ?? "all"}
                        onValueChange={(value) =>
                          setExamIdFilter(
                            value === "all" || value === ""
                              ? null
                              : typeof value === "number"
                                ? value
                                : Number(value)
                          )
                        }
                        placeholder="All exams"
                        disabled={loadingFilterOptions}
                        allowAll
                        allLabel="All exams"
                      />
                      <SearchableSelect
                        options={subjects.map((subject) => ({
                          value: subject.id,
                          label: `${subject.code} · ${subject.name}`,
                        }))}
                        value={subjectIdFilter ?? "all"}
                        onValueChange={(value) =>
                          setSubjectIdFilter(
                            value === "all" || value === ""
                              ? null
                              : typeof value === "number"
                                ? value
                                : Number(value)
                          )
                        }
                        placeholder="All subjects"
                        disabled={loadingFilterOptions}
                        allowAll
                        allLabel="All subjects"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as AllocTab)}>
                <TabsList>
                  <TabsTrigger value="in_progress">
                    In progress
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      ({inProgressCount})
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Completed
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      ({completedCount})
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="in_progress" className="mt-4">
                  <BatchCardGrid
                    batches={inProgressBatches}
                    loading={loading}
                    error={error}
                    emptyTitle="No batches assigned yet"
                    emptyDescription="When a registrar assigns batches to you, they will show up here."
                    mode="in_progress"
                    onOpen={openBatchWork}
                    quotaBlocked={quotaBlocked}
                  />
                </TabsContent>
                <TabsContent value="completed" className="mt-4">
                  <BatchCardGrid
                    batches={completedBatches}
                    loading={loading}
                    error={error}
                    emptyTitle="No completed batches"
                    emptyDescription="Finished batches appear here once all issues are resolved or ignored."
                    mode="completed"
                    onOpen={openBatchWork}
                    quotaBlocked={quotaBlocked}
                  />
                </TabsContent>
              </Tabs>
            </section>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}

function BatchCardGrid({
  batches,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  mode,
  onOpen,
  quotaBlocked,
}: {
  batches: ClerkBatchItem[];
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription: string;
  mode: AllocTab;
  onOpen: (batch: ClerkBatchItem) => void;
  quotaBlocked: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }
  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          <p className="font-medium text-foreground">{emptyTitle}</p>
          <p className="text-sm text-center max-w-sm">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {batches.map((batch) => {
        const total = Math.max(batch.total_count, 1);
        const pct = Math.min(100, Math.round((batch.done_count / total) * 100));
        return (
          <div
            key={batch.id}
            className="rounded-lg border px-4 py-4 flex flex-col gap-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium truncate">{batch.name}</p>
                  <Badge variant={batch.has_document ? "default" : "secondary"} className="shrink-0">
                    {batch.has_document ? "DOC" : "NOD"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[batch.exam_year, batch.subject_code, getTestTypeLabel(batch.test_type)]
                    .filter(Boolean)
                    .join(" · ")}
                  {batch.subject_name ? ` · ${batch.subject_name}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant={mode === "completed" ? "outline" : "default"}
                className="shrink-0 gap-1.5"
                disabled={mode === "in_progress" && quotaBlocked && batch.pending_count > 0}
                onClick={() => onOpen(batch)}
              >
                {mode === "in_progress" ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Continue
                  </>
                ) : (
                  "Review"
                )}
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {mode === "in_progress"
                    ? `${batch.pending_count} remaining`
                    : "All clear"}
                </span>
                <span className="tabular-nums">
                  {batch.done_count} / {batch.total_count}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            {batch.assigned_at ? (
              <p className="text-xs text-muted-foreground">
                Assigned {format(new Date(batch.assigned_at), "MMM d, HH:mm")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  loading,
  hint,
}: {
  label: string;
  value: number;
  accent?: string;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-16 mt-1" />
      ) : (
        <>
          <p className={`text-2xl font-semibold tabular-nums mt-1 ${accent ?? ""}`}>{value}</p>
          {hint ? <p className="text-xs text-muted-foreground mt-0.5">{hint}</p> : null}
        </>
      )}
    </div>
  );
}
