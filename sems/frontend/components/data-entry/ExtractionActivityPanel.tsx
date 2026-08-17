"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Document, ExtractionProvider } from "@/types/document";
import { extractionFor } from "@/types/document";
import { paperLabel } from "@/components/data-entry/score-entry-utils";

export type ActivityLane = "queued" | "processing" | "success" | "error";

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

interface ExtractionActivityPanelProps {
  documents: Document[];
  /** Document IDs currently tracked in this batch / activity session */
  trackedIds: Set<number>;
  extractionProvider: ExtractionProvider;
  /** IDs that just changed lane — briefly highlight */
  recentlyMovedIds: Set<number>;
  isPolling?: boolean;
  open: boolean;
  minimized?: boolean;
  batchComplete?: boolean;
  requeueingDocumentId?: number | null;
  onOpenChange: (open: boolean) => void;
  onMinimize?: () => void;
  onDismiss: () => void;
  onOpenDocument: (document: Document) => void;
  onRequeue: (document: Document) => void;
  className?: string;
}

const LANE_META: Array<{
  key: ActivityLane;
  label: string;
  empty: string;
}> = [
  { key: "queued", label: "Queued", empty: "None waiting" },
  { key: "processing", label: "Processing", empty: "None running" },
  { key: "success", label: "Success", empty: "None yet" },
  { key: "error", label: "Errors", empty: "None" },
];

