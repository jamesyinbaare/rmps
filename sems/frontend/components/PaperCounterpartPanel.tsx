"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  FileText,
  Loader2,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import type { Document, School, Subject } from "@/types/document";
import {
  DocumentComparePane,
  type CompareCardDocument,
  type DocumentCompareUpdateId,
} from "@/components/DocumentComparePane";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { swapDocumentPapers } from "@/lib/api";
import { cn } from "@/lib/utils";

function statusLabel(status: string): string {
  switch (status) {
    case "success":
      return "ID extracted";
    case "error":
      return "ID error";
    case "pending":
      return "ID pending";
    default:
      return status;
  }
}

function PaperBadge({ paper }: { paper: "1" | "2" }) {
  const isObj = paper === "1";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
        isObj
          ? "bg-sky-500/15 text-sky-800 dark:text-sky-200"
          : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
      )}
    >
      {isObj ? "Objectives" : "Essay"}
    </span>
  );
}

function SwapRow({
  fromPaper,
  fromId,
  toPaper,
  toId,
}: {
  fromPaper: "1" | "2";
  fromId: string | null | undefined;
  toPaper: "1" | "2";
  toId: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/90 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <PaperBadge paper={fromPaper} />
        <p className="truncate font-mono text-sm font-semibold tracking-wide">
          {fromId || "—"}
        </p>
      </div>
      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:hidden">
        becomes
      </span>
      <div className="min-w-0 flex-1 space-y-1 sm:text-right">
        <div className="sm:flex sm:justify-end">
          <PaperBadge paper={toPaper} />
        </div>
        <p className="truncate font-mono text-sm font-semibold tracking-wide">
          {toId || "—"}
        </p>
      </div>
    </div>
  );
}

interface PaperCounterpartPanelProps {
  current: Document;
  counterpart: CompareCardDocument | null;
  loading?: boolean;
  schools: School[];
  subjects: Subject[];
  onDelete?: (documentId: number) => void;
  onUpdateId: DocumentCompareUpdateId;
  onCounterpartChanged?: () => void | Promise<void>;
}

