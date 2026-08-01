"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileImage,
  FileX,
  Loader2,
  Settings2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignIssueBatches,
  createIssueBatches,
  getAllExams,
  getBatchSummary,
  getCurrentUser,
  listClerkQuotas,
  listIssueBatches,
  listSubjects,
  releaseIssueBatches,
  setClerkBaseQuota,
  setClerkQuotaOverride,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { normalizeRole } from "@/lib/role-utils";
import type {
  BatchSummaryResponse,
  ClerkQuotaItem,
  Exam,
  IssueBatch,
  Subject,
} from "@/types/document";

type StreamChoice = "both" | "doc" | "nod";
type DocFilter = "all" | "doc" | "nod";

function testTypeLabel(testType: number) {
  if (testType === 1) return "Paper 1";
  if (testType === 2) return "Paper 2";
  if (testType === 3) return "Paper 3";
  return `Type ${testType}`;
}

export default function ClerkAssignPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [examId, setExamId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [testType, setTestType] = useState<number>(2);
  const [targetSize, setTargetSize] = useState(500);
  const [tolerance, setTolerance] = useState(50);
  const [stream, setStream] = useState<StreamChoice>("both");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [hasDocFilter, setHasDocFilter] = useState<DocFilter>("all");
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<number>>(new Set());
  const [assignClerkId, setAssignClerkId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [confirmAssignOpen, setConfirmAssignOpen] = useState(false);

  const [summary, setSummary] = useState<BatchSummaryResponse | null>(null);
  const [quotas, setQuotas] = useState<ClerkQuotaItem[]>([]);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageClerk, setManageClerk] = useState<ClerkQuotaItem | null>(null);
  const [baseQuotaInput, setBaseQuotaInput] = useState("");
  const [overrideInput, setOverrideInput] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [savingBase, setSavingBase] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const loadMeta = useCallback(async () => {
    const examsData = await getAllExams().catch(() => []);
    const allSubjects: Subject[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const chunk = await listSubjects(page, 100);
      allSubjects.push(...chunk);
      hasMore = chunk.length === 100;
      page++;
    }
    setExams(Array.isArray(examsData) ? examsData : []);
    setSubjects(allSubjects);
  }, []);

  const refreshBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const data = await listIssueBatches({
        exam_id: examId || undefined,
        subject_id: subjectId || undefined,
        test_type: testType || undefined,
        unassigned_only: true,
        has_document: hasDocFilter === "all" ? undefined : hasDocFilter === "doc",
      });
      setBatches(data.batches);
      setSelectedBatchIds(new Set());
    } finally {
      setLoadingBatches(false);
    }
  }, [examId, subjectId, testType, hasDocFilter]);

  const refreshSummaryAndQuotas = useCallback(async () => {
    const [summaryData, quotasData] = await Promise.all([
      getBatchSummary(examId || undefined),
      listClerkQuotas(),
    ]);
    setSummary(summaryData);
    setQuotas(quotasData.clerks);
  }, [examId]);

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        const role = normalizeRole(user.role);
        if (role !== "SUPER_ADMIN" && role !== "REGISTRAR") {
          router.replace("/");
          return;
        }
        setAuthorized(true);
        await loadMeta();
        await Promise.all([refreshBatches(), refreshSummaryAndQuotas()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [router, loadMeta, refreshBatches, refreshSummaryAndQuotas]);

  useEffect(() => {
    if (!authorized) return;
    void refreshBatches();
  }, [authorized, refreshBatches]);

  const unbatchedPreview = useMemo(() => {
    if (!summary) return { doc: 0, nod: 0 };
    return summary.unbatched
      .filter(
        (u) =>
          (!examId || u.exam_id === examId) &&
          (!subjectId || u.subject_id === subjectId) &&
          u.test_type === testType
      )
      .reduce(
        (acc, u) => {
          if (u.has_document) acc.doc += u.pending_count;
          else acc.nod += u.pending_count;
          return acc;
        },
        { doc: 0, nod: 0 }
      );
  }, [summary, examId, subjectId, testType]);

  const clerkRows = useMemo(() => {
    return [...quotas].sort((a, b) => {
      const loadA =
        summary?.clerks.find((c) => c.user_id === a.user_id)?.assigned_pending_issues ?? 0;
      const loadB =
        summary?.clerks.find((c) => c.user_id === b.user_id)?.assigned_pending_issues ?? 0;
      if (loadA !== loadB) return loadA - loadB;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [quotas, summary]);

  const selectedClerk = quotas.find((q) => q.user_id === assignClerkId) ?? null;
  const selectedClerkLoad = selectedClerk
    ? summary?.clerks.find((c) => c.user_id === selectedClerk.user_id)
    : undefined;

  const selectedBatches = useMemo(
    () => batches.filter((b) => selectedBatchIds.has(b.id)),
    [batches, selectedBatchIds]
  );
  const selectedIssueCount = selectedBatches.reduce((sum, b) => sum + b.issue_count, 0);

  const allVisibleSelected =
    batches.length > 0 && batches.every((b) => selectedBatchIds.has(b.id));

  const handleCreate = async () => {
    if (!examId || !subjectId) {
      toast.error("Select exam and subject");
      return;
    }
    setCreating(true);
    try {
      const has_document = stream === "both" ? null : stream === "doc";
      const result = await createIssueBatches({
        exam_id: examId,
        subject_id: subjectId,
        test_type: testType,
        target_size: targetSize,
        tolerance,
        has_document,
      });
      toast.success(
        `Created ${result.batches.length} batches (DOC ${result.created_doc_count}, NOD ${result.created_nod_count})`
      );
      if (result.oversized_groups.length) {
        toast.message(`${result.oversized_groups.length} oversized sheet group(s)`);
      }
      setCreateOpen(false);
      await Promise.all([refreshBatches(), refreshSummaryAndQuotas()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create batches");
    } finally {
      setCreating(false);
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

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedBatchIds(new Set());
      return;
    }
    setSelectedBatchIds(new Set(batches.map((b) => b.id)));
  };

  const handleAssign = async () => {
    if (!assignClerkId || selectedBatchIds.size === 0) {
      toast.error("Select a clerk and at least one batch");
      return;
    }
    setAssigning(true);
    try {
      const result = await assignIssueBatches([...selectedBatchIds], assignClerkId);
      toast.success(
        `Assigned ${result.assigned_count} batch${result.assigned_count === 1 ? "" : "es"} to ${selectedClerk?.full_name ?? "clerk"}`
      );
      setConfirmAssignOpen(false);
      setSelectedBatchIds(new Set());
      await Promise.all([refreshBatches(), refreshSummaryAndQuotas()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  const openManageClerk = (quota: ClerkQuotaItem) => {
    setManageClerk(quota);
    setBaseQuotaInput(String(quota.base_quota));
    setOverrideInput(quota.override_quota != null ? String(quota.override_quota) : "");
    setOverrideReason("");
    setManageOpen(true);
  };

  const manageLoad = manageClerk
    ? summary?.clerks.find((c) => c.user_id === manageClerk.user_id)
    : undefined;

  const handleSaveBaseQuota = async () => {
    if (!manageClerk) return;
    const value = Number(baseQuotaInput);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Base quota must be a number ≥ 1");
      return;
    }
    setSavingBase(true);
    try {
      const updated = await setClerkBaseQuota(manageClerk.user_id, value);
      setManageClerk(updated);
      setBaseQuotaInput(String(updated.base_quota));
      toast.success("Base quota updated");
      await refreshSummaryAndQuotas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set quota");
    } finally {
      setSavingBase(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!manageClerk) return;
    const trimmed = overrideInput.trim();
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value < 1) {
        toast.error("Override must be a number ≥ 1");
        return;
      }
    }
    setSavingOverride(true);
    try {
      const updated = await setClerkQuotaOverride(
        manageClerk.user_id,
        trimmed === "" ? null : Number(trimmed),
        overrideReason.trim() || undefined
      );
      setManageClerk(updated);
      setOverrideInput(
        updated.override_quota != null ? String(updated.override_quota) : ""
      );
      toast.success(trimmed === "" ? "Override cleared" : "Override set for today");
      await refreshSummaryAndQuotas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set override");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async () => {
    if (!manageClerk) return;
    setOverrideInput("");
    setSavingOverride(true);
    try {
      const updated = await setClerkQuotaOverride(manageClerk.user_id, null);
      setManageClerk(updated);
      toast.success("Override cleared");
      await refreshSummaryAndQuotas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear override");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleReleaseClerk = async () => {
    if (!manageClerk) return;
    setReleasing(true);
    try {
      const result = await releaseIssueBatches({ user_id: manageClerk.user_id });
      toast.success(`Released ${result.released_count} batch(es)`);
      await Promise.all([refreshBatches(), refreshSummaryAndQuotas()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Assign & Quotas">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  return (
    <DashboardLayout title="Assign & Quotas">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Assign & Quotas" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6 pb-28">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Assign work</h1>
                <p className="text-muted-foreground mt-1">
                  Choose a clerk, pick unassigned batches, then confirm.
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setCreateOpen((v) => !v)}
              >
                {createOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Create batches
                {(unbatchedPreview.doc > 0 || unbatchedPreview.nod > 0) && (
                  <Badge variant="secondary" className="ml-1">
                    {unbatchedPreview.doc + unbatchedPreview.nod} waiting
                  </Badge>
                )}
              </Button>
            </header>

            {createOpen && (
              <section className="rounded-xl border bg-muted/20 p-4 space-y-4">
                <div>
                  <h2 className="font-medium">Prepare batches</h2>
                  <p className="text-sm text-muted-foreground">
                    Pack pending issues for one subject and paper into DOC / NOD batches.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <SearchableSelect
                    options={exams.map((e) => ({
                      value: e.id,
                      label: `${e.exam_type} · ${e.series} ${e.year}`,
                    }))}
                    value={examId ?? "all"}
                    onValueChange={(v) =>
                      setExamId(v === "all" || v === "" ? null : Number(v))
                    }
                    placeholder="Exam"
                    allowAll
                    allLabel="Select exam"
                  />
                  <SearchableSelect
                    options={subjects.map((s) => ({
                      value: s.id,
                      label: `${s.code} · ${s.name}`,
                    }))}
                    value={subjectId ?? "all"}
                    onValueChange={(v) =>
                      setSubjectId(v === "all" || v === "" ? null : Number(v))
                    }
                    placeholder="Subject"
                    allowAll
                    allLabel="Select subject"
                  />
                  <Select
                    value={String(testType)}
                    onValueChange={(v) => setTestType(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Test type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Paper 1 (Objectives)</SelectItem>
                      <SelectItem value="2">Paper 2 (Essay)</SelectItem>
                      <SelectItem value="3">Paper 3 (Practical)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Target size</Label>
                    <Input
                      type="number"
                      value={targetSize}
                      onChange={(e) => setTargetSize(Number(e.target.value) || 500)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tolerance</Label>
                    <Input
                      type="number"
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Stream</Label>
                    <Select
                      value={stream}
                      onValueChange={(v) => setStream(v as StreamChoice)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both DOC & NOD</SelectItem>
                        <SelectItem value="doc">With documents only</SelectItem>
                        <SelectItem value="nod">Without documents only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col justify-end gap-1">
                    <p className="text-xs text-muted-foreground">
                      Unbatched · DOC {unbatchedPreview.doc} · NOD {unbatchedPreview.nod}
                    </p>
                    <Button onClick={() => void handleCreate()} disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Creating…
                        </>
                      ) : (
                        "Create batches"
                      )}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {/* Shared scope filters for the assign pool */}
            <section className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <Label className="text-xs text-muted-foreground">Pool exam</Label>
                <SearchableSelect
                  options={exams.map((e) => ({
                    value: e.id,
                    label: `${e.exam_type} · ${e.series} ${e.year}`,
                  }))}
                  value={examId ?? "all"}
                  onValueChange={(v) =>
                    setExamId(v === "all" || v === "" ? null : Number(v))
                  }
                  placeholder="All exams"
                  allowAll
                  allLabel="All exams"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <Label className="text-xs text-muted-foreground">Pool subject</Label>
                <SearchableSelect
                  options={subjects.map((s) => ({
                    value: s.id,
                    label: `${s.code} · ${s.name}`,
                  }))}
                  value={subjectId ?? "all"}
                  onValueChange={(v) =>
                    setSubjectId(v === "all" || v === "" ? null : Number(v))
                  }
                  placeholder="All subjects"
                  allowAll
                  allLabel="All subjects"
                />
              </div>
              <div className="w-40">
                <Label className="text-xs text-muted-foreground">Paper</Label>
                <Select
                  value={String(testType)}
                  onValueChange={(v) => setTestType(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Paper 1</SelectItem>
                    <SelectItem value="2">Paper 2</SelectItem>
                    <SelectItem value="3">Paper 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Label className="text-xs text-muted-foreground">Stream</Label>
                <Select
                  value={hasDocFilter}
                  onValueChange={(v) => setHasDocFilter(v as DocFilter)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All streams</SelectItem>
                    <SelectItem value="doc">DOC only</SelectItem>
                    <SelectItem value="nod">NOD only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(280px,340px)_1fr] gap-4 min-h-[520px]">
              {/* Clerks */}
              <aside className="rounded-xl border overflow-hidden flex flex-col min-h-[420px]">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-medium">1. Select clerk</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sorted by lightest pending load first.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto divide-y">
                  {clerkRows.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">
                      No active data clerks found.
                    </div>
                  ) : (
                    clerkRows.map((q) => {
                      const load = summary?.clerks.find((c) => c.user_id === q.user_id);
                      const selected = assignClerkId === q.user_id;
                      const atCap = q.remaining <= 0;
                      return (
                        <div
                          key={q.user_id}
                          className={cn(
                            "w-full text-left px-4 py-3 transition-colors",
                            selected
                              ? "bg-primary/10 border-l-2 border-l-primary"
                              : "hover:bg-muted/50 border-l-2 border-l-transparent"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              className="flex-1 min-w-0 text-left"
                              onClick={() => setAssignClerkId(q.user_id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{q.full_name}</span>
                                {selected ? (
                                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  {load?.assigned_batches ?? 0} batch
                                  {(load?.assigned_batches ?? 0) === 1 ? "" : "es"}
                                </span>
                                <span>
                                  {load?.assigned_pending_issues ?? 0} pending
                                </span>
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    atCap && "text-destructive font-medium"
                                  )}
                                >
                                  {q.remaining} quota left
                                </span>
                              </div>
                              {q.quota_overridden ? (
                                <Badge variant="outline" className="mt-2 text-[10px]">
                                  Override today
                                </Badge>
                              ) : null}
                            </button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="shrink-0 h-8 w-8"
                              title="Manage limits"
                              onClick={(e) => {
                                e.stopPropagation();
                                openManageClerk(q);
                              }}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Batches */}
              <div className="rounded-xl border overflow-hidden flex flex-col min-h-[420px]">
                <div className="px-4 py-3 border-b bg-muted/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="font-medium">2. Pick unassigned batches</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {testTypeLabel(testType)}
                      {subjectId
                        ? ` · ${subjects.find((s) => s.id === subjectId)?.code ?? "subject"}`
                        : " · all subjects"}
                      {" · "}
                      {batches.length} available
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={batches.length === 0}
                      onClick={toggleSelectAll}
                    >
                      {allVisibleSelected ? "Clear selection" : "Select all"}
                    </Button>
                  </div>
                </div>

                {!assignClerkId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
                    <UserRound className="h-8 w-8 opacity-50" />
                    <p className="font-medium text-foreground">Select a clerk first</p>
                    <p className="text-sm text-center max-w-sm">
                      Pick who will receive work from the list on the left, then choose
                      batches here.
                    </p>
                  </div>
                ) : loadingBatches ? (
                  <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading batches…
                  </div>
                ) : batches.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 opacity-50" />
                    <p className="font-medium text-foreground">No unassigned batches</p>
                    <p className="text-sm text-center max-w-sm">
                      Create batches for this scope, or widen the exam / subject filters.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setCreateOpen(true)}
                    >
                      Open create batches
                    </Button>
                  </div>
                ) : (
                  <ul className="flex-1 overflow-y-auto divide-y">
                    {batches.map((b) => {
                      const checked = selectedBatchIds.has(b.id);
                      return (
                        <li key={b.id}>
                          <label
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                              checked ? "bg-primary/5" : "hover:bg-muted/40"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleBatch(b.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-sm truncate">{b.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {b.issue_count} issue{b.issue_count === 1 ? "" : "s"} ·{" "}
                                {testTypeLabel(b.test_type)}
                              </p>
                            </div>
                            <Badge
                              variant={b.has_document ? "default" : "secondary"}
                              className="shrink-0 gap-1"
                            >
                              {b.has_document ? (
                                <FileImage className="h-3 w-3" />
                              ) : (
                                <FileX className="h-3 w-3" />
                              )}
                              {b.has_document ? "DOC" : "NOD"}
                            </Badge>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </main>

        {/* Sticky assign bar */}
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
          <div className="container mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="text-sm min-w-0">
              {selectedClerk ? (
                <p>
                  <span className="text-muted-foreground">Assigning to </span>
                  <span className="font-medium">{selectedClerk.full_name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {selectedClerkLoad?.assigned_pending_issues ?? 0} pending now ·{" "}
                    {selectedClerk.remaining} quota left
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">No clerk selected</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedBatchIds.size} batch
                {selectedBatchIds.size === 1 ? "" : "es"} selected · {selectedIssueCount}{" "}
                issue
                {selectedIssueCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2 shrink-0"
              disabled={
                !assignClerkId || selectedBatchIds.size === 0 || assigning
              }
              onClick={() => setConfirmAssignOpen(true)}
            >
              Assign to {selectedClerk?.full_name?.split(" ")[0] ?? "clerk"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm assign */}
      <Dialog open={confirmAssignOpen} onOpenChange={setConfirmAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm assignment</DialogTitle>
            <DialogDescription>
              These batches will move into the clerk&apos;s queue immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground">Clerk</p>
              <p className="font-medium">{selectedClerk?.full_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">Batches</p>
                <p className="text-xl font-semibold tabular-nums">
                  {selectedBatchIds.size}
                </p>
              </div>
              <div className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">Issues</p>
                <p className="text-xl font-semibold tabular-nums">{selectedIssueCount}</p>
              </div>
            </div>
            {selectedClerk && selectedIssueCount > selectedClerk.remaining ? (
              <p className="text-amber-600 dark:text-amber-400 text-xs">
                This adds more issues than the clerk&apos;s remaining daily quota (
                {selectedClerk.remaining}). They may hit the cap before finishing.
              </p>
            ) : null}
            <ul className="max-h-40 overflow-y-auto rounded-lg border divide-y text-xs font-mono">
              {selectedBatches.slice(0, 12).map((b) => (
                <li key={b.id} className="px-3 py-1.5 truncate">
                  {b.name}
                </li>
              ))}
              {selectedBatches.length > 12 ? (
                <li className="px-3 py-1.5 text-muted-foreground">
                  +{selectedBatches.length - 12} more
                </li>
              ) : null}
            </ul>
          </div>
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

      {/* Manage limits */}
      <Dialog
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (!open) setManageClerk(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {manageClerk ? manageClerk.full_name : "Clerk limits"}
            </DialogTitle>
            <DialogDescription>
              Set daily resolve limits and release assigned batches for this clerk.
            </DialogDescription>
          </DialogHeader>

          {manageClerk ? (
            <div className="space-y-5 py-1">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Batches</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {manageLoad?.assigned_batches ?? 0}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {manageLoad?.assigned_pending_issues ?? 0}
                  </p>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Resolved today</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {manageClerk.resolved_today}
                  </p>
                </div>
              </div>

              <div className="rounded-md border px-3 py-2 text-sm flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Effective today</p>
                  <p className="font-medium tabular-nums">
                    {manageClerk.resolved_today} / {manageClerk.quota_limit}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {manageClerk.remaining} left
                    </span>
                  </p>
                </div>
                {manageClerk.quota_overridden ? (
                  <Badge variant="outline">Override active</Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="base-quota">Base daily quota</Label>
                <div className="flex gap-2">
                  <Input
                    id="base-quota"
                    type="number"
                    min={1}
                    value={baseQuotaInput}
                    onChange={(e) => setBaseQuotaInput(e.target.value)}
                  />
                  <Button
                    onClick={() => void handleSaveBaseQuota()}
                    disabled={savingBase || savingOverride || releasing}
                  >
                    {savingBase ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="override-quota">Today&apos;s override</Label>
                <Input
                  id="override-quota"
                  type="number"
                  min={1}
                  placeholder="Leave empty to use base quota"
                  value={overrideInput}
                  onChange={(e) => setOverrideInput(e.target.value)}
                />
                <Input
                  placeholder="Reason (optional)"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => void handleSaveOverride()}
                    disabled={savingBase || savingOverride || releasing}
                  >
                    {savingOverride ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply override"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleClearOverride()}
                    disabled={
                      savingBase ||
                      savingOverride ||
                      releasing ||
                      !manageClerk.quota_overridden
                    }
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between gap-2">
            <Button
              variant="destructive"
              onClick={() => void handleReleaseClerk()}
              disabled={!manageClerk || savingBase || savingOverride || releasing}
            >
              {releasing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Releasing…
                </>
              ) : (
                "Release all batches"
              )}
            </Button>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
