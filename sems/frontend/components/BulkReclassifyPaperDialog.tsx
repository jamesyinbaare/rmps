"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkReclassifyPaper } from "@/lib/api";
import type { Document } from "@/types/document";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

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

interface BulkReclassifyPaperDialogProps {
  documents: Document[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BulkReclassifyPaperDialog({
  documents,
  open,
  onOpenChange,
  onSuccess,
}: BulkReclassifyPaperDialogProps) {
  const [targetTestType, setTargetTestType] = useState<"1" | "2">("2");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const runReclassify = async () => {
    if (actionable.length === 0) {
      toast.error("No documents eligible to reclassify");
      return;
    }
    setLoading(true);
    try {
      const result = await bulkReclassifyPaper(
        actionable.map((p) => p.doc.id),
        targetTestType
      );
      if (result.updated > 0) {
        const moved =
          result.scores_moved > 0
            ? ` Moved scores for ${result.scores_moved} candidate row(s).`
            : "";
        toast.success(`Updated Paper on ${result.updated} document(s).${moved}`);
      }
      if (result.failed > 0) {
        const firstError = result.results.find((r) => r.error)?.error;
        toast.error(
          `Failed on ${result.failed} document(s)${firstError ? `: ${firstError}` : ""}`
        );
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk reclassify failed");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const handleApply = () => {
    if (actionable.length === 0) {
      toast.error("No documents eligible to reclassify");
      return;
    }
    if (appliedCount > 0) {
      setConfirmOpen(true);
      return;
    }
    void runReclassify();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Advanced Edit — Change Paper</DialogTitle>
            <DialogDescription>
              Rewrite the paper digit in each selected sheet ID (Objectives ↔ Essay).
              Applied scores move to the new paper fields.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
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
                  Those scores will be moved from the old paper fields to{" "}
                  {paperName(targetTestType)}.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={loading || actionable.length === 0}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply to {actionable.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move applied scores?</AlertDialogTitle>
            <AlertDialogDescription>
              {appliedCount} document(s) already have scores applied under their current
              paper. Continuing will move those scores to {paperName(targetTestType)} and
              mark the sheets as paper-changed. This cannot be undone from this dialog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                void runReclassify();
              }}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
