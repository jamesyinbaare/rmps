"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Inbox,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getMyValidationStats,
  getValidationIssues,
  listMyBatches,
} from "@/lib/api";
import type {
  ClerkBatchItem,
  MyValidationStats,
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

function DocNodBadge({ hasDocument }: { hasDocument: boolean }) {
  const label = hasDocument ? "DOC" : "NOD";
  const title = hasDocument
    ? "Has score sheet image"
    : "No document — enter from paper or other source";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={hasDocument ? "default" : "secondary"}
          className="shrink-0 cursor-help"
          title={title}
        >
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">{title}</TooltipContent>
    </Tooltip>
  );
}

function sortInProgress(batches: ClerkBatchItem[]) {
  return [...batches].sort((a, b) => {
    if (b.pending_count !== a.pending_count) {
      return b.pending_count - a.pending_count;
    }
    const aTime = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
    const bTime = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
    return bTime - aTime;
  });
}

type AllocTab = "in_progress" | "completed";

function formatActiveExam(batch: ClerkBatchItem | null): string | null {
  if (!batch) return null;
  const parts = [batch.exam_type, batch.exam_series, batch.exam_year != null ? String(batch.exam_year) : null]
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return batch.exam_year != null ? `Exam ${batch.exam_year}` : null;
}

export default function ClerkDashboardPage() {
  const [stats, setStats] = useState<MyValidationStats | null>(null);
  const [batches, setBatches] = useState<ClerkBatchItem[]>([]);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<AllocTab>("in_progress");
  const [tabAutoSet, setTabAutoSet] = useState(false);

  const [activeBatch, setActiveBatch] = useState<ClerkBatchItem | null>(null);
  const [batchIssues, setBatchIssues] = useState<SubjectScoreValidationIssue[]>([]);
  const [batchIssuesLoading, setBatchIssuesLoading] = useState(false);
  const [batchIssuesError, setBatchIssuesError] = useState<string | null>(null);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [currentIssueIndex, setCurrentIssueIndex] = useState<number | null>(null);

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
      const response = await listMyBatches({ status: "all" });
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
  }, []);

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

  const inProgressBatches = useMemo(
    () => sortInProgress(batches.filter((b) => b.progress_status === "in_progress")),
    [batches]
  );
  const completedBatches = useMemo(
    () => batches.filter((b) => b.progress_status === "completed"),
    [batches]
  );

  const activeExamLabel = useMemo(() => {
    const sample = inProgressBatches[0] ?? completedBatches[0] ?? batches[0] ?? null;
    return formatActiveExam(sample);
  }, [batches, inProgressBatches, completedBatches]);

  // Land on Completed when In progress is empty (once per load cycle)
  useEffect(() => {
    if (loading || tabAutoSet) return;
    if (inProgressCount === 0 && completedCount > 0) {
      setTab("completed");
    } else {
      setTab("in_progress");
    }
    setTabAutoSet(true);
  }, [loading, inProgressCount, completedCount, tabAutoSet]);

  const resumeBatch = useMemo(() => {
    if (inProgressBatches.length === 0) return null;
    return inProgressBatches[0];
  }, [inProgressBatches]);

  const resumeLabel = useMemo(() => {
    if (!resumeBatch) return "Resume next";
    if (inProgressBatches.length === 1) {
      return `Continue · ${resumeBatch.name}`;
    }
    return "Resume next";
  }, [resumeBatch, inProgressBatches.length]);

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
      if (issues.length > 0) {
        setCurrentIssueIndex(0);
        setWorkspaceOpen(true);
      }
    }
  };

  const handleResumeNext = () => {
    if (!resumeBatch) return;
    void openBatchWork(resumeBatch);
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
    if (index < 0 || index >= batchIssues.length) return;
    setCurrentIssueIndex(index);
    setWorkspaceOpen(true);
  };

  const handleContinueResolving = () => {
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
                    Back to queue
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight truncate">
                      {activeBatch.name}
                    </h1>
                    <DocNodBadge hasDocument={activeBatch.has_document} />
                    {!isInProgress ? (
                      <Badge variant="outline" className="text-primary border-primary/30">
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
                        className="h-full rounded-full bg-primary transition-all"
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
                    disabled={batchIssuesLoading || batchIssues.length === 0}
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
                    <CardContent className="flex flex-col items-center gap-3 py-8">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {batchIssuesError}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void loadBatchIssues(activeBatch.id, isInProgress)
                        }
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                ) : batchIssues.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 text-primary" />
                      <p className="font-medium text-foreground">
                        {isInProgress ? "Batch complete" : "No issues in this batch"}
                      </p>
                      <Button variant="outline" onClick={exitWorkMode}>
                        Back to queue
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
    <DashboardLayout title="My Work">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="My Work" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-6">
            <section className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-muted-foreground text-sm max-w-xl">
                  Open a batch to resolve score issues and enter values from the score sheet.
                </p>
                <Button
                  size="lg"
                  className="gap-2 shrink-0"
                  onClick={handleResumeNext}
                  disabled={!resumeBatch || loading}
                >
                  <Play className="h-4 w-4" />
                  <span className="truncate max-w-[16rem]">{resumeLabel}</span>
                </Button>
              </div>

              <div className="rounded-lg border px-4 py-3">
                {stats ? (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Resolved today · </span>
                      <span className="font-semibold tabular-nums">
                        {stats.resolved_today}
                      </span>
                    </p>
                    <p className="text-muted-foreground tabular-nums">
                      {stats.assigned_pending_count} pending assigned
                    </p>
                    <p className="text-muted-foreground tabular-nums">
                      Week · {stats.resolved_week}
                    </p>
                  </div>
                ) : (
                  <Skeleton className="h-5 w-64" />
                )}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 min-h-8">
                {activeExamLabel ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Active exam · </span>
                    <span className="font-medium">{activeExamLabel}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Open a batch to resolve issues and enter scores from the sheet.
                  </p>
                )}
                <span className="text-xs text-muted-foreground">
                  DOC = score sheet · NOD = no document
                </span>
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
                  <BatchList
                    batches={inProgressBatches}
                    loading={loading}
                    error={error}
                    emptyTitle="No batches assigned"
                    emptyDescription="When a registrar assigns batches to you, they will show up here."
                    emptyIcon="inbox"
                    mode="in_progress"
                    onOpen={openBatchWork}
                    onRetry={() => void loadBatches()}
                  />
                </TabsContent>
                <TabsContent value="completed" className="mt-4">
                  <BatchList
                    batches={completedBatches}
                    loading={loading}
                    error={error}
                    emptyTitle="No completed batches"
                    emptyDescription="Finished batches appear here once all issues are resolved."
                    emptyIcon="check"
                    mode="completed"
                    onOpen={openBatchWork}
                    onRetry={() => void loadBatches()}
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

