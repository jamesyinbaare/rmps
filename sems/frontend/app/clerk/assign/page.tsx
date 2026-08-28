"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import {
  AssignWorkFiltersBar,
  type AssignStreamFilter,
} from "@/components/clerk/AssignWorkFiltersBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assignIssueBatches,
  getClerkAssignPanel,
  listIssueBatches,
  releaseIssueBatches,
} from "@/lib/api";
import { useDataEntryExamScope } from "@/hooks/useDataEntryExamScope";
import type { SubjectTypeFilterValue } from "@/components/SubjectMultiSelectFilter";
import { cn } from "@/lib/utils";
import type { ClerkAssignPanelItem, IssueBatch } from "@/types/document";

type AssignTab = "all" | "unassigned" | "assigned";

function parseSubjectIdsParam(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => parseInt(part.trim(), 10))
    .filter((id) => !Number.isNaN(id));
}

function parseSubjectTypeParam(value: string | null): SubjectTypeFilterValue {
  if (value === "CORE" || value === "ELECTIVE") return value;
  return "ALL";
}

function parseOptionalInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function testTypeLabel(testType: number) {
  if (testType === 1) return "Paper 1";
  if (testType === 2) return "Paper 2";
  if (testType === 3) return "Paper 3";
  return `Type ${testType}`;
}

