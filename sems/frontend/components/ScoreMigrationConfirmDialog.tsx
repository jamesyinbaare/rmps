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
  ScoreMigrationUnregisteredItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Loader2,
  Shuffle,
} from "lucide-react";

function HighlightedSheetId({
  id,
  highlightSubject,
  highlightPaper,
  size = "md",
}: {
  id: string | null | undefined;
  highlightSubject?: boolean;
  highlightPaper?: boolean;
  size?: "md" | "lg";
}) {
  const textClass = size === "lg" ? "text-base sm:text-lg" : "text-sm";
  if (!id || id.length !== 13) {
    return (
      <span className={cn("font-mono text-muted-foreground", textClass)}>
        {id || "—"}
      </span>
    );
  }
  const school = id.slice(0, 6);
  const subject = id.slice(6, 9);
  const series = id.slice(9, 10);
  const paper = id.slice(10, 11);
  const sheet = id.slice(11, 13);
  return (
    <span className={cn("font-mono tracking-wide", textClass)}>
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

function subjectDisplay(meta: {
  subject_name?: string | null;
  subject_code?: string | null;
} | null | undefined): string {
  if (!meta) return "—";
  if (meta.subject_name) {
    return meta.subject_code
      ? `${meta.subject_name} (${meta.subject_code})`
      : meta.subject_name;
  }
  return meta.subject_code || "—";
}

function parseUnregisteredFromErrors(
  errors: string[]
): ScoreMigrationUnregisteredItem[] {
  const items: ScoreMigrationUnregisteredItem[] = [];
  for (const err of errors) {
    const match = err.match(
      /Candidate\s+(\S+)\s+\(([^)]+)\)\s+is not registered/i
    );
    if (match) {
      items.push({ index_number: match[1], candidate_name: match[2] });
    }
  }
  return items;
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
  const [unregisteredExpanded, setUnregisteredExpanded] = useState(false);
  const [otherErrorsExpanded, setOtherErrorsExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setOverwrite(false);
      setUnregisteredExpanded(false);
      setOtherErrorsExpanded(false);
    }
  }, [open, preview]);

  const conflicts: ScoreMigrationConflictItem[] = preview?.conflicts ?? [];
  const hasConflicts = conflicts.length > 0;
  const ownershipId = preview?.conflict_document_id ?? null;
  const hasOwnership = ownershipId != null && Boolean(onCompareOwnership);

  const structuredUnregistered = preview?.unregistered ?? [];
  const blockingRaw = preview?.blocking_errors ?? [];
  const parsedFromErrors =
    structuredUnregistered.length === 0
      ? parseUnregisteredFromErrors(blockingRaw)
      : [];
  const unregistered =
    structuredUnregistered.length > 0
      ? structuredUnregistered
      : parsedFromErrors;
  const otherBlocking =
    structuredUnregistered.length > 0
      ? blockingRaw
      : blockingRaw.filter(
          (e) => !/is not registered/i.test(e) && !/already uses ID/i.test(e)
        );

  const hasUnregistered = unregistered.length > 0;
  const hasOtherBlocking = otherBlocking.length > 0;
  const isBlocked = hasUnregistered || hasOtherBlocking;

  const canContinue =
    !hasOwnership &&
    !isBlocked &&
    (!hasConflicts || overwrite) &&
    !loading;

  const subjectChanged = preview?.subject_changed ?? false;
  const paperChanged = preview?.paper_changed ?? Boolean(bulkSummary);
  const scoresToMove = preview?.scores_to_move ?? bulkSummary?.appliedCount ?? 0;

  const from = preview?.from_meta;
  const to = preview?.to_meta;

  const title =
    subjectChanged && paperChanged
      ? "Change subject & paper"
      : subjectChanged
        ? "Change subject"
        : paperChanged
          ? "Change paper"
          : "Sheet change";

  const destinationLabel = [
    to?.subject_name || to?.subject_code,
    to?.paper_label || bulkSummary?.targetPaperLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const primaryLabel = hasOwnership
    ? "Compare sheets"
    : hasConflicts
      ? "Replace & continue"
      : "Continue";

  const handlePrimary = () => {
    if (hasOwnership && onCompareOwnership) {
      onCompareOwnership();
      return;
    }
    void onConfirm(overwrite);
  };

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
                <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Scores move with the sheet.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5 max-h-[min(60vh,480px)] overflow-y-auto">
          {(from || to || bulkSummary) && (
            <div className="relative overflow-hidden rounded-xl border bg-muted/30">
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0">
                <div className="space-y-2 px-4 py-4 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Before
                  </p>
                  <HighlightedSheetId
                    id={from?.extracted_id}
                    highlightSubject={subjectChanged}
                    highlightPaper={paperChanged}
                    size="lg"
                  />
                  <div className="space-y-0.5 pt-1">
                    <p className="text-sm font-medium leading-snug truncate">
                      {subjectDisplay(from)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {from?.paper_label || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center px-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-sm">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2 border-l border-sky-500/20 bg-sky-500/5 px-4 py-4 min-w-0 animate-in fade-in slide-in-from-right-2 duration-400">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-200">
                    After
                  </p>
                  <HighlightedSheetId
                    id={to?.extracted_id}
                    highlightSubject={subjectChanged}
                    highlightPaper={paperChanged}
                    size="lg"
                  />
                  <div className="space-y-0.5 pt-1">
                    <p className="text-sm font-medium leading-snug truncate">
                      {subjectDisplay(to)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {to?.paper_label || bulkSummary?.targetPaperLabel || "—"}
                    </p>
                  </div>
                </div>
              </div>
              {bulkSummary && (
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                  {bulkSummary.documentCount} document
                  {bulkSummary.documentCount === 1 ? "" : "s"} selected
                  {bulkSummary.appliedCount > 0
                    ? ` · ${bulkSummary.appliedCount} with applied scores`
                    : ""}
                </p>
              )}
            </div>
          )}

          {/* Outcome strip — ownership first when present */}
          {hasOwnership && (
            <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 space-y-3">
              <div className="flex gap-2.5">
                <Columns2 className="h-4 w-4 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300" />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-sky-950 dark:text-sky-50">
                    ID already owned
                  </p>
                  <p className="text-xs text-sky-900/80 dark:text-sky-100/80">
                    Another sheet already uses this ID. Compare both documents,
                    fix either ID, then return here to finish.
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasUnregistered && (
            <div className="animate-in fade-in duration-300 rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
              <button
                type="button"
                className="flex w-full items-start gap-2.5 text-left"
                onClick={() => setUnregisteredExpanded((v) => !v)}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-destructive">
                    {unregistered.length} candidate
                    {unregistered.length === 1 ? " isn’t" : "s aren’t"} registered
                    for {to?.subject_name || to?.subject_code || "the new subject"}
                  </p>
                  <p className="text-xs text-destructive/80 mt-0.5">
                    Register them for this subject, or choose a different target.
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 mt-0.5 text-destructive transition-transform",
                    unregisteredExpanded && "rotate-180"
                  )}
                />
              </button>
              {unregisteredExpanded && (
                <ul className="max-h-40 overflow-y-auto rounded-lg border border-destructive/20 bg-background/60 divide-y text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                  {unregistered.map((u, i) => (
                    <li
                      key={`${u.index_number ?? i}-${u.candidate_name}`}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="font-mono text-xs truncate">
                        {u.index_number || "—"}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {u.candidate_name || "Unknown"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasOtherBlocking && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
              <button
                type="button"
                className="flex w-full items-start gap-2.5 text-left"
                onClick={() => setOtherErrorsExpanded((v) => !v)}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-destructive">
                    {otherBlocking.length === 1
                      ? "Cannot continue"
                      : `${otherBlocking.length} issues block this change`}
                  </p>
                  {!otherErrorsExpanded && (
                    <p className="text-xs text-destructive/80 mt-0.5 truncate">
                      {otherBlocking[0]}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 mt-0.5 text-destructive transition-transform",
                    otherErrorsExpanded && "rotate-180"
                  )}
                />
              </button>
              {otherErrorsExpanded && (
                <ul className="list-disc pl-8 space-y-1 text-sm text-destructive/90">
                  {otherBlocking.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!hasOwnership && !isBlocked && hasConflicts && (
            <div className="animate-in fade-in duration-300 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex gap-2 text-amber-950 dark:text-amber-50">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Overwrite needed · {conflicts.length} candidate
                    {conflicts.length === 1 ? "" : "s"} already{" "}
                    {conflicts.length === 1 ? "has" : "have"} scores on the target
                  </p>
                  <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                    Confirm replace to continue with those values overwritten.
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
                  <span className="font-medium">
                    Replace existing scores on the target
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    This cannot be undone from this dialog.
                  </span>
                </span>
              </label>
            </div>
          )}

          {!hasOwnership && !isBlocked && !hasConflicts && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-400" />
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium">
                  {scoresToMove > 0
                    ? `Ready · ${scoresToMove} score${scoresToMove === 1 ? "" : "s"} will move${
                        destinationLabel ? ` to ${destinationLabel}` : ""
                      }.`
                    : "Ready · no applied scores to move; sheet subject/paper will still update."}
                </p>
              </div>
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
            variant={
              hasOwnership
                ? "default"
                : hasConflicts && !isBlocked
                  ? "destructive"
                  : "default"
            }
            disabled={hasOwnership ? loading : !canContinue}
            onClick={handlePrimary}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasOwnership && <Columns2 className="mr-2 h-4 w-4" />}
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