function ActivityCard({
  document,
  lane,
  justMoved,
  requeueing,
  onOpen,
  onRequeue,
}: {
  document: Document;
  lane: ActivityLane;
  justMoved: boolean;
  requeueing?: boolean;
  onOpen: () => void;
  onRequeue?: () => void;
}) {
  const title = document.extracted_id || document.file_name || `Doc #${document.id}`;
  const meta = [
    document.school_name,
    paperLabel(document.test_type),
  ]
    .filter((v) => v && v !== "—")
    .join(" · ");

  return (
    <div
      className={cn(
        "group rounded-lg border bg-background/90 px-2.5 py-2 shadow-sm transition-all duration-300",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2",
        justMoved &&
          "motion-safe:ring-2 motion-safe:ring-primary/40 motion-safe:scale-[1.02]",
        lane === "error" && "border-destructive/35 bg-destructive/5",
        lane === "success" && "border-primary/25",
        lane === "processing" && "border-primary/30",
        lane === "queued" && "border-border/80"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0">
            {lane === "queued" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
            {lane === "processing" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
            {lane === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            )}
            {lane === "error" && (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium tabular-nums">{title}</p>
            {meta ? (
              <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
            ) : null}
          </div>
        </div>
      </button>
      {lane === "processing" ? (
        <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 rounded-full bg-primary/60 motion-safe:animate-[activity-shimmer_1.4s_ease-in-out_infinite]" />
        </div>
      ) : null}
      {lane === "error" && onRequeue ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full gap-1.5 text-[11px]"
          disabled={requeueing}
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
          Requeue
        </Button>
      ) : null}
    </div>
  );
}

export function ExtractionActivityPanel({
  documents,
  trackedIds,
  extractionProvider,
  recentlyMovedIds,
  isPolling,
  open,
  minimized,
  batchComplete,
  requeueingDocumentId,
  onOpenChange,
  onMinimize,
  onDismiss,
  onOpenDocument,
  onRequeue,
  className,
}: ExtractionActivityPanelProps) {
  const [collapsedLanes, setCollapsedLanes] = useState<Partial<Record<ActivityLane, boolean>>>({
    success: false,
  });

  const lanes = useMemo(() => {
    const buckets: Record<ActivityLane, Document[]> = {
      queued: [],
      processing: [],
      success: [],
      error: [],
    };
    for (const id of trackedIds) {
      const doc = documents.find((d) => d.id === id);
      if (!doc) continue;
      const status = activityStatusFor(doc, extractionProvider);
      if (status === "queued") buckets.queued.push(doc);
      else if (status === "processing") buckets.processing.push(doc);
      else if (status === "success") buckets.success.push(doc);
      else if (status === "error") buckets.error.push(doc);
    }
    return buckets;
  }, [documents, trackedIds, extractionProvider]);

  const counts = {
    queued: lanes.queued.length,
    processing: lanes.processing.length,
    success: lanes.success.length,
    error: lanes.error.length,
  };
  const total = trackedIds.size;
  const finished = counts.success + counts.error;
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
  const activeCount = counts.queued + counts.processing;

  // Compact chip when closed / idle
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={cn(
          "fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-all hover:shadow-xl xl:static xl:bottom-auto xl:right-auto xl:shadow-sm",
          className
        )}
      >
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        {activeCount > 0 ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Activity · {activeCount} live
          </>
        ) : (
          <span className="text-muted-foreground">Nothing active</span>
        )}
      </button>
    );
  }

  if (minimized) {
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-30 flex w-[280px] items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur xl:static xl:w-[340px] xl:shrink-0 xl:shadow-sm",
          className
        )}
      >
        <Activity className="h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {batchComplete
              ? "Batch complete"
              : `${finished}/${total} done · ${activeCount} live`}
          </p>
          <Progress value={pct} className="mt-1 h-1" />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onMinimize?.()}
          aria-label="Expand activity"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        "animate-in fade-in-0 slide-in-from-right-2 duration-300",
        // Mobile/tablet overlay
        "fixed inset-y-auto bottom-0 right-0 z-40 max-h-[70vh] w-full max-w-md rounded-b-none border-b-0 sm:right-4 sm:bottom-4 sm:max-h-[min(70vh,640px)] sm:rounded-xl sm:border-b",
        "xl:static xl:z-auto xl:max-h-none xl:max-w-none xl:w-[340px] xl:shrink-0",
        className
      )}
      aria-label="Extraction activity"
    >
      <div className="shrink-0 border-b border-border/80 bg-gradient-to-b from-muted/40 to-transparent px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Activity</h2>
              {isPolling ? (
                <span className="relative flex h-2 w-2" title="Live updates">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              {counts.queued} queued · {counts.processing} processing · Done{" "}
              {counts.success} · Failed {counts.error}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            {onMinimize ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onMinimize}
                aria-label="Minimize activity"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onDismiss}
              aria-label="Dismiss activity"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {batchComplete ? (
          <div className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2 animate-in fade-in-0 zoom-in-95 duration-300">
            <p className="text-xs font-medium text-foreground">
              Batch complete · {counts.success} succeeded
              {counts.error > 0 ? ` · ${counts.error} failed` : ""}
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {finished}/{total} finished
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5 transition-all duration-500" />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {LANE_META.map((lane) => {
          const items = lanes[lane.key];
          const collapsed = collapsedLanes[lane.key] && items.length > 3;
          const visible = collapsed ? items.slice(0, 3) : items;
          return (
            <section key={lane.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {lane.label}
                  <span className="ml-1.5 tabular-nums font-normal">
                    {items.length}
                  </span>
                </h3>
                {items.length > 3 ? (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setCollapsedLanes((prev) => ({
                        ...prev,
                        [lane.key]: !prev[lane.key],
                      }))
                    }
                  >
                    {collapsed ? "Show all" : "Collapse"}
                  </button>
                ) : null}
              </div>
              {items.length === 0 ? (
                <p className="rounded-md border border-dashed border-border/70 px-2 py-2 text-[11px] text-muted-foreground">
                  {lane.empty}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {visible.map((doc) => (
                    <ActivityCard
                      key={`${lane.key}-${doc.id}`}
                      document={doc}
                      lane={lane.key}
                      justMoved={recentlyMovedIds.has(doc.id)}
                      requeueing={requeueingDocumentId === doc.id}
                      onOpen={() => onOpenDocument(doc)}
                      onRequeue={
                        lane.key === "error" ? () => onRequeue(doc) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

/** Inject a one-off shimmer keyframe if not already present via Tailwind arbitrary animation */
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
      @media (prefers-reduced-motion: reduce) {
        .motion-safe\\:animate-in { animation: none !important; }
        .motion-safe\\:animate-\\[activity-shimmer_1\\.4s_ease-in-out_infinite\\] {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}