export default function AssignWorkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastUrlQueryRef = useRef<string | null>(null);
  const { loading, authorized, exams, subjects, examId, applyExamId } =
    useDataEntryExamScope({ path: "/clerk/assign" });

  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilterValue>("ALL");
  const [testType, setTestType] = useState<number | null>(null);
  const [streamFilter, setStreamFilter] = useState<AssignStreamFilter>("all");
  const [tab, setTab] = useState<AssignTab>("all");
  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<number>>(new Set());
  const [assignClerkId, setAssignClerkId] = useState("");
  const [clerks, setClerks] = useState<ClerkAssignPanelItem[]>([]);
  const [loadingClerks, setLoadingClerks] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmAssignOpen, setConfirmAssignOpen] = useState(false);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

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

  useEffect(() => {
    if (filtersHydrated || loading) return;

    const subjectIdsFromQuery = parseSubjectIdsParam(searchParams.get("subject_ids"));
    const legacySubjectId = parseOptionalInt(searchParams.get("subject_id"));
    const testTypeFromQuery = parseOptionalInt(searchParams.get("test_type"));
    const streamFromQuery = searchParams.get("stream");
    const clerkFromQuery = searchParams.get("clerk_id");

    setSubjectIds(
      subjectIdsFromQuery.length > 0
        ? subjectIdsFromQuery
        : legacySubjectId
          ? [legacySubjectId]
          : []
    );
    setSubjectTypeFilter(parseSubjectTypeParam(searchParams.get("subject_type")));
    setTestType(testTypeFromQuery);
    if (streamFromQuery === "doc" || streamFromQuery === "nod") {
      setStreamFilter(streamFromQuery);
    }
    if (clerkFromQuery) setAssignClerkId(clerkFromQuery);
    setFiltersHydrated(true);
  }, [filtersHydrated, loading, searchParams]);

  useEffect(() => {
    if (!authorized || !filtersHydrated) return;

    const params = new URLSearchParams();
    if (examId) params.set("exam_id", String(examId));
    if (subjectIds.length) params.set("subject_ids", subjectIds.join(","));
    if (subjectTypeFilter !== "ALL") params.set("subject_type", subjectTypeFilter);
    if (testType) params.set("test_type", String(testType));
    if (streamFilter !== "all") params.set("stream", streamFilter);
    if (assignClerkId) params.set("clerk_id", assignClerkId);

    const next = params.toString();
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    router.replace(`/clerk/assign${next ? `?${next}` : ""}`, { scroll: false });
  }, [
    authorized,
    filtersHydrated,
    examId,
    subjectIds,
    subjectTypeFilter,
    testType,
    streamFilter,
    assignClerkId,
    router,
  ]);

  const refreshBatches = useCallback(async () => {
    if (!examId) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);
    try {
      const data = await listIssueBatches({
        exam_id: examId,
        subject_ids: subjectIds.length > 0 ? subjectIds : undefined,
        subject_type: subjectTypeFilter !== "ALL" ? subjectTypeFilter : undefined,
        test_type: testType || undefined,
        has_document: streamFilter === "all" ? undefined : streamFilter === "doc",
      });
      setBatches(data.batches);
      setSelectedBatchIds(new Set());
    } finally {
      setLoadingBatches(false);
    }
  }, [examId, subjectIds, subjectTypeFilter, testType, streamFilter]);

  const refreshClerks = useCallback(async () => {
    setLoadingClerks(true);
    try {
      const data = await getClerkAssignPanel(examId || undefined);
      setClerks(data.clerks);
    } finally {
      setLoadingClerks(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!authorized || !filtersHydrated || !examId) return;
    void refreshBatches().catch((err) =>
      toast.error(err instanceof Error ? err.message : "Failed to refresh batches")
    );
  }, [authorized, filtersHydrated, examId, refreshBatches]);

  useEffect(() => {
    if (!authorized || !examId) return;
    void refreshClerks().catch((err) =>
      toast.error(err instanceof Error ? err.message : "Failed to refresh clerks")
    );
  }, [authorized, examId, refreshClerks]);

  const handleSubjectTypeFilterChange = (value: SubjectTypeFilterValue) => {
    setSubjectTypeFilter(value);
    if (value !== "ALL" && subjectIds.length > 0) {
      const allowed = new Set(subjects.filter((s) => s.subject_type === value).map((s) => s.id));
      setSubjectIds(subjectIds.filter((id) => allowed.has(id)));
    }
  };

  const handleClearFilters = () => {
    setSubjectIds([]);
    setSubjectTypeFilter("ALL");
    setTestType(null);
    setStreamFilter("all");
    lastUrlQueryRef.current = examId ? `exam_id=${examId}` : "";
    router.replace(examId ? `/clerk/assign?exam_id=${examId}` : "/clerk/assign", {
      scroll: false,
    });
  };

  const filteredBatches = useMemo(() => {
    if (tab === "unassigned") return batches.filter((b) => !b.assigned_to_user_id);
    if (tab === "assigned") return batches.filter((b) => !!b.assigned_to_user_id);
    return batches;
  }, [batches, tab]);

  const selectedBatches = useMemo(
    () => batches.filter((b) => selectedBatchIds.has(b.id)),
    [batches, selectedBatchIds]
  );
  const selectedUnassigned = selectedBatches.filter((b) => !b.assigned_to_user_id);
  const selectedAssigned = selectedBatches.filter((b) => !!b.assigned_to_user_id);

  const clerkRows = useMemo(() => {
    return [...clerks].sort(
      (a, b) =>
        a.assigned_pending_issues - b.assigned_pending_issues ||
        a.full_name.localeCompare(b.full_name)
    );
  }, [clerks]);

  const selectedClerk = clerks.find((q) => q.user_id === assignClerkId) ?? null;
  const selectedClerkActiveExams =
    selectedClerk?.active_exams ??
    (selectedClerk?.active_exam_label
      ? [
          {
            exam_id: selectedClerk.active_exam_id ?? 0,
            exam_label: selectedClerk.active_exam_label,
            assigned_batches: selectedClerk.assigned_batches,
            assigned_pending_issues: selectedClerk.assigned_pending_issues,
          },
        ]
      : []);

  const allVisibleSelected =
    filteredBatches.length > 0 &&
    filteredBatches.every((b) => selectedBatchIds.has(b.id));

  const batchesHref = examId
    ? `/clerk/batches?exam_id=${examId}`
    : "/clerk/batches";
  const clerksHref = "/clerk/clerks";

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedBatchIds((prev) => {
        const next = new Set(prev);
        for (const b of filteredBatches) next.delete(b.id);
        return next;
      });
    } else {
      setSelectedBatchIds((prev) => {
        const next = new Set(prev);
        for (const b of filteredBatches) next.add(b.id);
        return next;
      });
    }
  };

  const toggleBatch = (id: number) => {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (!assignClerkId || selectedUnassigned.length === 0) {
      toast.error("Select a clerk and at least one unassigned batch");
      return;
    }
    setAssigning(true);
    try {
      const result = await assignIssueBatches(
        selectedUnassigned.map((b) => b.id),
        assignClerkId
      );
      toast.success(
        `Assigned ${result.assigned_count} batch${result.assigned_count === 1 ? "" : "es"} to ${selectedClerk?.full_name ?? "clerk"}`
      );
      setConfirmAssignOpen(false);
      setSelectedBatchIds(new Set());
      await Promise.all([refreshBatches(), refreshClerks()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const handleReleaseSelected = async () => {
    if (selectedAssigned.length === 0) {
      toast.error("Select assigned batches to release");
      return;
    }
    setReleasing(true);
    try {
      const result = await releaseIssueBatches({
        batch_ids: selectedAssigned.map((b) => b.id),
      });
      toast.success(`Released ${result.released_count} batch(es)`);
      setConfirmReleaseOpen(false);
      setSelectedBatchIds(new Set());
      await Promise.all([refreshBatches(), refreshClerks()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Assign Work">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  const unassignedCount = batches.filter((b) => !b.assigned_to_user_id).length;
  const assignedCount = batches.filter((b) => !!b.assigned_to_user_id).length;

  return (
    <DashboardLayout title="Assign Work">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Assign Work" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6 pb-28">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Assign Work</h1>
                <p className="text-muted-foreground mt-1">
                  Review assigned and unassigned batches, then dispatch to a clerk.{" "}
                  <Link
                    href={batchesHref}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Prepare batches
                  </Link>
                </p>
              </div>
            </header>

            <section className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-sm sm:px-5">
              <AssignWorkFiltersBar
                examOptions={examOptions}
                selectedExamId={examId}
                onExamChange={(value) => {
                  setSubjectIds([]);
                  setSubjectTypeFilter("ALL");
                  applyExamId(value === "all" || value === "" ? null : Number(value));
                }}
                subjects={subjects}
                subjectIds={subjectIds}
                onSubjectIdsChange={setSubjectIds}
                subjectTypeFilter={subjectTypeFilter}
                onSubjectTypeFilterChange={handleSubjectTypeFilterChange}
                testType={testType}
                onTestTypeChange={setTestType}
                streamFilter={streamFilter}
                onStreamFilterChange={setStreamFilter}
                loading={loading}
                onRefresh={() => void refreshBatches()}
                refreshing={loadingBatches}
                onClear={handleClearFilters}
              />
            </section>

            {!examId ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select an examination to load batches.
              </div>
            ) : (
              <section className="grid grid-cols-1 xl:grid-cols-[minmax(260px,320px)_1fr] gap-4 min-h-[480px]">
                <aside className="rounded-xl border overflow-hidden flex flex-col min-h-[360px]">
                  <div className="px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                      <h2 className="font-medium">Assign to clerk</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lightest pending load first · clerks may hold multiple exams
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y">
                    {loadingClerks ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : clerkRows.length === 0 ? (
                      <div className="p-6 text-sm text-muted-foreground">
                        No active data clerks.{" "}
                        <Link href={clerksHref} className="underline">
                          Create one
                        </Link>
                      </div>
                    ) : (
                      clerkRows.map((q) => {
                        const selected = assignClerkId === q.user_id;
                        const activeExams =
                          q.active_exams ??
                          (q.active_exam_label
                            ? [
                                {
                                  exam_id: q.active_exam_id ?? 0,
                                  exam_label: q.active_exam_label,
                                  assigned_batches: q.assigned_batches,
                                  assigned_pending_issues: q.assigned_pending_issues,
                                },
                              ]
                            : []);
                        return (
                          <button
                            key={q.user_id}
                            type="button"
                            className={cn(
                              "w-full text-left px-4 py-3 transition-colors",
                              selected
                                ? "bg-primary/10 border-l-2 border-l-primary"
                                : "hover:bg-muted/50 border-l-2 border-l-transparent"
                            )}
                            onClick={() => setAssignClerkId(q.user_id)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{q.full_name}</span>
                              {selected ? (
                                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{q.assigned_batches} batches</span>
                              <span>{q.assigned_pending_issues} pending</span>
                              <span className="tabular-nums">
                                {q.resolved_today} today
                              </span>
                            </div>
                            {activeExams.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {activeExams.map((exam) => (
                                  <Badge
                                    key={exam.exam_id}
                                    variant="secondary"
                                    className="text-[10px] font-normal"
                                  >
                                    {exam.exam_label}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </aside>

                <div className="rounded-xl border overflow-hidden flex flex-col min-h-[360px]">
                  <div className="px-4 py-3 border-b bg-muted/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                      {(
                        [
                          ["all", `All (${batches.length})`],
                          ["unassigned", `Unassigned (${unassignedCount})`],
                          ["assigned", `Assigned (${assignedCount})`],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTab(key)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                            tab === key
                              ? "bg-background shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={filteredBatches.length === 0}
                      onClick={toggleSelectAll}
                    >
                      {allVisibleSelected ? "Clear selection" : "Select all"}
                    </Button>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {loadingBatches ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredBatches.length === 0 ? (
                      <div className="p-10 text-center text-sm text-muted-foreground space-y-2">
                        <p>
                          No batches in this view. Prepare batches first, then return here
                          to assign.
                        </p>
                        <Button asChild size="sm" variant="outline">
                          <Link href={batchesHref}>Prepare batches</Link>
                        </Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>Batch</TableHead>
                            <TableHead>Paper</TableHead>
                            <TableHead>Stream</TableHead>
                            <TableHead className="text-right">Issues</TableHead>
                            <TableHead>Assignee</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredBatches.map((b) => {
                            const subject = subjects.find((s) => s.id === b.subject_id);
                            const checked = selectedBatchIds.has(b.id);
                            return (
                              <TableRow
                                key={b.id}
                                className={cn(checked && "bg-muted/40")}
                                onClick={() => toggleBatch(b.id)}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleBatch(b.id)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{b.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {subject?.code ?? `Subject ${b.subject_id}`}
                                  </div>
                                </TableCell>
                                <TableCell>{testTypeLabel(b.test_type)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-normal">
                                    {b.has_document ? "DOC" : "NOD"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {b.issue_count}
                                </TableCell>
                                <TableCell>
                                  {b.assigned_to_name ? (
                                    <span className="text-sm">{b.assigned_to_name}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">
                                      Unassigned
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>

        {examId && (
          <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="container mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium tabular-nums">
                  {selectedBatchIds.size} selected
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {selectedUnassigned.length} unassigned · {selectedAssigned.length}{" "}
                  assigned
                </span>
                {selectedClerkActiveExams.length > 0 ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Active exams:{" "}
                    {selectedClerkActiveExams.map((e) => e.exam_label).join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={releasing || selectedAssigned.length === 0}
                  onClick={() => setConfirmReleaseOpen(true)}
                >
                  Release selected ({selectedAssigned.length})
                </Button>
                <Button
                  disabled={
                    assigning || !assignClerkId || selectedUnassigned.length === 0
                  }
                  onClick={() => setConfirmAssignOpen(true)}
                >
                  Assign to clerk ({selectedUnassigned.length})
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={confirmAssignOpen} onOpenChange={setConfirmAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm assign</DialogTitle>
            <DialogDescription>
              Assign {selectedUnassigned.length} unassigned batch
              {selectedUnassigned.length === 1 ? "" : "es"} to{" "}
              {selectedClerk?.full_name ?? "the selected clerk"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAssign()} disabled={assigning}>
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Assigning…
                </>
              ) : (
                "Confirm assign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release selected batches?</AlertDialogTitle>
            <AlertDialogDescription>
              Release {selectedAssigned.length} assigned batch
              {selectedAssigned.length === 1 ? "" : "es"} back to the unassigned pool?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={releasing}
              onClick={(e) => {
                e.preventDefault();
                void handleReleaseSelected();
              }}
            >
              {releasing ? "Releasing…" : "Release selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
