"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScoreMigrationConfirmDialog } from "@/components/ScoreMigrationConfirmDialog";
import {
  bulkReclassifyPaper,
  type ScoreMigrationPreviewResponse,
} from "@/lib/api";
import type { Document } from "@/types/document";
import { toast } from "sonner";
import { AlertTriangle, Columns2, Loader2 } from "lucide-react";

function rewriteExtractedIdTestType(
  extractedId: string,
  targetTestType: "1" | "2"
): string | null {
  if (extractedId.length !== 13) return null;
  return extractedId.slice(0, 10) + targetTestType + extractedId.slice(11);
}

function paperName(testType: string | null | undefined): string {
  if (testType === "1") return "Objectives (1)";
  if (testType === "2") return "Essay (2)";
  return testType ? `Paper ${testType}` : "—";
}

function paperLabel(testType: string | null | undefined): string {
  if (testType === "1") return "Objectives";
  if (testType === "2") return "Essay";
  return testType ? `Paper ${testType}` : "—";
}

export type OwnershipConflictPair = {
  sourceId: number;
  conflictId: number;
};

export type BulkReclassifyResume = {
  documentIds: number[];
  targetTestType: "1" | "2";
};

interface BulkReclassifyPaperDialogProps {
  documents: Document[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onOwnershipConflicts?: (
    pairs: OwnershipConflictPair[],
    resume: BulkReclassifyResume
  ) => void;
  /** Prefill target when resuming after ID conflict review */
  initialTargetTestType?: "1" | "2";
  /** When true, show resume banner after ownership queue */
  resumeMode?: boolean;
}

export function BulkReclassifyPaperDialog({
  documents,
  open,
  onOpenChange,
  onSuccess,
  onOwnershipConflicts,
  initialTargetTestType,
  resumeMode = false,
}: BulkReclassifyPaperDialogProps) {
  const [targetTestType, setTargetTestType] = useState<"1" | "2">(
    initialTargetTestType ?? "2"
  );
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPreview, setConfirmPreview] =
    useState<ScoreMigrationPreviewResponse | null>(null);
  const [ownershipPairs, setOwnershipPairs] = useState<OwnershipConflictPair[]>(
    []
  );
  const [lastUpdated, setLastUpdated] = useState(0);

  useEffect(() => {
    if (open && initialTargetTestType) {
      setTargetTestType(initialTargetTestType);
    }
  }, [open, initialTargetTestType]);

  const preview = useMemo(() => {
    return documents.map((doc) => {
      const oldId = doc.extracted_id;
      if (!oldId || oldId.length !== 13) {
        return {
          doc,
          oldId,
          newId: null as string | null,
          skipReason: "Missing or invalid extracted ID",
          alreadyTarget: false,
          hasAppliedScores: Boolean(
            doc.scores_applied_at || (doc.scores_applied_count ?? 0) > 0
          ),
        };
      }
      const currentType = doc.test_type || oldId[10];
      const newId = rewriteExtractedIdTestType(oldId, targetTestType);
      return {
        doc,
        oldId,
        newId,
        skipReason: null as string | null,
        alreadyTarget: currentType === targetTestType,
        hasAppliedScores: Boolean(
          doc.scores_applied_at || (doc.scores_applied_count ?? 0) > 0
        ),
      };
    });
  }, [documents, targetTestType]);

  const actionable = preview.filter((p) => !p.skipReason && !p.alreadyTarget && p.newId);
  const appliedCount = actionable.filter((p) => p.hasAppliedScores).length;
  const skippedCount = preview.length - actionable.length;

  const buildBulkConfirmPreview = (): ScoreMigrationPreviewResponse => {
    const sample = actionable[0];
    const oldId = sample?.oldId ?? null;
    const newId = sample?.newId ?? null;
    const oldType = sample?.doc.test_type || (oldId && oldId.length === 13 ? oldId[10] : null);
    return {
      requires_confirm: true,
      subject_changed: false,
      paper_changed: true,
      scores_to_move: actionable.reduce(
        (sum, row) => sum + (row.doc.scores_applied_count ?? (row.hasAppliedScores ? 1 : 0)),
        0
      ),
      from_meta: {
        extracted_id: oldId,
        subject_id: sample?.doc.subject_id ?? null,
        subject_code: sample?.doc.subject_code ?? null,
        subject_name: sample?.doc.subject_name ?? null,
        test_type: oldType,
        paper_label: paperLabel(oldType),
      },
      to_meta: {
        extracted_id: newId,
        subject_id: sample?.doc.subject_id ?? null,
        subject_code: sample?.doc.subject_code ?? null,
        subject_name: sample?.doc.subject_name ?? null,
        test_type: targetTestType,
        paper_label: paperLabel(targetTestType),
      },
      conflicts: [],
      unregistered: [],
      blocking_errors: [],
    };
  };

