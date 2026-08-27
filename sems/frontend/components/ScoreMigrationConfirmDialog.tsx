"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  ScoreMigrationConflictItem,
  ScoreMigrationPreviewResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  Shuffle,
} from "lucide-react";

function HighlightedSheetId({
  id,
  highlightSubject,
  highlightPaper,
}: {
  id: string | null | undefined;
  highlightSubject?: boolean;
  highlightPaper?: boolean;
}) {
  if (!id || id.length !== 13) {
    return (
      <span className="font-mono text-sm text-muted-foreground">{id || "—"}</span>
    );
  }
  const school = id.slice(0, 6);
  const subject = id.slice(6, 9);
  const series = id.slice(9, 10);
  const paper = id.slice(10, 11);
  const sheet = id.slice(11, 13);
  return (
    <span className="font-mono text-sm tracking-wide">
      <span className="text-muted-foreground">{school}</span>
      <span
        className={cn(
          highlightSubject &&
            "rounded px-0.5 bg-amber-500/20 text-amber-950 dark:text-amber-100 font-semibold"
        )}
      >
        {subject}
      </span>
      <span className="text-muted-foreground">{series}</span>
      <span
        className={cn(
          highlightPaper &&
            "rounded px-0.5 bg-sky-500/20 text-sky-950 dark:text-sky-100 font-semibold"
        )}
      >
        {paper}
      </span>
      <span className="text-muted-foreground">{sheet}</span>
    </span>
  );
}

function MetaChip({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium truncate">{value || "—"}</span>
    </div>
  );
}

export type ScoreMigrationConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ScoreMigrationPreviewResponse | null;
  /** Optional bulk summary when preview is synthesized client-side */
  bulkSummary?: {
    documentCount: number;
    appliedCount: number;
    targetPaperLabel: string;
  };
  loading?: boolean;
  onConfirm: (overwrite: boolean) => void | Promise<void>;
  /** When ID ownership blocks continue, offer side-by-side compare */
  onCompareOwnership?: () => void;
};

export function ScoreMigrationConfirmDialog({
  open,
  onOpenChange,
  preview,
  bulkSummary,
  loading = false,
  onConfirm,
  onCompareOwnership,
}: ScoreMigrationConfirmDialogProps) {
  const [overwrite, setOverwrite] = useState(false);

  useEffect(() => {
    if (open) setOverwrite(false);
  }, [open, preview]);

  const conflicts: ScoreMigrationConflictItem[] = preview?.conflicts ?? [];
  const hasConflicts = conflicts.length > 0;
  const blocking = preview?.blocking_errors ?? [];
  const canContinue =
    blocking.length === 0 && (!hasConflicts || overwrite) && !loading;

  const subjectChanged = preview?.subject_changed ?? false;
  const paperChanged = preview?.paper_changed ?? Boolean(bulkSummary);
  const scoresToMove = preview?.scores_to_move ?? bulkSummary?.appliedCount ?? 0;

  const from = preview?.from_meta;
  const to = preview?.to_meta;

  const titleBits: string[] = [];
  if (subjectChanged) titleBits.push("subject");
  if (paperChanged) titleBits.push("paper");
  const changeLabel = titleBits.length ? titleBits.join(" & ") : "sheet";

  const destinationLabel = [
    to?.subject_name || to?.subject_code,
    to?.paper_label || bulkSummary?.targetPaperLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl gap-0 overflow-hidden p-0">
        <div className="relative overflow-hidden border-b bg-gradient-to-br from-muted/80 via-background to-background px-6 pt-6 pb-5">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-sky-500/10 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl"
            aria-hidden
          />
          <DialogHeader className="relative space-y-3 text-left">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20 animate-in zoom-in-95 duration-300">
                <Shuffle className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <DialogTitle className="text-xl tracking-tight">
                  Confirm {changeLabel} change
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Review what will happen before applied scores move with this
                  sheet.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5 max-h-[min(60vh,480px)] overflow-y-auto">
          {(from || to || bulkSummary) && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-xl border bg-card/50 p-4 shadow-sm">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="space-y-3 min-w-0 rounded-lg bg-muted/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    From
                  </p>
                  <HighlightedSheetId
                    id={from?.extracted_id}
                    highlightSubject={subjectChanged}
                    highlightPaper={paperChanged}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <MetaChip
                      label="Subject"
                      value={
                        from?.subject_name
                          ? `${from.subject_name}${from.subject_code ? ` (${from.subject_code})` : ""}`
                          : from?.subject_code
                      }
                    />
                    <MetaChip label="Paper" value={from?.paper_label} />
                  </div>
                </div>

                <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-sm">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="space-y-3 min-w-0 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-200">
                    To
                  </p>
                  <HighlightedSheetId
                    id={to?.extracted_id}
                    highlightSubject={subjectChanged}
                    highlightPaper={paperChanged}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <MetaChip
                      label="Subject"
                      value={
                        to?.subject_name
                          ? `${to.subject_name}${to.subject_code ? ` (${to.subject_code})` : ""}`
                          : to?.subject_code
                      }
                    />
                    <MetaChip
                      label="Paper"
                      value={to?.paper_label || bulkSummary?.targetPaperLabel}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl border px-4 py-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-medium">
                {scoresToMove > 0
                  ? `${scoresToMove} applied score${scoresToMove === 1 ? "" : "s"} will move${
                      destinationLabel ? ` to ${destinationLabel}` : ""
                    }.`
                  : "No applied scores to move; sheet subject/paper will still update."}
              </p>
              {bulkSummary && (
                <p className="text-xs text-muted-foreground">
                  {bulkSummary.documentCount} document
                  {bulkSummary.documentCount === 1 ? "" : "s"} selected
                  {bulkSummary.appliedCount > 0
                    ? ` · ${bulkSummary.appliedCount} with applied scores`
                    : ""}
                </p>
              )}
            </div>
          </div>

          {blocking.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-3">
              <div>
                <p className="font-medium mb-1">Cannot continue</p>
                <ul className="list-disc pl-4 space-y-1 text-destructive/90">
                  {blocking.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
              {onCompareOwnership && preview?.conflict_document_id != null && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-destructive/40 bg-background/80"
                  disabled={loading}
                  onClick={() => onCompareOwnership()}
                >
                  Compare side by side
                </Button>
              )}
            </div>
          )}

          {hasConflicts && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-400 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex gap-2 text-amber-950 dark:text-amber-50">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {conflicts.length} candidate
                    {conflicts.length === 1 ? "" : "s"} already{" "}
                    {conflicts.length === 1 ? "has" : "have"} scores on the
                    target
                  </p>
                  <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                    Continuing with override will replace those values with the
                    scores from this sheet.
                  </p>
                </div>
              </div>
              <ul className="max-h-36 overflow-y-auto rounded-lg border border-amber-500/20 bg-background/60 divide-y text-sm">
                {conflicts.map((c, i) => (
                  <li
                    key={`${c.subject_score_id ?? i}-${c.index_number}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">
                        {c.index_number || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.candidate_name || "Unknown candidate"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {c.existing_score ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg border border-amber-500/30 bg-background/50 px-3 py-2.5">
                <Checkbox
                  checked={overwrite}
                  onCheckedChange={(v) => setOverwrite(Boolean(v))}
                  className="mt-0.5"
                  disabled={loading}
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">Replace existing scores</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    I understand target scores will be overwritten and cannot be
                    undone from this dialog.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={hasConflicts ? "destructive" : "default"}
            disabled={!canContinue}
            onClick={() => void onConfirm(overwrite)}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasConflicts ? "Replace & continue" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
