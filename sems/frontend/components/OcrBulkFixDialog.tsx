"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  bulkResolveUnmatchedOcr,
  getDocumentDownloadUrl,
  getUnmatchedOcrCandidates,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UnmatchedExtractionRecord } from "@/types/document";
import {
  DiffName,
  HighlightedIndex,
  documentContextLabel,
  isOcrException,
  matchHasNameDiff,
  matchHasScoreOverwrite,
} from "@/components/unmatched-review-ui";
import { ScoreSheetPreview, workspaceDialogClassName } from "@/components/ScoreSheetPreview";
import { Kbd } from "@/components/absent-review-ui";
import {
  createDocumentPrefetchCache,
  mapPool,
} from "@/lib/document-prefetch-cache";

type OcrFilter = "all" | "clean" | "name" | "overwrite";

const FILTERS: Array<{ id: OcrFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "clean", label: "Looks good" },
  { id: "name", label: "Name differs" },
  { id: "overwrite", label: "Overwrites score" },
];

function recordMatchesFilter(record: UnmatchedExtractionRecord, filter: OcrFilter): boolean {
  const match = record.suggestion?.matches[0];
  if (filter === "clean") return !isOcrException(record);
  if (filter === "name") return matchHasNameDiff(record, match);
  if (filter === "overwrite") return matchHasScoreOverwrite(match);
  return true;
}

