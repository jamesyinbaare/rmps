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
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/lib/api";
import {
  runValidationForScope,
  type AggregatedValidationResult,
  type ValidationScopeFailure,
} from "@/lib/run-validation-scope";
import { cn } from "@/lib/utils";
import type {
  BatchSummaryUnbatchedItem,
  Exam,
  Subject,
} from "@/types/document";

type PrepareStep = 1 | 2 | 3;
type StreamChoice = "doc" | "nod" | "both";
type SubjectTypeFilter = "ALL" | "CORE" | "ELECTIVE";

type ScopeFailure = ValidationScopeFailure;

type AggregatedClearResult = {
  scopesSucceeded: number;
  scopesFailed: number;
  batches_deleted: number;
  pending_unbatched: number;
  resolved_preserved: number;
  failures: ScopeFailure[];
};

type CreatedBatchRow = {
  id: number;
  name: string;
  issue_count: number;
  has_document: boolean;
  oversized?: boolean;
  subject_id: number;
  test_type: number;
};

type AggregatedCreateResult = {
  scopesSucceeded: number;
  scopesFailed: number;
  batches: CreatedBatchRow[];
  created_doc_count: number;
  created_nod_count: number;
  failures: ScopeFailure[];
};

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

function subjectCodeMap(subjects: Subject[]) {
  const map = new Map<number, string>();
  for (const s of subjects) map.set(s.id, s.code);
  return map;
}

