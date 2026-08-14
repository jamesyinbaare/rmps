"use client";

import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BatchProgress } from "@/components/ReductoDocumentsDataTable";

interface BatchProgressBannerProps {
  progress: BatchProgress;
  isPolling?: boolean;
  onDismiss?: () => void;
}

export function BatchProgressBanner({
  progress,
  isPolling,
  onDismiss,
}: BatchProgressBannerProps) {
  const finished = progress.done + progress.failed;
  const pct = progress.total > 0 ? Math.round((finished / progress.total) * 100) : 0;
  const parts = [`${progress.done}/${progress.total} done`];
  if (progress.processing > 0) parts.push(`${progress.processing} processing`);
  if (progress.queued > 0) parts.push(`${progress.queued} queued`);
  if (progress.failed > 0) parts.push(`${progress.failed} failed`);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
      {isPolling && (
        <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">Batch extraction</span>
          <span className="text-muted-foreground">{parts.join(" · ")}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={onDismiss}
          aria-label="Dismiss batch progress"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
