"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Rows2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE_URL, confirmAbsentReview, updateScore } from "@/lib/api";
import {
  createDocumentPrefetchCache,
  mapPool,
  type DocumentPrefetchCache,
} from "@/lib/document-prefetch-cache";
import { MarkerBadge, PaperChip, Kbd } from "@/components/absent-review-ui";
import type { AbsentReviewEntry, ScoreUpdate } from "@/types/document";

type WorkspaceLayout = "horizontal" | "vertical";

const LAYOUT_STORAGE_KEY = "sems.absentReviewWorkspace.layout";
const PREFETCH_UNIQUE_DOCS = 3;
const PREFETCH_ENTRY_SCAN_LIMIT = 15;
const PREFETCH_BLOB_CONCURRENCY = 2;

function readStoredLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return "horizontal";
  try {
    const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored === "vertical" || stored === "horizontal") return stored;
  } catch {
    /* ignore */
  }
  return "horizontal";
}

function entryKey(entry: AbsentReviewEntry) {
  return `${entry.score_id}:${entry.field_name}`;
}

function currentFieldValue(entry: AbsentReviewEntry): string | null {
  switch (entry.field_name) {
    case "obj_raw_score":
      return entry.obj_raw_score;
    case "essay_raw_score":
      return entry.essay_raw_score;
    case "pract_raw_score":
      return entry.pract_raw_score;
    default:
      return null;
  }
}

function documentUrl(entry: Pick<AbsentReviewEntry, "document_id" | "exam_id">) {
  return `${API_BASE_URL}/api/v1/documents/by-extracted-id/${entry.document_id}/download?exam_id=${entry.exam_id}`;
}

function documentKey(
  entry: Pick<AbsentReviewEntry, "document_id" | "exam_id"> | null
): string | null {
  if (!entry?.document_id || entry.exam_id == null) return null;
  return `${entry.document_id}:${entry.exam_id}`;
}

function isPrefetchableDocument(
  entry: Pick<AbsentReviewEntry, "document_id" | "exam_id"> | null
): entry is Pick<AbsentReviewEntry, "document_id" | "exam_id"> & {
  document_id: string;
  exam_id: number;
} {
  return !!entry?.document_id && entry.exam_id != null;
}

function isAbsentValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const upper = value.trim().toUpperCase();
  return upper === "A" || upper === "AA" || upper === "AAA";
}

export interface AbsentReviewWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: AbsentReviewEntry[];
  currentIndex: number | null;
  onCurrentIndexChange: (index: number | null) => void;
  onHandled?: (key: string, action: "confirmed" | "corrected") => void;
  onEntryUpdated?: (entry: AbsentReviewEntry) => void;
  sessionConfirmed?: number;
  sessionCorrected?: number;
}