function ComparisonRow({
  record,
  checked,
  focused,
  onCheckedChange,
  onFocus,
  onReview,
}: {
  record: UnmatchedExtractionRecord;
  checked: boolean;
  focused: boolean;
  onCheckedChange: (checked: boolean) => void;
  onFocus: () => void;
  onReview?: (record: UnmatchedExtractionRecord) => void;
}) {
  const match = record.suggestion?.matches[0];
  const nameMismatch = matchHasNameDiff(record, match);
  const overwrite = matchHasScoreOverwrite(match);

  return (
    <div
      className={cn(
        "flex gap-2 border-b px-2 py-2",
        focused && "bg-primary/5"
      )}
      onClick={onFocus}
    >
      <Checkbox
        className="mt-1 shrink-0"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
        aria-label={`Select ${record.index_number ?? record.id}`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]">
          <div className="flex min-w-0 items-center gap-1.5">
            <HighlightedIndex
              highlight={record.suggestion?.highlight}
              fallback={record.index_number ?? "—"}
              className="text-sm"
            />
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-sm">{match?.index_number ?? "—"}</span>
          </div>
          <div className="min-w-0 text-sm">
            <DiffName
              value={record.candidate_name}
              other={match?.candidate_name}
              side="left"
              className="text-muted-foreground"
            />
            <span className="mx-1 text-muted-foreground">→</span>
            <DiffName
              value={record.candidate_name}
              other={match?.candidate_name}
              side="right"
              className="font-medium"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm tabular-nums">
            <span>{record.score ?? "—"}</span>
            {overwrite ? (
              <>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-destructive">{match?.current_score}</span>
              </>
            ) : null}
          </div>
        </div>
        {(nameMismatch || overwrite) && onReview ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onReview(record);
              }}
            >
              Review
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OcrBulkFixDialog({
  open,
  onOpenChange,
  documentId,
  extractionMethod,
  recordIds,
  onApplied,
  onReviewRecord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId?: number;
  extractionMethod?: string;
  recordIds?: number[];
  onApplied?: () => void;
  onReviewRecord?: (record: UnmatchedExtractionRecord) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<UnmatchedExtractionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<OcrFilter>("all");
  const [focusedDocumentId, setFocusedDocumentId] = useState<number | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const prefetchCache = useRef(createDocumentPrefetchCache()).current;
  const [prefetchEpoch, setPrefetchEpoch] = useState(0);

  const loadCandidates = useCallback(async () => {
    const response = await getUnmatchedOcrCandidates({
      document_id: documentId,
      extraction_method: extractionMethod,
      record_ids: recordIds,
    });
    return response;
  }, [documentId, extractionMethod, recordIds]);

  useEffect(() => prefetchCache.subscribe(() => setPrefetchEpoch((n) => n + 1)), [prefetchCache]);
  useEffect(() => () => prefetchCache.clear(), [prefetchCache]);

  useEffect(() => {
    if (!open) {
      prefetchCache.clear();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFilter("all");
    setBanner(null);
    void loadCandidates()
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setTotal(response.total);
        setCheckedIds(
          new Set(response.items.filter((item) => !isOcrException(item)).map((item) => item.id))
        );
        const first = response.items[0];
        setFocusedDocumentId(first?.document_id ?? null);
        setFocusedRowId(first?.id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load OCR matches");
        setItems([]);
        setTotal(0);
        setCheckedIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadCandidates, prefetchCache]);

  const counts = useMemo(() => {
    let clean = 0;
    let name = 0;
    let overwrite = 0;
    for (const item of items) {
      const match = item.suggestion?.matches[0];
      if (!isOcrException(item)) clean += 1;
      if (matchHasNameDiff(item, match)) name += 1;
      if (matchHasScoreOverwrite(match)) overwrite += 1;
    }
    return { clean, name, overwrite, all: items.length };
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => recordMatchesFilter(item, filter)),
    [items, filter]
  );

  const groups = useMemo(() => {
    const map = new Map<
      number,
      { documentId: number; label: string; items: UnmatchedExtractionRecord[] }
    >();
    for (const item of visibleItems) {
      const existing = map.get(item.document_id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.document_id, {
          documentId: item.document_id,
          label: documentContextLabel(item),
          items: [item],
        });
      }
    }
    return Array.from(map.values());
  }, [visibleItems]);

  useEffect(() => {
    if (groups.length === 0) {
      setFocusedDocumentId(null);
      return;
    }
    if (!focusedDocumentId || !groups.some((g) => g.documentId === focusedDocumentId)) {
      setFocusedDocumentId(groups[0].documentId);
    }
  }, [groups, focusedDocumentId]);

  useEffect(() => {
    if (!open) return;
    const ids = groups.slice(0, 3).map((g) => g.documentId);
    if (focusedDocumentId && !ids.includes(focusedDocumentId)) {
      ids.unshift(focusedDocumentId);
    }
    const unique = Array.from(new Set(ids));
    prefetchCache.retain(unique.map(String));
    const toFetch = unique.filter((id) => !prefetchCache.get(String(id)));
    void mapPool(toFetch, 2, async (id) => {
      await prefetchCache.ensure(String(id), getDocumentDownloadUrl(id));
    });
  }, [open, groups, focusedDocumentId, prefetchCache]);

  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const checkedCount = checkedIds.size;
  const allVisibleChecked =
    visibleIds.length > 0 && visibleIds.every((id) => checkedIds.has(id));

  const toggleAllVisible = (checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleGroup = (groupIds: number[], checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of groupIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleOne = (id: number, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const truncated = total > items.length;
  const checkedAreAllClean =
    checkedCount > 0 &&
    items.filter((item) => checkedIds.has(item.id)).every((item) => !isOcrException(item));
  const applyLabel = useMemo(() => {
    if (checkedCount === 0) return "Apply matches";
    const noun = checkedCount === 1 ? "match" : "matches";
    if (checkedAreAllClean) {
      return `Apply ${checkedCount.toLocaleString()} clean ${noun}`;
    }
    return `Apply ${checkedCount.toLocaleString()} ${noun}`;
  }, [checkedCount, checkedAreAllClean]);

  const uncheckedExceptions = items.filter(
    (item) => isOcrException(item) && !checkedIds.has(item.id)
  ).length;

  const handleApply = useCallback(async () => {
    if (checkedCount === 0) return;
    setApplying(true);
    try {
      const appliedSet = new Set(checkedIds);
      const result = await bulkResolveUnmatchedOcr({
        record_ids: Array.from(checkedIds),
        document_id: documentId,
        extraction_method: extractionMethod,
      });
      toast.success(
        `${result.applied} applied / ${result.skipped} skipped / ${result.failed} failed`
      );
      onApplied?.();

      if (truncated) {
        const response = await loadCandidates();
        setItems(response.items);
        setTotal(response.total);
        setCheckedIds(
          new Set(response.items.filter((item) => !isOcrException(item)).map((item) => item.id))
        );
        const remainingExceptions = response.items.filter(isOcrException).length;
        setBanner(
          `${result.applied.toLocaleString()} applied · ${remainingExceptions.toLocaleString()} exceptions left`
        );
      } else {
        const remaining = items.filter((item) => !appliedSet.has(item.id));
        setItems(remaining);
        setTotal((t) => Math.max(0, t - result.applied));
        setCheckedIds(
          new Set(remaining.filter((item) => !isOcrException(item)).map((item) => item.id))
        );
        const remainingExceptions = remaining.filter(isOcrException).length;
        setBanner(
          `${result.applied.toLocaleString()} applied · ${remainingExceptions.toLocaleString()} exceptions left`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply OCR matches");
    } finally {
      setApplying(false);
    }
  }, [
    checkedCount,
    checkedIds,
    documentId,
    extractionMethod,
    truncated,
    items,
    loadCandidates,
    onApplied,
  ]);

  const handleReview = (record: UnmatchedExtractionRecord) => {
    onReviewRecord?.(record);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (visibleItems.length === 0) return;
      const idx = Math.max(
        0,
        visibleItems.findIndex((item) => item.id === focusedRowId)
      );
      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = visibleItems[Math.min(visibleItems.length - 1, idx + 1)];
        if (next) {
          setFocusedRowId(next.id);
          setFocusedDocumentId(next.document_id);
        }
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = visibleItems[Math.max(0, idx - 1)];
        if (prev) {
          setFocusedRowId(prev.id);
          setFocusedDocumentId(prev.document_id);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        const row = visibleItems[idx];
        if (row) toggleOne(row.id, !checkedIds.has(row.id));
      } else if (e.key === "Enter") {
        e.preventDefault();
        void handleApply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, visibleItems, focusedRowId, checkedIds, handleApply]);

  const filterCount = (id: OcrFilter) => {
    if (id === "all") return counts.all;
    if (id === "clean") return counts.clean;
    if (id === "name") return counts.name;
    return counts.overwrite;
  };

  const focusedKey = focusedDocumentId != null ? String(focusedDocumentId) : null;
  const prefetched = focusedKey && prefetchEpoch > -1 ? prefetchCache.get(focusedKey) : undefined;
  const peekSrc =
    prefetched?.blobUrl ??
    (focusedDocumentId != null ? getDocumentDownloadUrl(focusedDocumentId) : null);
  const focusedGroup = groups.find((g) => g.documentId === focusedDocumentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className={workspaceDialogClassName}>
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-2">
          <DialogTitle>Apply OCR matches</DialogTitle>
          <DialogDescription>
            Unique cleaned-index matches only. Clean rows are selected. Peek the sheet, then apply.
          </DialogDescription>
          {!loading && !error && items.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {counts.clean.toLocaleString()} look clean
              {" · "}
              {counts.name.toLocaleString()} names differ
              {" · "}
              {counts.overwrite.toLocaleString()} will overwrite a score
            </p>
          ) : null}
        </DialogHeader>

        {!loading && !error && items.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pt-2">
            {FILTERS.map((item) => {
              const count = filterCount(item.id);
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={filter === item.id ? "secondary" : "outline"}
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
                </Button>
              );
            })}
          </div>
        ) : null}

        {banner ? (
          <p className="mx-4 mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            {banner}
          </p>
        ) : null}

        {truncated && !loading && !error ? (
          <p className="mx-4 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
            Showing {items.length.toLocaleString()} of {total.toLocaleString()} unique OCR matches.
            Apply these first, then the rest load in place.
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="min-h-0 flex-1 overflow-auto border-b lg:border-b-0 lg:border-r max-lg:h-[48%] max-lg:flex-none">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && !loading && (
              <div className="py-8 text-center text-sm text-destructive">{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {banner ? "All loaded OCR matches are applied." : "No unique OCR matches for the current filters."}
              </div>
            )}
            {!loading && !error && items.length > 0 && visibleItems.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No rows in this filter.</div>
            )}
            {!loading && !error && visibleItems.length > 0 && (
              <div className="m-3 overflow-hidden rounded-md border">
                <div className="sticky top-0 z-20 flex items-center gap-2 border-b bg-muted/80 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <Checkbox
                    className="shrink-0"
                    checked={allVisibleChecked}
                    onCheckedChange={(checked) => toggleAllVisible(Boolean(checked))}
                    aria-label="Select all visible"
                  />
                  <span>Extracted</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Suggested candidate</span>
                </div>
                {groups.map((group) => {
                  const groupIds = group.items.map((item) => item.id);
                  const groupChecked = groupIds.every((id) => checkedIds.has(id));
                  return (
                    <div key={group.documentId}>
                      <div
                        className={cn(
                          "sticky top-8 z-10 flex items-center gap-2 border-b bg-muted/60 px-2 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur",
                          focusedDocumentId === group.documentId && "bg-primary/10 text-foreground"
                        )}
                      >
                        <Checkbox
                          className="shrink-0"
                          checked={groupChecked}
                          onCheckedChange={(checked) => toggleGroup(groupIds, Boolean(checked))}
                          aria-label={`Select all on ${group.label}`}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => {
                            setFocusedDocumentId(group.documentId);
                            setFocusedRowId(group.items[0]?.id ?? null);
                          }}
                        >
                          {group.label || "—"}
                          <span className="ml-2 tabular-nums">{group.items.length.toLocaleString()}</span>
                        </button>
                      </div>
                      {group.items.map((record) => (
                        <ComparisonRow
                          key={record.id}
                          record={record}
                          checked={checkedIds.has(record.id)}
                          focused={focusedRowId === record.id}
                          onCheckedChange={(checked) => toggleOne(record.id, checked)}
                          onFocus={() => {
                            setFocusedRowId(record.id);
                            setFocusedDocumentId(record.document_id);
                          }}
                          onReview={onReviewRecord ? handleReview : undefined}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex min-h-0 w-full flex-col lg:w-[min(46%,560px)] lg:shrink-0">
            <div className="shrink-0 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              {focusedGroup?.label || "Select a sheet to peek"}
            </div>
            <ScoreSheetPreview
              src={peekSrc}
              mimeType={prefetched?.mimeType}
              loading={Boolean(focusedDocumentId) && !peekSrc}
              emptyMessage="Select a group to preview the score sheet"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t px-4 py-3 sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              {uncheckedExceptions > 0
                ? `${uncheckedExceptions.toLocaleString()} exception${
                    uncheckedExceptions === 1 ? "" : "s"
                  } left pending`
                : "\u00a0"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> move
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Space</Kbd> toggle
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Enter</Kbd> apply
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              Close
            </Button>
            <Button onClick={() => void handleApply()} disabled={applying || checkedCount === 0}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {applyLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