export function PaperCounterpartPanel({
  current,
  counterpart,
  loading,
  schools,
  subjects,
  onDelete,
  onUpdateId,
  onCounterpartChanged,
}: PaperCounterpartPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapHint, setSwapHint] = useState(false);

  // Paper 1 (Objectives) on the left, Paper 2 (Essay) on the right.
  let paper1: CompareCardDocument | null = null;
  let paper2: CompareCardDocument | null = null;

  if (current.test_type === "1") {
    paper1 = current;
    paper2 = counterpart;
  } else if (current.test_type === "2") {
    paper2 = current;
    paper1 = counterpart;
  } else {
    paper1 = current;
    paper2 = counterpart;
  }

  const canSwap = !!paper1 && !!paper2 && !loading;
  const pairKey = paper1 && paper2 ? `${paper1.id}:${paper2.id}` : null;
  const id1 = paper1?.extracted_id ?? null;
  const id2 = paper2?.extracted_id ?? null;

  // Keep a gentle attention cue while a swappable pair is on screen.
  useEffect(() => {
    setSwapHint(Boolean(pairKey && canSwap));
  }, [pairKey, canSwap]);

  const handleSwap = async () => {
    if (!canSwap || swapping) return;
    setSwapping(true);
    try {
      const result = await swapDocumentPapers(current.id);
      const n = result.scores_swapped;
      toast.success(
        n > 0
          ? `Done — papers swapped, and ${n} candidate score${n === 1 ? "" : "s"} moved with the sheets.`
          : "Done — Objectives and Essay labels are swapped."
      );
      setConfirmOpen(false);
      await onCounterpartChanged?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't swap these papers";
      toast.error(message);
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {loading ? (
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="relative grid h-full min-h-0 grid-cols-2">
          <div className="h-full min-h-0 overflow-hidden border-r border-border">
            {paper1 ? (
              <DocumentComparePane
                doc={paper1}
                title="Paper 1 (Objectives)"
                tone="current"
                schools={schools}
                subjects={subjects}
                onDelete={onDelete}
                onUpdateId={onUpdateId}
                stayAfterSave={paper1.id !== current.id}
                onSaved={
                  paper1.id !== current.id
                    ? () => void onCounterpartChanged?.()
                    : undefined
                }
                statusLabel={statusLabel}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center bg-muted/20 px-8 text-center">
                <p className="text-sm font-medium">No Paper 1 (Objectives)</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No matching Objectives sheet for this school, subject, series, and page.
                </p>
              </div>
            )}
          </div>

          <div className="h-full min-h-0 overflow-hidden">
            {paper2 ? (
              <DocumentComparePane
                doc={paper2}
                title="Paper 2 (Essay)"
                tone="existing"
                schools={schools}
                subjects={subjects}
                onDelete={onDelete}
                onUpdateId={onUpdateId}
                stayAfterSave={paper2.id !== current.id}
                onSaved={
                  paper2.id !== current.id
                    ? () => void onCounterpartChanged?.()
                    : undefined
                }
                statusLabel={statusLabel}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center bg-muted/20 px-8 text-center">
                <p className="text-sm font-medium">No Paper 2 (Essay)</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No matching Essay sheet for this school, subject, series, and page.
                </p>
              </div>
            )}
          </div>

          <div className="absolute top-10 left-1/2 z-10 -translate-x-1/2">
            {canSwap ? (
              <div className={cn("relative", swapHint && "paper-swap-hint-wrap")}>
                {swapHint && (
                  <span
                    className="paper-swap-hint-ring pointer-events-none absolute inset-0 rounded-full"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={swapping}
                  title="Swap Objectives and Essay"
                  aria-describedby={swapHint ? "paper-swap-hint" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3.5 py-2",
                    "shadow-md shadow-black/5 backdrop-blur-md transition-all",
                    "hover:border-foreground/20 hover:bg-background hover:shadow-lg",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-60",
                    swapHint &&
                      "paper-swap-hint-btn border-sky-500/35 shadow-sky-500/10"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-amber-500/20 text-foreground transition-transform duration-300 group-hover:rotate-180",
                      swapHint && "paper-swap-hint-icon"
                    )}
                  >
                    {swapping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-xs font-semibold tracking-wide text-foreground">
                      Swap papers
                    </span>
                    {swapHint && (
                      <span
                        id="paper-swap-hint"
                        className="paper-swap-hint-caption text-[10px] font-medium text-muted-foreground"
                      >
                        Wrong sheet? Tap to fix
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ) : (
              <span className="pointer-events-none hidden rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground shadow-sm md:inline">
                VS
              </span>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!swapping) setConfirmOpen(open);
        }}
      >
        <DialogContent className="gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:max-w-lg sm:rounded-2xl">
          <div className="relative overflow-hidden px-6 pb-5 pt-6">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-500/15 via-background to-background"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-8 bottom-0 h-28 w-28 rounded-full bg-amber-400/15 blur-3xl"
              aria-hidden
            />
            <DialogHeader className="relative space-y-0 text-left">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-amber-500/20 text-foreground shadow-inner">
                  <Shuffle className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <DialogTitle className="text-lg font-semibold tracking-tight">
                    Swap Objectives and Essay?
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                    Use this when marks were recorded on the wrong score sheet —
                    Essay on an Objectives page, or the other way around.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-3 border-t border-border/60 bg-muted/20 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What will change
            </p>
            <SwapRow
              fromPaper="1"
              fromId={id1}
              toPaper="2"
              toId={id2}
            />
            <SwapRow
              fromPaper="2"
              fromId={id2}
              toPaper="1"
              toId={id1}
            />

            <ul className="mt-1 space-y-2.5 rounded-xl border border-border/50 bg-background/80 px-3.5 py-3.5 text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-2.5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                <span>
                  The sheet images stay where they are. Only the paper label
                  and the paper digit in the sheet ID flip.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Scores already entered move with each sheet, so marks stay
                  attached to the right paper.
                </span>
              </li>
            </ul>
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 bg-background px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={swapping}
              onClick={() => setConfirmOpen(false)}
            >
              Keep as is
            </Button>
            <Button
              type="button"
              disabled={swapping}
              onClick={() => void handleSwap()}
              className="min-w-[9.5rem] gap-2"
            >
              {swapping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Swapping…
                </>
              ) : (
                <>
                  <Shuffle className="h-4 w-4" />
                  Swap papers
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