function scopeKey(subjectIds: number[], testTypes: number[]) {
  return `${[...subjectIds].sort((a, b) => a - b).join(",")}|${[...testTypes].sort((a, b) => a - b).join(",")}`;
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
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectTypeFilter>("ALL");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [testTypes, setTestTypes] = useState<number[]>([2]);
  const [stream, setStream] = useState<StreamChoice>("doc");
  const [targetSize, setTargetSize] = useState(500);
  const [tolerance, setTolerance] = useState(50);
  const [prepareStep, setPrepareStep] = useState<PrepareStep>(1);
  const [validationRanForScope, setValidationRanForScope] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);
  const [validationProgress, setValidationProgress] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<AggregatedValidationResult | null>(null);
  const [examSheetCount, setExamSheetCount] = useState<number | null>(null);
  const [checkingSheets, setCheckingSheets] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearProgress, setClearProgress] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearedForScope, setClearedForScope] = useState(false);
  const [clearResult, setClearResult] = useState<AggregatedClearResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<AggregatedCreateResult | null>(null);

  const selectionKey = useMemo(
    () => scopeKey(selectedSubjectIds, testTypes),
    [selectedSubjectIds, testTypes]
  );

  useEffect(() => {
    setValidationRanForScope(false);
    setValidationResult(null);
    setClearedForScope(false);
    setClearResult(null);
    setCreateResult(null);
    setPrepareStep(1);
  }, [examId, selectionKey]);

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

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return subjects
      .filter((subject) => {
        const matchesType =
          subjectTypeFilter === "ALL" || subject.subject_type === subjectTypeFilter;
        if (!matchesType) return false;
        if (!q) return true;
        const code = (subject.original_code || subject.code || "").toLowerCase();
        const name = (subject.name || "").toLowerCase();
        return code.includes(q) || name.includes(q);
      })
      .sort((a, b) => {
        const aSelected = selectedSubjectIds.includes(a.id);
        const bSelected = selectedSubjectIds.includes(b.id);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return (a.code || "").localeCompare(b.code || "");
      });
  }, [subjects, subjectTypeFilter, subjectSearch, selectedSubjectIds]);

  const subjectIdsSet = useMemo(() => new Set(selectedSubjectIds), [selectedSubjectIds]);
  const testTypesSet = useMemo(() => new Set(testTypes), [testTypes]);
  const codesById = useMemo(() => subjectCodeMap(subjects), [subjects]);

  const scopeCombos = useMemo(() => {
    const combos: { subject_id: number; test_type: number }[] = [];
    for (const subjectId of selectedSubjectIds) {
      for (const testType of testTypes) {
        combos.push({ subject_id: subjectId, test_type: testType });
      }
    }
    return combos;
  }, [selectedSubjectIds, testTypes]);

  const hasSelection = selectedSubjectIds.length > 0 && testTypes.length > 0;
  const scopeCount = scopeCombos.length;

  const unbatchedPreview = useMemo(() => {
    let doc = 0;
    let nod = 0;
    for (const u of unbatched) {
      if (examId != null && u.exam_id !== examId) continue;
      if (!subjectIdsSet.has(u.subject_id)) continue;
      if (!testTypesSet.has(u.test_type)) continue;
      if (u.has_document) doc += u.pending_count;
      else nod += u.pending_count;
    }
    return { doc, nod };
  }, [unbatched, examId, subjectIdsSet, testTypesSet]);

  const unbatchedRows = useMemo(() => {
    return unbatched.filter((u) => {
      if (examId != null && u.exam_id !== examId) return false;
      if (!subjectIdsSet.has(u.subject_id)) return false;
      if (!testTypesSet.has(u.test_type)) return false;
      return true;
    });
  }, [unbatched, examId, subjectIdsSet, testTypesSet]);

  const creatableCount =
    stream === "doc"
      ? unbatchedPreview.doc
      : stream === "nod"
        ? unbatchedPreview.nod
        : unbatchedPreview.doc + unbatchedPreview.nod;

  const assignHref = useMemo(() => {
    const params = new URLSearchParams();
    if (examId != null) params.set("exam_id", String(examId));
    if (selectedSubjectIds.length === 1 && testTypes.length === 1) {
      params.set("subject_id", String(selectedSubjectIds[0]));
      params.set("test_type", String(testTypes[0]));
    }
    if (stream === "doc") params.set("stream", "doc");
    if (stream === "nod") params.set("stream", "nod");
    const qs = params.toString();
    return qs ? `/clerk/assign?${qs}` : "/clerk/assign";
  }, [examId, selectedSubjectIds, testTypes, stream]);

  const allFilteredSelected =
    filteredSubjects.length > 0 &&
    filteredSubjects.every((s) => selectedSubjectIds.includes(s.id));

  const handleSubjectToggle = (subjectId: number, checked: boolean) => {
    if (checked) {
      setSelectedSubjectIds((prev) =>
        prev.includes(subjectId) ? prev : [...prev, subjectId]
      );
    } else {
      setSelectedSubjectIds((prev) => prev.filter((id) => id !== subjectId));
    }
  };

  const handleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedSubjectIds(filteredSubjects.map((s) => s.id));
    } else {
      setSelectedSubjectIds([]);
    }
  };

  const handleTestTypeChange = (testType: number, checked: boolean) => {
    if (checked) {
      setTestTypes((prev) => [...prev, testType].sort((a, b) => a - b));
    } else {
      setTestTypes((prev) => prev.filter((t) => t !== testType));
    }
  };

  const handleRunPrepareValidation = async () => {
    if (!examId || selectedSubjectIds.length === 0) {
      toast.error("Select exam and at least one subject");
      return;
    }
    if (testTypes.length === 0) {
      toast.error("Select at least one paper");
      return;
    }
    setRunningValidation(true);
    setValidationProgress(null);

    try {
      const aggregated = await runValidationForScope({
        examId,
        subjectIds: selectedSubjectIds,
        subjects,
        onProgress: (update) =>
          setValidationProgress(
            update.phase === "start"
              ? `Validating ${update.current}/${update.total} — ${update.label}…`
              : update.phase === "complete"
                ? `Done ${update.current}/${update.total} — ${update.label}`
                : `Failed ${update.current}/${update.total} — ${update.label}`
          ),
      });

      setValidationResult(aggregated);

      if (aggregated.subjectsSucceeded > 0) {
        setValidationRanForScope(true);
        setPrepareStep(2);
      }

      if (aggregated.subjectsFailed === 0) {
        toast.success(
          `Validation done · ${aggregated.issues_found} issue(s), ${aggregated.issues_created} created across ${aggregated.subjectsSucceeded} subject(s)`
        );
      } else if (aggregated.subjectsSucceeded > 0) {
        toast.warning(
          `Validation partial · ${aggregated.subjectsSucceeded} ok, ${aggregated.subjectsFailed} failed`
        );
      } else {
        toast.error("Validation failed for all selected subjects");
      }
      await onChanged();
    } finally {
      setRunningValidation(false);
      setValidationProgress(null);
    }
  };

  const handleClear = async () => {
    if (!examId || scopeCombos.length === 0) return;
    setClearing(true);
    setClearProgress(null);
    const failures: ScopeFailure[] = [];
    let batches_deleted = 0;
    let pending_unbatched = 0;
    let resolved_preserved = 0;
    let scopesSucceeded = 0;

    try {
      for (let i = 0; i < scopeCombos.length; i++) {
        const { subject_id, test_type } = scopeCombos[i];
        setClearProgress(`Clearing ${i + 1}/${scopeCombos.length}…`);
        try {
          const result = await clearIssueBatches({
            exam_id: examId,
            subject_id,
            test_type,
          });
          scopesSucceeded += 1;
          batches_deleted += result.batches_deleted;
          pending_unbatched += result.pending_unbatched;
          resolved_preserved += result.resolved_preserved;
        } catch (err) {
          failures.push({
            subject_id,
            subject_code: codesById.get(subject_id),
            test_type,
            message: err instanceof Error ? err.message : "Clear failed",
          });
        }
      }

      const scopesFailed = failures.length;
      setClearResult({
        scopesSucceeded,
        scopesFailed,
        batches_deleted,
        pending_unbatched,
        resolved_preserved,
        failures,
      });
      setClearedForScope(scopesSucceeded > 0);
      setConfirmClearOpen(false);
      if (scopesSucceeded > 0) setPrepareStep(3);

      if (scopesFailed === 0) {
        toast.success(
          `Cleared ${batches_deleted} batch(es), ${pending_unbatched} pending issue(s) unbatched`
        );
      } else if (scopesSucceeded > 0) {
        toast.warning(`Clear partial · ${scopesSucceeded} ok, ${scopesFailed} failed`);
      } else {
        toast.error("Clear failed for all selected scopes");
      }
      await onChanged();
    } finally {
      setClearing(false);
      setClearProgress(null);
    }
  };

  const handleCreate = async () => {
    if (!examId || selectedSubjectIds.length === 0) {
      toast.error("Select exam and at least one subject");
      return;
    }
    if (testTypes.length === 0) {
      toast.error("Select at least one paper");
      return;
    }
    if (!validationRanForScope) {
      toast.error("Run validation first");
      return;
    }
    setCreating(true);
    setCreateProgress(null);
    const failures: ScopeFailure[] = [];
    const batches: CreatedBatchRow[] = [];
    let created_doc_count = 0;
    let created_nod_count = 0;
    let scopesSucceeded = 0;

    try {
      for (let i = 0; i < scopeCombos.length; i++) {
        const { subject_id, test_type } = scopeCombos[i];
        setCreateProgress(`Creating ${i + 1}/${scopeCombos.length}…`);
        try {
          const result = await createIssueBatches({
            exam_id: examId,
            subject_id,
            test_type,
            has_document: streamToHasDocument(stream),
            target_size: targetSize,
            tolerance,
          });
          scopesSucceeded += 1;
          created_doc_count += result.created_doc_count;
          created_nod_count += result.created_nod_count;
          for (const b of result.batches) {
            batches.push({
              ...b,
              subject_id,
              test_type,
            });
          }
        } catch (err) {
          failures.push({
            subject_id,
            subject_code: codesById.get(subject_id),
            test_type,
            message: err instanceof Error ? err.message : "Create failed",
          });
        }
      }

      const scopesFailed = failures.length;
      setCreateResult({
        scopesSucceeded,
        scopesFailed,
        batches,
        created_doc_count,
        created_nod_count,
        failures,
      });

      const parts: string[] = [];
      if (created_doc_count > 0) parts.push(`${created_doc_count} DOC`);
      if (created_nod_count > 0) parts.push(`${created_nod_count} NOD`);

      if (scopesFailed === 0) {
        toast.success(
          `Created ${batches.length} batch(es)${parts.length ? ` · ${parts.join(" · ")}` : ""}`
        );
      } else if (scopesSucceeded > 0) {
        toast.warning(
          `Create partial · ${scopesSucceeded} ok, ${scopesFailed} failed · ${batches.length} batch(es)`
        );
      } else {
        toast.error("Create failed for all selected scopes");
      }
      await onChanged();
    } finally {
      setCreating(false);
      setCreateProgress(null);
    }
  };

  return (
    <>
      <section className={cn("rounded-xl border bg-muted/20 p-4 space-y-5", className)}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">Prepare batches</h2>
            <p className="text-sm text-muted-foreground">
              Validate → optional clear → create DOC and/or NOD batches for one or more
              subjects and papers. Clear also resets clerk-skipped issues so they can be
              packed again.
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

        {!hideExamSelect ? (
          <div className="max-w-md">
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

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Subjects</Label>
              {selectedSubjectIds.length > 0 ? (
                <Badge variant="secondary">{selectedSubjectIds.length} selected</Badge>
              ) : null}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Type filter</Label>
              <Select
                value={subjectTypeFilter}
                onValueChange={(v) => setSubjectTypeFilter(v as SubjectTypeFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All subjects</SelectItem>
                  <SelectItem value="CORE">Core subjects</SelectItem>
                  <SelectItem value="ELECTIVE">Elective subjects</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Filters the list. Pick specific subjects below — you can mix CORE and
                ELECTIVE.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Available subjects</Label>
              {filteredSubjects.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all-prepare-subjects"
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) =>
                      handleSelectAllFiltered(checked === true)
                    }
                  />
                  <label
                    htmlFor="select-all-prepare-subjects"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    {allFilteredSelected ? "Deselect all" : "Select all"}
                  </label>
                </div>
              ) : null}
            </div>
            <Input
              placeholder="Search by code or name…"
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              className="h-9"
            />
            {filteredSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
                No{" "}
                {subjectTypeFilter === "ALL"
                  ? ""
                  : `${subjectTypeFilter.toLowerCase()} `}
                subjects found
              </p>
            ) : (
              <div className="border rounded-md p-2 max-h-56 overflow-y-auto space-y-1">
                {filteredSubjects.map((subject) => {
                  const isSelected = selectedSubjectIds.includes(subject.id);
                  return (
                    <div
                      key={subject.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md transition-colors",
                        isSelected && "bg-primary/10"
                      )}
                    >
                      <Checkbox
                        id={`prepare-subject-${subject.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleSubjectToggle(subject.id, checked === true)
                        }
                      />
                      <label
                        htmlFor={`prepare-subject-${subject.id}`}
                        className="text-sm font-medium leading-none cursor-pointer flex-1 flex items-center gap-2 min-w-0"
                      >
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {subject.original_code || subject.code}
                        </span>
                        <span className="truncate">{subject.name}</span>
                        <Badge variant="outline" className="ml-auto text-xs shrink-0">
                          {subject.subject_type}
                        </Badge>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border bg-background p-3">
            <Label className="text-sm font-medium">Papers</Label>
            <div className="flex flex-col gap-2">
              {(
                [
                  { value: 1, label: "Paper 1 (Objectives)" },
                  { value: 2, label: "Paper 2 (Essay)" },
                  { value: 3, label: "Paper 3 (Practical)" },
                ] as const
              ).map((paper) => (
                <div
                  key={paper.value}
                  className="flex items-center gap-2 p-3 border rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={`prepare-paper-${paper.value}`}
                    checked={testTypes.includes(paper.value)}
                    onCheckedChange={(checked) =>
                      handleTestTypeChange(paper.value, checked === true)
                    }
                  />
                  <label
                    htmlFor={`prepare-paper-${paper.value}`}
                    className="text-sm font-medium leading-none cursor-pointer flex-1"
                  >
                    {paper.label}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasSelection
                ? `${selectedSubjectIds.length} subject(s) × ${testTypes.length} paper(s) = ${scopeCount} scope(s)`
                : "Select at least one subject and one paper."}
            </p>
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

        {examId && hasSelection ? (
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
              <div className="max-h-64 overflow-y-auto">
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
              </div>
            )}
          </div>
        ) : null}

        {prepareStep === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Run score validation for each selected subject before creating batches.
            </p>
            {validationResult ? (
              <div className="space-y-1 text-sm">
                <p>
                  Last run: checked {validationResult.total_scores_checked}, found{" "}
                  {validationResult.issues_found}, created{" "}
                  {validationResult.issues_created}, reopened{" "}
                  {validationResult.issues_reopened} ·{" "}
                  {validationResult.subjectsSucceeded} subject(s) ok
                  {validationResult.subjectsFailed > 0
                    ? `, ${validationResult.subjectsFailed} failed`
                    : ""}
                  .
                </p>
                {validationResult.failures.length > 0 ? (
                  <ul className="text-xs text-destructive space-y-0.5">
                    {validationResult.failures.map((f) => (
                      <li key={f.subject_id}>
                        {f.subject_code ?? f.subject_id}: {f.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <Button
              onClick={() => void handleRunPrepareValidation()}
              disabled={runningValidation || !examId || !hasSelection}
            >
              {runningValidation ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {validationProgress ?? "Validating…"}
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
              Clear existing batches for the selected exam, subjects, and papers so pending
              issues can be re-packed. Resolved issues and clerk attribution are kept for
              payment.
            </p>
            {clearedForScope && clearResult ? (
              <div className="rounded-lg border bg-background px-3 py-2 text-sm space-y-1">
                <p className="text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Batches cleared for {clearResult.scopesSucceeded} of {scopeCount}{" "}
                  scope(s).
                </p>
                <p className="text-muted-foreground tabular-nums">
                  {clearResult.batches_deleted} batch(es) deleted ·{" "}
                  {clearResult.pending_unbatched} pending unbatched ·{" "}
                  {clearResult.resolved_preserved} resolved preserved
                </p>
                {clearResult.failures.length > 0 ? (
                  <ul className="text-xs text-destructive space-y-0.5">
                    {clearResult.failures.map((f) => (
                      <li key={`${f.subject_id}-${f.test_type}`}>
                        {f.subject_code ?? f.subject_id}
                        {f.test_type != null ? ` · ${testTypeLabel(f.test_type)}` : ""}:{" "}
                        {f.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearing || !examId || !hasSelection}
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
              Pack pending unbatched issues for the selected stream across {scopeCount}{" "}
              scope(s). Currently creatable:{" "}
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
                  disabled={creating || !validationRanForScope || !hasSelection}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {createProgress ?? "Creating…"}
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
                      {createResult.scopesFailed > 0
                        ? ` · ${createResult.scopesSucceeded} ok, ${createResult.scopesFailed} failed`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      DOC groups {createResult.created_doc_count} · NOD groups{" "}
                      {createResult.created_nod_count}
                    </p>
                    {createResult.failures.length > 0 ? (
                      <ul className="text-xs text-destructive mt-1 space-y-0.5">
                        {createResult.failures.map((f) => (
                          <li key={`${f.subject_id}-${f.test_type}`}>
                            {f.subject_code ?? f.subject_id}
                            {f.test_type != null
                              ? ` · ${testTypeLabel(f.test_type)}`
                              : ""}
                            : {f.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <Button asChild size="sm">
                    <Link href={assignHref}>Assign work</Link>
                  </Button>
                </div>
                {createResult.batches.length > 0 ? (
                  <div className="max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Batch</TableHead>
                          <TableHead>Paper</TableHead>
                          <TableHead>Stream</TableHead>
                          <TableHead className="text-right">Issues</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {createResult.batches.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.name}</TableCell>
                            <TableCell>{testTypeLabel(b.test_type)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {b.has_document ? "DOC" : "NOD"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {b.issue_count}
                              {b.oversized ? (
                                <span className="ml-1 text-xs text-amber-700">
                                  oversized
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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
            <AlertDialogTitle>
              Clear batches for {scopeCount} scope{scopeCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deletes all batches for the selected exam across{" "}
              {selectedSubjectIds.length} subject{selectedSubjectIds.length === 1 ? "" : "s"}{" "}
              and {testTypes.length} paper{testTypes.length === 1 ? "" : "s"} (
              {scopeCount} subject×paper combination{scopeCount === 1 ? "" : "s"}), including
              assigned ones, and unbatches pending issues. Resolved rows stay for payment.
              {clearProgress ? (
                <span className="block mt-2 tabular-nums">{clearProgress}</span>
              ) : null}
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
              {clearing ? clearProgress ?? "Clearing…" : "Clear batches"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