  const runReclassify = async (overwrite: boolean) => {
    if (actionable.length === 0) {
      toast.error("No documents eligible to reclassify");
      return;
    }
    setLoading(true);
    setOwnershipPairs([]);
    try {
      const result = await bulkReclassifyPaper(
        actionable.map((p) => p.doc.id),
        targetTestType,
        overwrite
      );
      setLastUpdated(result.updated);
      if (result.updated > 0) {
        const moved =
          result.scores_moved > 0
            ? ` · moved scores for ${result.scores_moved} candidate row(s)`
            : "";
        toast.success(
          `Sheet updated · paper changed on ${result.updated} document(s)${moved}`
        );
      }

      const pairs: OwnershipConflictPair[] = result.results
        .filter(
          (r) =>
            r.error_code === "id_ownership" &&
            typeof r.conflict_document_id === "number"
        )
        .map((r) => ({
          sourceId: r.document_id,
          conflictId: r.conflict_document_id as number,
        }));

      const otherFailed = result.failed - pairs.length;
      if (otherFailed > 0) {
        const firstError = result.results.find(
          (r) => r.error && r.error_code !== "id_ownership"
        )?.error;
        toast.error(
          `Failed on ${otherFailed} document(s)${firstError ? `: ${firstError}` : ""}`
        );
      }

      setConfirmOpen(false);

      if (pairs.length > 0) {
        setOwnershipPairs(pairs);
        toast.message(
          `${pairs.length} ID conflict${pairs.length === 1 ? "" : "s"} — review side by side, then continue reclassify`
        );
        return;
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk reclassify failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (actionable.length === 0) {
      toast.error("No documents eligible to reclassify");
      return;
    }
    setOwnershipPairs([]);
    setConfirmPreview(buildBulkConfirmPreview());
    setConfirmOpen(true);
  };

  const handleReviewConflicts = () => {
    if (ownershipPairs.length === 0) return;
    onOwnershipConflicts?.(ownershipPairs, {
      documentIds: ownershipPairs.map((p) => p.sourceId),
      targetTestType,
    });
    setOwnershipPairs([]);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setOwnershipPairs([]);
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Change paper</DialogTitle>
            <DialogDescription>
              {resumeMode
                ? "All ID conflicts are resolved. Confirm the target paper and apply to the remaining sheets. Scores move with each sheet."
                : "Sheet tools · rewrite the paper digit in each selected sheet ID (Objectives ↔ Essay). Scores move with the sheet."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {resumeMode && (
              <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-950 dark:text-sky-50">
                Ready to finish reclassify on {documents.length} sheet
                {documents.length === 1 ? "" : "s"}.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Target paper</label>
              <Select
                value={targetTestType}
                onValueChange={(v) => setTargetTestType(v as "1" | "2")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Paper 1 — Objectives</SelectItem>
                  <SelectItem value="2">Paper 2 — Essay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {actionable.length} will update
                {skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}
                {appliedCount > 0
                  ? ` · ${appliedCount} have applied scores`
                  : ""}
              </div>
              <ul className="max-h-56 overflow-y-auto divide-y text-sm">
                {preview.map((row) => (
                  <li key={row.doc.id} className="px-3 py-2 font-mono text-xs">
                    {row.skipReason ? (
                      <span className="text-muted-foreground">
                        #{row.doc.id}: {row.skipReason}
                      </span>
                    ) : row.alreadyTarget ? (
                      <span className="text-muted-foreground">
                        {row.oldId} — already {paperName(targetTestType)}
                      </span>
                    ) : (
                      <span>
                        <span className="text-muted-foreground">{row.oldId}</span>
                        {" → "}
                        <span className="font-medium">{row.newId}</span>
                        {row.hasAppliedScores && (
                          <span className="ml-2 text-amber-700 dark:text-amber-400">
                            (scores move)
                          </span>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {appliedCount > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  {appliedCount} selected document(s) already have applied scores.
                  Those scores will move to {paperName(targetTestType)}.
                </p>
              </div>
            )}

            {ownershipPairs.length > 0 && (
              <div className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4">
                <div className="flex gap-2 text-sm text-sky-950 dark:text-sky-50">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300" />
                  <div>
                    <p className="font-medium">
                      {lastUpdated > 0 ? `Updated ${lastUpdated} · ` : ""}
                      {ownershipPairs.length} ID conflict
                      {ownershipPairs.length === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-sky-900/80 dark:text-sky-100/80 mt-0.5">
                      Another document already owns the target sheet ID. Compare
                      each pair, fix either ID, then continue reclassify.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={handleReviewConflicts}
                >
                  <Columns2 className="h-4 w-4" />
                  Compare sheets
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {ownershipPairs.length > 0 ? "Close" : "Cancel"}
            </Button>
            {ownershipPairs.length === 0 && (
              <Button onClick={handleApply} disabled={loading || actionable.length === 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resumeMode ? "Continue reclassify" : `Apply to ${actionable.length}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScoreMigrationConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        preview={confirmPreview}
        bulkSummary={{
          documentCount: actionable.length,
          appliedCount,
          targetPaperLabel: paperLabel(targetTestType),
        }}
        loading={loading}
        onConfirm={(overwrite) => void runReclassify(overwrite)}
      />
    </>
  );
}
