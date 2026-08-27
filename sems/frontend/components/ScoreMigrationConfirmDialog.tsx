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
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Columns2,
  FileText,
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
      <span className="font-mono text-lg tracking-[0.12em] text-muted-foreground">
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
    <span className="font-mono text-lg tracking-[0.12em]">
      <span className="text-muted-foreground/70">{school}</span>
      <span
        className={cn(
          highlightSubject
            ? "mx-0.5 rounded-md bg-amber-500/25 px-1 py-0.5 font-semibold text-amber-950 dark:text-amber-50"
            : "text-foreground/90"
        )}
      >
        {subject}
      </span>
      <span className="text-muted-foreground/70">{series}</span>
      <span
        className={cn(
          highlightPaper
            ? "mx-0.5 rounded-md bg-sky-500/25 px-1 py-0.5 font-semibold text-sky-950 dark:text-sky-50"
            : "text-foreground/90"
        )}
      >
        {paper}
      </span>
      <span className="text-muted-foreground/70">{sheet}</span>
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

function ChangeFlow({
  label,
  from,
  to,
  tone,
  icon: Icon,
}: {
  label: string;
  from: string;
  to: string;
  tone: "amber" | "sky";
  icon: typeof BookOpen;
}) {
  const toTone =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-950 ring-amber-500/25 dark:text-amber-50"
      : "bg-sky-500/15 text-sky-950 ring-sky-500/25 dark:text-sky-50";

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1",
          toTone
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground line-through decoration-muted-foreground/40">
            {from}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <span
            className={cn(
              "min-w-0 truncate rounded-md px-1.5 py-0.5 font-semibold ring-1 ring-inset",
              toTone
            )}
          >
            {to}
          </span>
        </div>
      </div>
    </div>
  );
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
      <DialogContent className="sm:max-w-xl gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="relative overflow-hidden px-6 pb-5 pt-6">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-500/15 via-background to-background"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl"
            aria-hidden
          />
          <DialogHeader className="relative space-y-0 text-left">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-sky-600/5 text-sky-700 shadow-inner ring-1 ring-sky-500/20 dark:text-sky-300 animate-in zoom-in-95 duration-300">
                <Shuffle className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Scores move with the sheet.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-5 max-h-[min(58vh,520px)] overflow-y-auto">
          {/* One composition: changes + before/after */}
          {(from || to || bulkSummary || subjectChanged || paperChanged) && (
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-muted/40 to-muted/10 shadow-sm">
              {(subjectChanged || paperChanged) && (
                <div className="space-y-3 border-b border-border/50 bg-background/40 px-5 py-4 backdrop-blur-sm">
                  {subjectChanged && (
                    <ChangeFlow
                      label="Subject"
                      from={subjectDisplay(from)}
                      to={subjectDisplay(to)}
                      tone="amber"
                      icon={BookOpen}
                    />
                  )}
                  {paperChanged && (
                    <ChangeFlow
                      label="Paper"
                      from={from?.paper_label || "—"}
                      to={to?.paper_label || bulkSummary?.targetPaperLabel || "—"}
                      tone="sky"
                      icon={FileText}
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
                <div className="space-y-3 px-5 py-5 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Before
                  </p>
                  <HighlightedSheetId
                    id={from?.extracted_id}
                    highlightSubject={subjectChanged}
                    highlightPaper={paperChanged}
                  />
                  <div className="space-y-0.5">
                    <p className="truncate text-[15px] font-medium leading-snug">
                      {subjectDisplay(from)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {from?.paper_label || "—"}
                    </p>
                  </div>
                </div>

                <div className="relative flex items-center justify-center px-0">
                  <div className="absolute inset-y-6 w-px bg-border/70" aria-hidden />
                  <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background shadow-md animate-in zoom-in-50 duration-500">
                    <ArrowRight className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                </div>

                <div className="relative space-y-3 px-5 py-5 min-w-0 animate-in fade-in slide-in-from-right-3 duration-500">
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent"
                    aria-hidden
                  />
                  <p className="relative text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                    After
                  </p>
                  <div className="relative">
                    <HighlightedSheetId
                      id={to?.extracted_id}
                      highlightSubject={subjectChanged}
                      highlightPaper={paperChanged}
                    />
                  </div>
                  <div className="relative space-y-0.5">
                    <p className="truncate text-[15px] font-medium leading-snug">
                      {subjectDisplay(to)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {to?.paper_label || bulkSummary?.targetPaperLabel || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {bulkSummary && (
                <p className="border-t border-border/50 px-5 py-2.5 text-xs text-muted-foreground">
                  {bulkSummary.documentCount} document
                  {bulkSummary.documentCount === 1 ? "" : "s"} selected
                  {bulkSummary.appliedCount > 0
                    ? ` · ${bulkSummary.appliedCount} with applied scores`
                    : ""}
                </p>
              )}
            </div>
          )}

          {hasOwnership && (
            <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-transparent p-4">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
                  <Columns2 className="h-4 w-4" />
                </div>
                <div className="space-y-1 min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-sky-950 dark:text-sky-50">
                    ID already owned
                  </p>
                  <p className="text-xs leading-relaxed text-sky-900/75 dark:text-sky-100/75">
                    Another sheet already uses this ID. Compare both documents,
                    fix either ID, then return here to finish.
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasUnregistered && (
            <div className="animate-in fade-in duration-300 rounded-2xl border border-destructive/30 bg-gradient-to-br from-destructive/10 to-transparent p-4 space-y-2">
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setUnregisteredExpanded((v) => !v)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-destructive">
                    {unregistered.length} candidate
                    {unregistered.length === 1 ? " isn’t" : "s aren’t"} registered
                    for {to?.subject_name || to?.subject_code || "the new subject"}
                  </p>
                  <p className="mt-0.5 text-xs text-destructive/75">
                    Register them for this subject, or choose a different target.
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 mt-2 text-destructive transition-transform duration-200",
                    unregisteredExpanded && "rotate-180"
                  )}
                />
              </button>
              {unregisteredExpanded && (
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-destructive/15 bg-background/70 divide-y text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                  {unregistered.map((u, i) => (
                    <li
                      key={`${u.index_number ?? i}-${u.candidate_name}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
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
            <div className="rounded-2xl border border-destructive/30 bg-gradient-to-br from-destructive/10 to-transparent p-4 space-y-2">
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setOtherErrorsExpanded((v) => !v)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-destructive">
                    {otherBlocking.length === 1
                      ? "Cannot continue"
                      : `${otherBlocking.length} issues block this change`}
                  </p>
                  {!otherErrorsExpanded && (
                    <p className="mt-0.5 text-xs text-destructive/75 truncate">
                      {otherBlocking[0]}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 mt-2 text-destructive transition-transform duration-200",
                    otherErrorsExpanded && "rotate-180"
                  )}
                />
              </button>
              {otherErrorsExpanded && (
                <ul className="list-disc space-y-1 pl-12 text-sm text-destructive/90">
                  {otherBlocking.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!hasOwnership && !isBlocked && hasConflicts && (
            <div className="animate-in fade-in duration-300 space-y-3 rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/12 to-transparent p-4">
              <div className="flex gap-3 text-amber-950 dark:text-amber-50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="space-y-1 pt-0.5">
                  <p className="text-sm font-semibold">
                    Overwrite needed · {conflicts.length} candidate
                    {conflicts.length === 1 ? "" : "s"} already{" "}
                    {conflicts.length === 1 ? "has" : "have"} scores on the target
                  </p>
                  <p className="text-xs text-amber-900/75 dark:text-amber-100/75">
                    Confirm replace to continue with those values overwritten.
                  </p>
                </div>
              </div>
              <ul className="max-h-36 overflow-y-auto rounded-xl border border-amber-500/20 bg-background/70 divide-y text-sm">
                {conflicts.map((c, i) => (
                  <li
                    key={`${c.subject_score_id ?? i}-${c.index_number}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
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
              <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-xl border border-amber-500/30 bg-background/60 px-3.5 py-3">
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
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    This cannot be undone from this dialog.
                  </span>
                </span>
              </label>
            </div>
          )}

          {!hasOwnership && !isBlocked && !hasConflicts && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent px-4 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <p className="pt-1.5 text-sm font-medium leading-snug">
                {scoresToMove > 0
                  ? `Ready · ${scoresToMove} score${scoresToMove === 1 ? "" : "s"} will move${
                      destinationLabel ? ` to ${destinationLabel}` : ""
                    }.`
                  : "Ready · no applied scores to move; sheet subject/paper will still update."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/15 px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-muted-foreground"
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
            className="min-w-[9.5rem] rounded-xl shadow-sm"
            disabled={hasOwnership ? loading : !canContinue}
            onClick={handlePrimary}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasOwnership && !loading && <Columns2 className="mr-2 h-4 w-4" />}
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
