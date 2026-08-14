"use client";

import { CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Document, DocumentScoreExtraction, ExtractionProvider } from "@/types/document";
import {
  DEFAULT_EXTRACTION_PROVIDER,
  extractionApplyLabel,
  extractionProviderLabel,
  extractionProviderShortLabel,
} from "@/types/document";
import { formatRelativeDate } from "@/components/data-entry/score-entry-utils";
import { cn } from "@/lib/utils";

export function ExtractionApplyBadge({
  row,
  showProvider = false,
  compact = false,
  className,
}: {
  row: DocumentScoreExtraction;
  showProvider?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const label = extractionApplyLabel(row);
  if (!label) return null;
  const ready = label !== "Applied";
  const providerName = compact
    ? extractionProviderShortLabel(row.provider)
    : extractionProviderLabel(row.provider);
  return (
    <Badge
      variant={ready ? "secondary" : "default"}
      className={cn(
        ready ? undefined : "bg-primary text-primary-foreground",
        className
      )}
    >
      {ready ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {showProvider ? `${providerName} · ${label}` : label}
    </Badge>
  );
}

export function DocumentAppliedBadges({
  document,
  activeProvider,
}: {
  document: Document;
  activeProvider?: ExtractionProvider;
}) {
  const successRows = [...(document.extractions ?? [])]
    .filter((row) => row.status === "success")
    .sort((a, b) => {
      if (a.provider === DEFAULT_EXTRACTION_PROVIDER) return -1;
      if (b.provider === DEFAULT_EXTRACTION_PROVIDER) return 1;
      return a.provider.localeCompare(b.provider);
    });
  if (successRows.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {successRows.map((row) => {
          const isActive = !activeProvider || row.provider === activeProvider;
          return (
            <ExtractionApplyBadge
              key={row.provider}
              row={row}
              showProvider
              compact
              className={
                activeProvider
                  ? isActive
                    ? "ring-1 ring-ring"
                    : "opacity-50"
                  : undefined
              }
            />
          );
        })}
      </div>
    );
  }
  if (document.scores_applied_at) {
    return (
      <div className="space-y-0.5">
        <Badge className="bg-primary text-primary-foreground">
          <CheckCircle2 className="h-3 w-3" />
          Applied
        </Badge>
        <div
          className="text-xs text-muted-foreground"
          title={new Date(document.scores_applied_at).toLocaleString()}
        >
          {formatRelativeDate(document.scores_applied_at)}
          {document.scores_applied_count != null && ` · ${document.scores_applied_count} scores`}
        </div>
      </div>
    );
  }
  return (
    <Badge variant="secondary">
      <Clock className="h-3 w-3" />
      Ready
    </Badge>
  );
}
