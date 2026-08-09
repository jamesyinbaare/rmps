"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  clearIssueBatches,
  createIssueBatches,
  listDocuments,
  runValidation,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  BatchSummaryUnbatchedItem,
  ClearBatchesResponse,
  CreateBatchesResponse,
  Exam,
  RunValidationResponse,
  Subject,
} from "@/types/document";

type PrepareStep = 1 | 2 | 3;
type StreamChoice = "doc" | "nod" | "both";

type PrepareBatchesPanelProps = {
  exams: Exam[];
  subjects: Subject[];
  examId: number | null;
  onExamIdChange: (examId: number | null) => void;
  unbatched: BatchSummaryUnbatchedItem[];
  onChanged: () => Promise<void> | void;
  className?: string;
  /** When true, exam is controlled by the parent page header. */
  hideExamSelect?: boolean;
};

function testTypeLabel(testType: number) {
  if (testType === 1) return "Paper 1";
  if (testType === 2) return "Paper 2";
  if (testType === 3) return "Paper 3";
  return `Type ${testType}`;
}

function streamToHasDocument(stream: StreamChoice): boolean | null {
  if (stream === "doc") return true;
  if (stream === "nod") return false;
  return null;
}

export function PrepareBatchesPanel({
  exams,
  subjects,
  examId,
  onExamIdChange,
  unbatched,
  onChanged,
  className,
  hideExamSelect = false,
}: PrepareBatchesPanelProps) {
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [testType, setTestType] = useState(2);
  const [stream, setStream] = useState<StreamChoice>("doc");
  const [targetSize, setTargetSize] = useState(500);
  const [tolerance, setTolerance] = useState(50);
  const [prepareStep, setPrepareStep] = useState<PrepareStep>(1);
  const [validationRanForScope, setValidationRanForScope] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);
  const [validationResult, setValidationResult] = useState<RunValidationResponse | null>(
    null
  );
  const [examSheetCount, setExamSheetCount] = useState<number | null>(null);
  const [checkingSheets, setCheckingSheets] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearedForScope, setClearedForScope] = useState(false);
  const [clearResult, setClearResult] = useState<ClearBatchesResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CreateBatchesResponse | null>(null);

  useEffect(() => {
    setValidationRanForScope(false);
    setValidationResult(null);
    setClearedForScope(false);
    setClearResult(null);
    setCreateResult(null);
    setPrepareStep(1);
  }, [examId, subjectId, testType]);

  useEffect(() => {
    if (!examId) {
      setExamSheetCount(null);
      return;
    }
    let cancelled = false;
    setCheckingSheets(true);
    void listDocuments({ exam_id: examId, page: 1, page_size: 1 })
      .then((res) => {
        if (!cancelled) setExamSheetCount(res.total ?? res.items?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setExamSheetCount(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSheets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const unbatchedPreview = useMemo(() => {
    let doc = 0;
    let nod = 0;
    for (const u of unbatched) {
      if (examId != null && u.exam_id !== examId) continue;
      if (subjectId != null && u.subject_id !== subjectId) continue;
      if (u.test_type !== testType) continue;
      if (u.has_document) doc += u.pending_count;
      else nod += u.pending_count;
    }
    return { doc, nod };
  }, [unbatched, examId, subjectId, testType]);

  const unbatchedRows = useMemo(() => {
    return unbatched.filter((u) => {
      if (examId != null && u.exam_id !== examId) return false;
      if (subjectId != null && u.subject_id !== subjectId) return false;
      if (u.test_type !== testType) return false;
      return true;
    });
  }, [unbatched, examId, subjectId, testType]);

  const creatableCount =
    stream === "doc"
      ? unbatchedPreview.doc
      : stream === "nod"
        ? unbatchedPreview.nod
        : unbatchedPreview.doc + unbatchedPreview.nod;

  const assignHref = useMemo(() => {
    const params = new URLSearchParams();
    if (examId != null) params.set("exam_id", String(examId));
    if (subjectId != null) params.set("subject_id", String(subjectId));
    if (testType) params.set("test_type", String(testType));
    if (stream === "doc") params.set("stream", "doc");
    if (stream === "nod") params.set("stream", "nod");
    const qs = params.toString();
    return qs ? `/clerk/assign?${qs}` : "/clerk/assign";
  }, [examId, subjectId, testType, stream]);

  const handleRunPrepareValidation = async () => {
    if (!examId || !subjectId) {
      toast.error("Select exam and subject");
      return;
    }
    setRunningValidation(true);
    try {
      const result = await runValidation({ exam_id: examId, subject_id: subjectId });
      setValidationResult(result);
      setValidationRanForScope(true);
      setPrepareStep(2);
      toast.success(
        `Validation done · ${result.issues_found} issue(s), ${result.issues_created} created`
      );
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setRunningValidation(false);
    }
  };

  const handleClear = async () => {
    if (!examId || !subjectId) return;
    setClearing(true);
    try {
      const result = await clearIssueBatches({
        exam_id: examId,
        subject_id: subjectId,
        test_type: testType,
      });
      setClearedForScope(true);
      setClearResult(result);
      setConfirmClearOpen(false);
      setPrepareStep(3);
      toast.success(
        `Cleared ${result.batches_deleted} batch(es), ${result.pending_unbatched} pending issue(s) unbatched`
      );
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setClearing(false);
    }
  };

  const handleCreate = async () => {
    if (!examId || !subjectId) {
      toast.error("Select exam and subject");
      return;
    }
    if (!validationRanForScope) {
      toast.error("Run validation first");
      return;
    }
    setCreating(true);
    try {
      const result = await createIssueBatches({
        exam_id: examId,
        subject_id: subjectId,
        test_type: testType,
        has_document: streamToHasDocument(stream),
        target_size: targetSize,
        tolerance,
      });
      setCreateResult(result);
      const parts: string[] = [];
      if (result.created_doc_count > 0) {
        parts.push(`${result.created_doc_count} DOC`);
      }
      if (result.created_nod_count > 0) {
        parts.push(`${result.created_nod_count} NOD`);
      }
      toast.success(
        `Created ${result.batches.length} batch(es)${parts.length ? ` · ${parts.join(" · ")}` : ""}`
      );
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <section className={cn("rounded-xl border bg-muted/20 p-4 space-y-5", className)}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">Prepare batches</h2>
            <p className="text-sm text-muted-foreground">
              Validate → optional clear → create DOC and/or NOD batches for one subject and
              paper.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {([1, 2, 3] as PrepareStep[]).map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => {
                  if (step === 1 || validationRanForScope) setPrepareStep(step);
                }}
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium transition-colors",
                  prepareStep === step
                    ? "bg-foreground text-background"
                    : validationRanForScope || step === 1
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground"
                )}
              >
                {step === 1 ? "1 · Validate" : step === 2 ? "2 · Clear" : "3 · Create"}
              </button>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "grid gap-3",
            hideExamSelect ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
          )}
        >
          {!hideExamSelect ? (
            <div>
              <Label className="text-xs text-muted-foreground">Examination</Label>
              <SearchableSelect
                options={exams.map((e) => ({
                  value: e.id,
                  label: `${e.exam_type} · ${e.series} ${e.year}`,
                }))}
                value={examId ?? "all"}
                onValueChange={(v) =>
                  onExamIdChange(v === "all" || v === "" ? null : Number(v))
                }
                placeholder="Exam"
                allowAll
                allLabel="Select exam"
              />
            </div>
          ) : null}
          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
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
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Paper</Label>
            <Select value={String(testType)} onValueChange={(v) => setTestType(Number(v))}>
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
        </div>

        {examId && examSheetCount === 0 && !checkingSheets ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <p>
              No score sheets uploaded for this exam yet. Validation can still run; DOC
              batches require documents.
            </p>
          </div>
        ) : null}

        {examId && subjectId ? (
          <div className="rounded-lg border overflow-hidden bg-background">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Unbatched pending preview</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                DOC {unbatchedPreview.doc} · NOD {unbatchedPreview.nod}
              </p>
            </div>
            {unbatchedRows.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No unbatched pending issues for this scope.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Paper</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unbatchedRows.map((row) => (
                    <TableRow
                      key={`${row.subject_id}-${row.test_type}-${row.has_document}`}
                    >
                      <TableCell className="font-medium">{row.subject_code}</TableCell>
                      <TableCell>{testTypeLabel(row.test_type)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {row.has_document ? "DOC" : "NOD"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.pending_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}

        {prepareStep === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Run score validation for the selected exam and subject before creating batches.
            </p>
            {validationResult ? (
              <p className="text-sm">
                Last run: checked {validationResult.total_scores_checked}, found{" "}
                {validationResult.issues_found}, created {validationResult.issues_created},
                reopened {validationResult.issues_reopened ?? 0}.
              </p>
            ) : null}
            <Button
              onClick={() => void handleRunPrepareValidation()}
              disabled={runningValidation || !examId || !subjectId}
            >
              {runningValidation ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Validating…
                </>
              ) : (
                "Run validation"
              )}
            </Button>
          </div>
        )}

        {prepareStep === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Clear existing batches for this exam, subject, and paper so pending issues can
              be re-packed. Resolved issues and clerk attribution are kept for payment.
            </p>
            {clearedForScope && clearResult ? (
              <div className="rounded-lg border bg-background px-3 py-2 text-sm space-y-1">
                <p className="text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Batches cleared for this scope.
                </p>
                <p className="text-muted-foreground tabular-nums">
                  {clearResult.batches_deleted} batch(es) deleted ·{" "}
                  {clearResult.pending_unbatched} pending unbatched ·{" "}
                  {clearResult.resolved_preserved} resolved preserved
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearing || !examId || !subjectId}
              >
                Clear current batches
              </Button>
              <Button
                variant="outline"
                onClick={() => setPrepareStep(3)}
                disabled={!validationRanForScope}
              >
                Skip to create
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {prepareStep === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pack pending unbatched issues for the selected stream. Currently creatable:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {creatableCount}
              </span>{" "}
              pending (DOC {unbatchedPreview.doc} · NOD {unbatchedPreview.nod}).
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
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
                    <SelectItem value="doc">DOC only</SelectItem>
                    <SelectItem value="nod">NOD only</SelectItem>
                    <SelectItem value="both">DOC + NOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <div className="flex flex-col justify-end">
                <Button
                  onClick={() => void handleCreate()}
                  disabled={creating || !validationRanForScope}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating…
                    </>
                  ) : stream === "doc" ? (
                    "Create DOC batches"
                  ) : stream === "nod" ? (
                    "Create NOD batches"
                  ) : (
                    "Create batches"
                  )}
                </Button>
              </div>
            </div>

            {createResult ? (
              <div className="rounded-lg border bg-background overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Created {createResult.batches.length} batch
                      {createResult.batches.length === 1 ? "" : "es"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      DOC groups {createResult.created_doc_count} · NOD groups{" "}
                      {createResult.created_nod_count}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={assignHref}>Assign work</Link>
                  </Button>
                </div>
                {createResult.batches.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Stream</TableHead>
                        <TableHead className="text-right">Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {createResult.batches.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {b.has_document ? "DOC" : "NOD"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {b.issue_count}
                            {b.oversized ? (
                              <span className="ml-1 text-xs text-amber-700">oversized</span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    No new batches were created for this stream and scope.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear batches for this paper?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes all batches for the selected exam, subject, and paper (including
              assigned ones) and unbatches pending issues. Resolved rows stay for payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              onClick={(e) => {
                e.preventDefault();
                void handleClear();
              }}
            >
              {clearing ? "Clearing…" : "Clear batches"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