function BatchList({
  batches,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  mode,
  onOpen,
  onRetry,
}: {
  batches: ClerkBatchItem[];
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: "inbox" | "check";
  mode: AllocTab;
  onOpen: (batch: ClerkBatchItem) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border divide-y">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          {emptyIcon === "inbox" ? (
            <Inbox className="h-8 w-8 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-primary" />
          )}
          <p className="font-medium text-foreground">{emptyTitle}</p>
          <p className="text-sm text-center max-w-sm">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="rounded-lg border divide-y">
      {/* Header — desktop */}
      <li className="hidden md:grid md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_5.5rem_7rem_6.5rem_6.5rem] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30">
        <span>Batch</span>
        <span>Stream</span>
        <span>Subject</span>
        <span className="text-right">Remaining</span>
        <span>Progress</span>
        <span>Assigned</span>
        <span className="text-right">Action</span>
      </li>
      {batches.map((batch) => {
        const total = Math.max(batch.total_count, 1);
        const pct = Math.min(100, Math.round((batch.done_count / total) * 100));
        const meta = [
          batch.exam_year,
          batch.subject_code,
          getTestTypeLabel(batch.test_type),
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={batch.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(batch)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(batch);
                }
              }}
              className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_5.5rem_7rem_6.5rem_6.5rem] md:items-center md:gap-3 flex flex-col gap-2"
            >
              <div className="min-w-0 flex items-center gap-2 md:contents">
                <p className="font-medium truncate min-w-0">{batch.name}</p>
                <div className="md:justify-self-start">
                  <DocNodBadge hasDocument={batch.has_document} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate md:text-sm">
                {meta}
                {batch.subject_name ? (
                  <span className="hidden lg:inline"> · {batch.subject_name}</span>
                ) : null}
              </p>
              <p className="text-sm tabular-nums text-right md:text-right">
                {mode === "in_progress" ? (
                  <span className="font-medium">{batch.pending_count}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                <span className="md:hidden text-muted-foreground text-xs ml-1">
                  remaining · {batch.done_count}/{batch.total_count}
                </span>
              </p>
              <div className="space-y-1 hidden md:block">
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>
                    {batch.done_count}/{batch.total_count}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums hidden md:block">
                {batch.assigned_at
                  ? format(new Date(batch.assigned_at), "MMM d, HH:mm")
                  : "—"}
              </p>
              <div
                className="flex justify-end"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant={mode === "completed" ? "outline" : "default"}
                  className="shrink-0 gap-1.5"
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
