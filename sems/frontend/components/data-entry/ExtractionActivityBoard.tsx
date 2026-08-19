"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Document, ExtractionProvider } from "@/types/document";
import { extractionFor } from "@/types/document";
import { paperLabel } from "@/components/data-entry/score-entry-utils";
import {
  completedWindowCutoff,
  type CompletedWindow,
} from "@/lib/extraction-scope";

export type ActivityLane = "queued" | "processing" | "success" | "error";

export type BoardColumn = "queued" | "processing" | "completed";

const ROW_HEIGHT = 30;

export function activityStatusFor(
  doc: Document,
  provider: ExtractionProvider
): ActivityLane | "pending" | null {
  const row = extractionFor(doc, provider);
  const status = row?.status ?? doc.scores_extraction_status;
  if (
    status === "queued" ||
    status === "processing" ||
    status === "success" ||
    status === "error" ||
    status === "pending"
  ) {
    return status;
  }
  return null;
}

function completedAt(doc: Document, provider: ExtractionProvider): Date | null {
  const raw =
    extractionFor(doc, provider)?.extracted_at ?? doc.scores_extracted_at ?? null;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Live lanes always keep; completed lanes respect the time window. */
export function keepOnActivityBoard(
  doc: Document,
  provider: ExtractionProvider,
  completedWindow: CompletedWindow,
  now = new Date()
): boolean {
  const status = activityStatusFor(doc, provider);
  if (status === "queued" || status === "processing") return true;
  if (status !== "success" && status !== "error") return false;

  const cutoff = completedWindowCutoff(completedWindow, now);
  if (!cutoff) return true;

  const at = completedAt(doc, provider);
  // Missing timestamp: keep so fresh errors without extracted_at still show
  if (!at) return true;
  return at.getTime() >= cutoff.getTime();
}

function ActivityRow({
  document,
  lane,
  justMoved,
  requeueing,
  onOpen,
  onRequeue,
  style,
}: {
  document: Document;
  lane: ActivityLane;
  justMoved: boolean;
  requeueing?: boolean;
  onOpen: () => void;
  onRequeue?: () => void;
  style?: CSSProperties;
}) {
  const title = document.extracted_id || document.file_name || `Doc #${document.id}`;
  const school = document.school_name && document.school_name !== "—" ? document.school_name : null;
  const paper = paperLabel(document.test_type);
  const paperText = paper && paper !== "—" ? paper : null;

  return (
    <div
      style={style}
      className={cn(
        "group absolute left-0 top-0 flex w-full items-stretch border-b border-border/35",
        "transition-colors duration-150 hover:bg-muted/40",
        justMoved && "motion-safe:animate-[activity-pop_0.4s_ease-out]",
        lane === "error" && "bg-destructive/[0.03]",
        lane === "success" && "opacity-75",
        lane === "processing" && "bg-primary/[0.03]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "w-0.5 shrink-0",
          lane === "queued" && "bg-muted-foreground/35",
          lane === "processing" && "bg-primary",
          lane === "success" && "bg-primary/50",
          lane === "error" && "bg-destructive"
        )}
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-left outline-none focus-visible:bg-muted/50"
      >
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          {lane === "queued" && <Clock className="h-3 w-3 text-muted-foreground" />}
          {lane === "processing" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-0.5 h-px overflow-hidden rounded-full bg-muted"
              >
                <span className="block h-full w-1/2 bg-primary/70 motion-safe:animate-[activity-shimmer_1.4s_ease-in-out_infinite]" />
              </span>
            </>
          )}
          {lane === "success" && <CheckCircle2 className="h-3 w-3 text-primary" />}
          {lane === "error" && <XCircle className="h-3 w-3 text-destructive" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium tabular-nums tracking-tight">
          {title}
        </span>
        {school ? (
          <span className="hidden min-w-0 max-w-[28%] truncate text-[11px] text-muted-foreground sm:inline">
            {school}
          </span>
        ) : null}
        {paperText ? (
          <span className="shrink-0 rounded bg-muted/70 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {paperText}
          </span>
        ) : null}
      </button>
      {lane === "error" && onRequeue ? (
        <div className="flex shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            disabled={requeueing}
            title="Requeue"
            aria-label="Requeue"
            onClick={(e) => {
              e.stopPropagation();
              onRequeue();
            }}
          >
            {requeueing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VirtualColumnList({
  items,
  recentlyMovedIds,
  requeueingDocumentId,
  onOpenDocument,
  onRequeue,
  empty,
}: {
  items: Array<{ doc: Document; lane: ActivityLane }>;
  recentlyMovedIds: Set<number>;
  requeueingDocumentId?: number | null;
  onOpenDocument: (document: Document) => void;
  onRequeue: (document: Document) => void;
  empty: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-start p-2">
        <p className="w-full rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-[11px] text-muted-foreground">
          {empty}
        </p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const { doc, lane } = items[virtualRow.index];
          return (
            <ActivityRow
              key={doc.id}
              document={doc}
              lane={lane}
              justMoved={recentlyMovedIds.has(doc.id)}
              requeueing={requeueingDocumentId === doc.id}
              onOpen={() => onOpenDocument(doc)}
              onRequeue={lane === "error" ? () => onRequeue(doc) : undefined}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ExtractionActivityBoardProps {
  documents: Document[];
  extractionProvider: ExtractionProvider;
  completedWindow?: CompletedWindow;
  recentlyMovedIds: Set<number>;
  isPolling?: boolean;
  statusCountsOverride?: {
    queued: number;
    processing: number;
  };
  requeueingDocumentId?: number | null;
  onOpenDocument: (document: Document) => void;
  onRequeue: (document: Document) => void;
  className?: string;
}

const COLUMNS: Array<{
  key: BoardColumn;
  label: string;
  empty: string;
}> = [
  { key: "queued", label: "Queue", empty: "Nothing waiting in the queue" },
  { key: "processing", label: "In progress", empty: "Nothing processing" },
  { key: "completed", label: "Completed", empty: "No recent finishes in this window" },
];

export function ExtractionActivityBoard({
  documents,
  extractionProvider,
  completedWindow = "1h",
  recentlyMovedIds,
  isPolling,
  statusCountsOverride,
  requeueingDocumentId,
  onOpenDocument,
  onRequeue,
  className,
}: ExtractionActivityBoardProps) {
  const columns = useMemo(() => {
    const buckets: Record<BoardColumn, Array<{ doc: Document; lane: ActivityLane }>> = {
      queued: [],
      processing: [],
      completed: [],
    };
    for (const doc of documents) {
      if (!keepOnActivityBoard(doc, extractionProvider, completedWindow)) continue;
      const status = activityStatusFor(doc, extractionProvider);
      if (status === "queued") buckets.queued.push({ doc, lane: "queued" });
      else if (status === "processing") buckets.processing.push({ doc, lane: "processing" });
      else if (status === "success") buckets.completed.push({ doc, lane: "success" });
      else if (status === "error") buckets.completed.push({ doc, lane: "error" });
    }
    buckets.completed.sort((a, b) => {
      if (a.lane === b.lane) return 0;
      if (a.lane === "error") return -1;
      if (b.lane === "error") return 1;
      return 0;
    });
    return buckets;
  }, [documents, extractionProvider, completedWindow]);

  const counts = {
    queued: columns.queued.length,
    processing: columns.processing.length,
    success: columns.completed.filter((c) => c.lane === "success").length,
    error: columns.completed.filter((c) => c.lane === "error").length,
  };

  const queuedCount = statusCountsOverride?.queued ?? counts.queued;
  const processingCount = statusCountsOverride?.processing ?? counts.processing;

  const total = queuedCount + processingCount + counts.success + counts.error;
  const finished = counts.success + counts.error;
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold tracking-tight">Live</span>
          {isPolling ? (
            <span className="relative flex h-1.5 w-1.5" title="Live updates">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <CountPill label="Q" value={queuedCount} tone="muted" />
          <CountPill
            label="P"
            value={processingCount}
            tone="primary"
            live={isPolling && processingCount > 0}
          />
          <CountPill label="Done" value={counts.success} tone="muted" />
          <CountPill label="Fail" value={counts.error} tone="danger" />
        </div>
        <div className="ml-auto flex min-w-[140px] flex-1 max-w-xs items-center gap-2">
          <Progress value={pct} className="h-1 flex-1 transition-all duration-500" />
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {finished}/{total || 0}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = columns[col.key];
          const isLiveProcessing = col.key === "processing" && isPolling && items.length > 0;
          return (
            <section
              key={col.key}
              className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background",
                isLiveProcessing && "border-primary/35"
              )}
            >
              <header className="sticky top-0 z-10 flex shrink-0 flex-col gap-0.5 border-b border-border/60 bg-muted/40 px-2.5 py-1.5 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </h2>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums transition-colors",
                      items.length > 0
                        ? isLiveProcessing
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-foreground"
                        : "bg-muted/60 text-muted-foreground"
                    )}
                  >
                    {items.length}
                  </span>
                </div>
                {col.key === "queued" && queuedCount >= 100 ? (
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {queuedCount.toLocaleString()} in queue
                  </p>
                ) : null}
              </header>
              <VirtualColumnList
                items={items}
                recentlyMovedIds={recentlyMovedIds}
                requeueingDocumentId={requeueingDocumentId}
                onOpenDocument={onOpenDocument}
                onRequeue={onRequeue}
                empty={col.empty}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CountPill({
  label,
  value,
  tone,
  live,
}: {
  label: string;
  value: number;
  tone: "muted" | "primary" | "danger";
  live?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
        tone === "muted" && "bg-muted/70 text-muted-foreground",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "danger" && value > 0 && "bg-destructive/10 text-destructive",
        tone === "danger" && value === 0 && "bg-muted/70 text-muted-foreground",
        live && "ring-1 ring-primary/25"
      )}
    >
      <span className="font-medium text-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

export function ExtractionActivityShimmerStyles() {
  useEffect(() => {
    const id = "extraction-activity-shimmer";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes activity-shimmer {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }
      @keyframes activity-pop {
        0% { background-color: color-mix(in oklab, var(--primary) 18%, transparent); transform: scale(1.01); }
        100% { background-color: transparent; transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .motion-safe\\:animate-\\[activity-shimmer_1\\.4s_ease-in-out_infinite\\],
        .motion-safe\\:animate-\\[activity-pop_0\\.4s_ease-out\\] {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}