export function AbsentReviewWorkspace({
  open,
  onOpenChange,
  entries,
  currentIndex,
  onCurrentIndexChange,
  onHandled,
  onEntryUpdated,
  sessionConfirmed = 0,
  sessionCorrected = 0,
}: AbsentReviewWorkspaceProps) {
  const entry = currentIndex !== null ? entries[currentIndex] ?? null : null;

  const [correctedScore, setCorrectedScore] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<WorkspaceLayout>("horizontal");
  const [prefetchEpoch, setPrefetchEpoch] = useState(0);

  const correctedScoreInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);
  const prefetchCacheRef = useRef<DocumentPrefetchCache | null>(null);
  if (!prefetchCacheRef.current) {
    prefetchCacheRef.current = createDocumentPrefetchCache();
  }
  const prefetchCache = prefetchCacheRef.current;

  useEffect(() => {
    setLayout(readStoredLayout());
  }, []);

  useEffect(() => {
    return prefetchCache.subscribe(() => {
      setPrefetchEpoch((n) => n + 1);
    });
  }, [prefetchCache]);

  const setLayoutPreference = (next: WorkspaceLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const resetViewer = useCallback(() => {
    setZoom(1);
    setImageLoading(true);
    setImageError(false);
    if (viewerRef.current) {
      viewerRef.current.scrollTop = 0;
      viewerRef.current.scrollLeft = 0;
    }
  }, []);

  useEffect(() => {
    if (open && entry) {
      const nextDocKey = documentKey(entry);
      if (nextDocKey !== loadedDocumentKeyRef.current) {
        resetViewer();
        loadedDocumentKeyRef.current = nextDocKey;
      }
      setCorrectedScore(currentFieldValue(entry) || "");
      if (isPrefetchableDocument(entry) && nextDocKey) {
        void prefetchCache.ensure(nextDocKey, documentUrl(entry), entry.document_mime_type);
      }
    }
    if (!open) {
      setCorrectedScore("");
      loadedDocumentKeyRef.current = null;
      prefetchCache.clear();
      resetViewer();
    }
  }, [open, entry, resetViewer, prefetchCache]);

  useEffect(() => {
    if (!open || currentIndex === null) return;

    let cancelled = false;

    const run = async () => {
      const currentKey = documentKey(entry);
      const upcoming = entries.slice(
        currentIndex + 1,
        currentIndex + 1 + PREFETCH_ENTRY_SCAN_LIMIT
      );

      const uniqueKeys: string[] = [];
      const keyToEntry = new Map<string, AbsentReviewEntry>();
      if (currentKey && entry && isPrefetchableDocument(entry)) {
        uniqueKeys.push(currentKey);
        keyToEntry.set(currentKey, entry);
      }

      const targetCount = uniqueKeys.length + PREFETCH_UNIQUE_DOCS;
      for (const nextEntry of upcoming) {
        if (uniqueKeys.length >= targetCount) break;
        if (!isPrefetchableDocument(nextEntry)) continue;
        const key = documentKey(nextEntry);
        if (!key || keyToEntry.has(key)) continue;
        keyToEntry.set(key, nextEntry);
        uniqueKeys.push(key);
      }

      prefetchCache.retain(uniqueKeys);

      const toFetch = uniqueKeys.filter((key) => !prefetchCache.get(key));
      await mapPool(toFetch, PREFETCH_BLOB_CONCURRENCY, async (key) => {
        if (cancelled) return;
        const nextEntry = keyToEntry.get(key);
        if (!nextEntry || !isPrefetchableDocument(nextEntry)) return;
        await prefetchCache.ensure(key, documentUrl(nextEntry), nextEntry.document_mime_type);
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [open, currentIndex, entries, entry, prefetchCache]);

  useEffect(() => {
    if (open && entry && !saving) {
      const timer = setTimeout(() => {
        correctedScoreInputRef.current?.focus();
        correctedScoreInputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, entry, saving]);

  useEffect(() => {
    return () => {
      prefetchCache.clear();
    };
  }, [prefetchCache]);

  const handleClose = () => {
    onOpenChange(false);
    onCurrentIndexChange(null);
  };

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (currentIndex === null || entries.length === 0) return;
      const newIndex =
        direction === "prev"
          ? Math.max(0, currentIndex - 1)
          : Math.min(entries.length - 1, currentIndex + 1);
      if (newIndex !== currentIndex) {
        onCurrentIndexChange(newIndex);
      }
    },
    [currentIndex, entries.length, onCurrentIndexChange]
  );

  const finishHandle = useCallback(
    (key: string, action: "confirmed" | "corrected") => {
      const remainingCount = entries.length - 1;
      onHandled?.(key, action);
      if (currentIndex === null || remainingCount <= 0 || currentIndex >= remainingCount) {
        onOpenChange(false);
        onCurrentIndexChange(null);
      }
    },
    [entries.length, onHandled, currentIndex, onOpenChange, onCurrentIndexChange]
  );

  const handleSave = useCallback(async () => {
    if (!entry) return;

    const trimmed = correctedScore.trim();
    if (!trimmed) {
      toast.error("Enter a corrected score");
      correctedScoreInputRef.current?.focus();
      return;
    }

    if (entry.max_score != null && entry.max_score > 0) {
      const upper = trimmed.toUpperCase();
      if (!["A", "AA", "AAA"].includes(upper)) {
        if (trimmed.includes(".")) {
          toast.error("Score must be a whole number");
          return;
        }
        const num = Number(trimmed);
        if (!Number.isFinite(num) || num < 0 || num > entry.max_score) {
          toast.error(`Score must be between 0 and ${entry.max_score}, or A/AA/AAA`);
          return;
        }
      }
    }

    const update: ScoreUpdate = {};
    if (entry.field_name === "obj_raw_score") update.obj_raw_score = trimmed;
    else if (entry.field_name === "essay_raw_score") update.essay_raw_score = trimmed;
    else if (entry.field_name === "pract_raw_score") update.pract_raw_score = trimmed;

    setSaving(true);
    try {
      const response = await updateScore(entry.score_id, update);

      const updatedEntry: AbsentReviewEntry = {
        ...entry,
        obj_raw_score: response.obj_raw_score,
        essay_raw_score: response.essay_raw_score,
        pract_raw_score: response.pract_raw_score,
        total_score: response.total_score,
      };

      const fieldValue =
        entry.field_name === "obj_raw_score"
          ? response.obj_raw_score
          : entry.field_name === "essay_raw_score"
            ? response.essay_raw_score
            : response.pract_raw_score;

      if (isAbsentValue(fieldValue)) {
        toast.success("Absent marker updated");
        onEntryUpdated?.(updatedEntry);
        setCorrectedScore(fieldValue || "");
      } else {
        const nextCorrected = sessionCorrected + 1;
        toast.success(`Corrected · ${nextCorrected} this session`);
        finishHandle(entryKey(entry), "corrected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update score");
    } finally {
      setSaving(false);
    }
  }, [entry, correctedScore, finishHandle, onEntryUpdated, sessionCorrected]);

  const handleConfirm = useCallback(async () => {
    if (!entry) return;

    setConfirming(true);
    try {
      await confirmAbsentReview({
        score_id: entry.score_id,
        field_name: entry.field_name,
      });
      const nextConfirmed = sessionConfirmed + 1;
      toast.success(`Confirmed · ${nextConfirmed} this session`);
      finishHandle(entryKey(entry), "confirmed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm absent mark");
    } finally {
      setConfirming(false);
    }
  }, [entry, finishHandle, sessionConfirmed]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && entry) {
        if (isInputFocused || e.target === document.body || e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            if (!confirming && !saving) void handleConfirm();
          } else if (!saving && !confirming) {
            void handleSave();
          }
          return;
        }
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || e.key === "Y") &&
        entry
      ) {
        e.preventDefault();
        if (!confirming && !saving) void handleConfirm();
        return;
      }

      if (isInputFocused) {
        const input = e.target as HTMLInputElement;
        const hasSelection = input.selectionStart !== input.selectionEnd;
        const isAtStart = input.selectionStart === 0;
        const isAtEnd = input.selectionStart === input.value.length;
        if (e.key === "ArrowLeft" && !isAtStart && !hasSelection) return;
        if (e.key === "ArrowRight" && !isAtEnd && !hasSelection) return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigate("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigate("next");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, entry, saving, confirming, handleSave, handleConfirm, handleNavigate]);

  const hasPdf =
    !!entry?.document_id &&
    !!entry.exam_id &&
    (entry.document_mime_type === "application/pdf" ||
      !!entry.document_file_name?.toLowerCase().endsWith(".pdf"));

  const hasImage =
    !!entry?.document_id &&
    !!entry.exam_id &&
    !hasPdf &&
    (!entry.document_mime_type || entry.document_mime_type.startsWith("image/"));

  const hasDocument = hasImage || hasPdf;

  const currentDocKey = documentKey(entry);
  const prefetchedSheet =
    prefetchEpoch > -1 && currentDocKey ? prefetchCache.get(currentDocKey) : undefined;
  const sheetSrc =
    prefetchedSheet?.blobUrl ??
    (entry && isPrefetchableDocument(entry) ? documentUrl(entry) : "");

  const handleWheel = (e: React.WheelEvent) => {
    if (!hasImage) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.5, Math.round((z + delta) * 10) / 10)));
    }
  };

  const positionLabel =
    currentIndex !== null ? `${currentIndex + 1} of ${entries.length}` : "";

  const currentValue = entry ? currentFieldValue(entry) : null;
  const inputChanged =
    !!entry &&
    correctedScore.trim().toUpperCase() !== (currentValue ?? "").trim().toUpperCase();

  const sideBySide = layout === "horizontal" && hasDocument;
  const stacked = layout === "vertical" && hasDocument;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton
        className="!fixed !inset-2 !top-2 !left-2 !right-2 !bottom-2 !translate-x-0 !translate-y-0 !w-auto !max-w-none !h-auto !max-h-none overflow-hidden flex flex-col p-0 gap-0 rounded-xl sm:!max-w-none"
      >
        <DialogHeader className="px-4 py-2 border-b shrink-0 space-y-0">
          {entry ? (
            <div className="flex items-center justify-between gap-4 pr-8">
              <div className="min-w-0 flex items-baseline gap-3">
                <DialogTitle className="text-xl font-bold tabular-nums tracking-tight">
                  {entry.candidate_index_number || "No index"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Review absent mark for {entry.candidate_name}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-1">
                {hasDocument ? (
                  <div
                    className="inline-flex rounded-md border bg-background p-0.5"
                    role="group"
                    aria-label="Workspace layout"
                  >
                    <Button
                      type="button"
                      variant={layout === "horizontal" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => setLayoutPreference("horizontal")}
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      Side by side
                    </Button>
                    <Button
                      type="button"
                      variant={layout === "vertical" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => setLayoutPreference("vertical")}
                    >
                      <Rows2 className="h-3.5 w-3.5" />
                      Stacked
                    </Button>
                  </div>
                ) : null}
                <MarkerBadge marker={entry.absent_marker} />
                {entries.length > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">{positionLabel}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <DialogTitle>Absent Review</DialogTitle>
              <DialogDescription>Review and correct absent marks</DialogDescription>
            </>
          )}
        </DialogHeader>

        {!entry ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className={`flex flex-1 min-h-0 overflow-hidden ${
              sideBySide ? "flex-row" : "flex-col"
            }`}
          >
            {hasDocument ? (
              <div
                className={`relative flex min-h-0 flex-col bg-muted/30 ${
                  sideBySide ? "flex-1 border-r" : stacked ? "h-[55%] border-b" : "hidden"
                }`}
              >
                {hasImage ? (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border bg-background/90 p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
                      }
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs tabular-nums w-10 text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => {
                        setZoom(1);
                        if (viewerRef.current) {
                          viewerRef.current.scrollTop = 0;
                          viewerRef.current.scrollLeft = 0;
                        }
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Fit
                    </Button>
                  </div>
                ) : null}
                <div
                  ref={viewerRef}
                  className={`relative flex-1 min-h-0 overscroll-contain ${
                    hasImage && zoom > 1 ? "overflow-auto" : "overflow-hidden"
                  }`}
                  onWheel={handleWheel}
                >
                  {hasImage ? (
                    <>
                      {imageError ? (
                        <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted-foreground">
                          Could not load score sheet
                        </div>
                      ) : (
                        <>
                          {imageLoading ? (
                            <Skeleton className="absolute inset-0 z-10 rounded-none" />
                          ) : null}
                          {zoom <= 1 ? (
                            <div className="absolute inset-0 flex items-center justify-center p-2">
                              <img
                                key={`doc-${entry.document_id}-${entry.exam_id}-${prefetchedSheet ? "b" : "n"}`}
                                src={sheetSrc}
                                alt={entry.document_file_name || "Score sheet"}
                                className="max-h-full max-w-full h-auto w-auto select-none rounded-sm bg-white object-contain shadow-sm"
                                style={{
                                  transform: zoom < 1 ? `scale(${zoom})` : undefined,
                                  transformOrigin: "center center",
                                  opacity: imageLoading ? 0 : 1,
                                  transition: "opacity 0.2s ease-in-out",
                                }}
                                draggable={false}
                                onLoad={() => {
                                  setImageLoading(false);
                                  setImageError(false);
                                }}
                                onError={() => {
                                  setImageLoading(false);
                                  setImageError(true);
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="flex items-center justify-center p-2"
                              style={{
                                width: `${zoom * 100}%`,
                                height: `${zoom * 100}%`,
                                minWidth: "100%",
                                minHeight: "100%",
                              }}
                            >
                              <img
                                key={`doc-zoom-${entry.document_id}-${entry.exam_id}-${prefetchedSheet ? "b" : "n"}`}
                                src={sheetSrc}
                                alt={entry.document_file_name || "Score sheet"}
                                className="max-h-full max-w-full h-auto w-auto select-none rounded-sm bg-white object-contain shadow-sm"
                                style={{
                                  opacity: imageLoading ? 0 : 1,
                                  transition: "opacity 0.2s ease-in-out",
                                }}
                                draggable={false}
                                onLoad={() => {
                                  setImageLoading(false);
                                  setImageError(false);
                                }}
                                onError={() => {
                                  setImageLoading(false);
                                  setImageError(true);
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <iframe
                      key={`pdf-${entry.document_id}-${entry.exam_id}-${prefetchedSheet ? "b" : "n"}`}
                      src={sheetSrc}
                      title={entry.document_file_name || "Score sheet"}
                      className="absolute inset-0 h-full w-full border-0 bg-white"
                      onLoad={() => setImageLoading(false)}
                      onError={() => {
                        setImageLoading(false);
                        setImageError(true);
                      }}
                    />
                  )}
                </div>
              </div>
            ) : null}

            <div
              className={`flex min-h-0 flex-col ${
                sideBySide ? "w-[min(420px,38%)] shrink-0" : "flex-1"
              }`}
            >
              <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
                {entries.length > 0 ? (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{positionLabel}</span>
                      <span className="tabular-nums">{entries.length} remaining</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{
                          width: `${Math.max(
                            8,
                            ((currentIndex ?? 0) + 1) / Math.max(entries.length, 1) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <p className="text-lg font-bold truncate tracking-tight">{entry.candidate_name}</p>
                  <p className="text-sm tabular-nums font-semibold mt-0.5">
                    {entry.candidate_index_number}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {entry.subject_code} · {entry.subject_name}
                    {entry.school_name ? ` · ${entry.school_name}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paper</p>
                    <div className="mt-1">
                      <PaperChip testType={entry.test_type} compact={false} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total / Grade</p>
                    <p className="mt-1 font-mono tabular-nums">
                      {entry.total_score}
                      {entry.grade ? ` · ${entry.grade}` : ""}
                    </p>
                  </div>
                </div>
                {!hasDocument ? (
                  <p className="text-sm text-muted-foreground">No score sheet linked for this paper.</p>
                ) : null}
              </div>

              <div className="shrink-0 border-t bg-background px-4 py-3 space-y-3">
                <div className={sideBySide ? "flex flex-col gap-3" : "flex flex-wrap items-end gap-3"}>
                  <div className="flex min-w-0 flex-1 items-end gap-3">
                    <div className="shrink-0">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Current
                      </p>
                      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                        {currentFieldValue(entry) ?? "—"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="absent-corrected-score"
                        className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Corrected
                        {entry.max_score != null && entry.max_score > 0
                          ? ` (max ${entry.max_score})`
                          : ""}
                      </label>
                      <Input
                        ref={correctedScoreInputRef}
                        id="absent-corrected-score"
                        value={correctedScore}
                        onChange={(e) => setCorrectedScore(e.target.value)}
                        placeholder={
                          entry.max_score != null && entry.max_score > 0
                            ? `0–${entry.max_score} or A`
                            : "e.g. 85"
                        }
                        className="mt-0.5 h-11 font-mono text-base"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className={sideBySide ? "flex flex-col gap-2" : "flex items-center gap-2 shrink-0"}>
                    <Button
                      onClick={() => void handleConfirm()}
                      disabled={saving || confirming}
                      className={`gap-2 h-11 bg-amber-600 hover:bg-amber-700 ${sideBySide ? "w-full" : ""}`}
                    >
                      {confirming ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          Confirm absent
                        </>
                      )}
                    </Button>
                    <Button
                      variant={inputChanged ? "default" : "outline"}
                      onClick={() => void handleSave()}
                      disabled={saving || confirming || !inputChanged}
                      className={`gap-2 h-11 ${sideBySide ? "w-full" : ""}`}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Save correction
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {entries.length > 1 ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNavigate("prev")}
                        disabled={currentIndex === 0}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums px-1">
                        {positionLabel}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNavigate("next")}
                        disabled={currentIndex === null || currentIndex === entries.length - 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <span />
                  )}
                  <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving || confirming} className="h-8">
                    Close
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Kbd>Enter</Kbd> save
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>Ctrl</Kbd>
                    <Kbd>Enter</Kbd> confirm
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>Esc</Kbd>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
