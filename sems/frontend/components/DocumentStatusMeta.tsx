"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/document";
import { getIdExtractionErrorBadgeLabel } from "@/lib/id-extraction-errors";
import { formatRelativeDate } from "@/components/data-entry/score-entry-utils";

export function documentPaperLabel(
  testType: string | null | undefined
): string | null {
  if (!testType) return null;
  if (testType === "1") return "Obj";
  if (testType === "2") return "Essay";
  return `P${testType}`;
}

/** Single priority chip: error > pending > scores > ID ok (icon only). */
export function DocumentPriorityStatus({
  document,
  className,
  compact = false,
}: {
  document: Document;
  className?: string;
  compact?: boolean;
}) {
  const isFailed = document.id_extraction_status === "error";
  const isPending = document.id_extraction_status === "pending";
  const isSuccess = document.id_extraction_status === "success";
  const hasScores = document.scores_extraction_status === "success";
  const iconClass = compact ? "h-2.5 w-2.5" : "h-3 w-3";
  const badgeClass = compact ? "text-[10px] px-1.5 py-0" : "text-xs px-1.5 py-0";

  if (isFailed) {
    const label = getIdExtractionErrorBadgeLabel(document.id_extraction_error_code);
    const badge = (
      <Badge variant="destructive" className={cn(badgeClass, className)}>
        <AlertCircle className={cn(iconClass, "mr-1")} />
        {label}
      </Badge>
    );
    if (document.id_extraction_error) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{badge}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>{document.id_extraction_error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return badge;
  }

  if (isPending) {
    return (
      <Badge variant="secondary" className={cn(badgeClass, className)}>
        <Clock className={cn(iconClass, "mr-1")} />
        ID…
      </Badge>
    );
  }

  if (hasScores) {
    return (
      <Badge
        variant="outline"
        className={cn(
          badgeClass,
          "border-blue-500 text-blue-600 dark:text-blue-400",
          className
        )}
      >
        Scores
      </Badge>
    );
  }

  if (isSuccess) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full bg-green-600 text-white shadow-sm",
                compact ? "h-5 w-5" : "h-6 w-6",
                className
              )}
              aria-label="ID extracted"
            >
              <CheckCircle2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">ID extracted</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}

/** Quiet paper identity + optional reclassify mark for footers / list titles. */
export function DocumentPaperIdentity({
  document,
  className,
  textClassName,
}: {
  document: Document;
  className?: string;
  textClassName?: string;
}) {
  const paper = documentPaperLabel(document.test_type);
  const fromLabel = documentPaperLabel(document.test_type_changed_from);
  const transition =
    fromLabel && paper && document.test_type_changed_from !== document.test_type
      ? `${fromLabel} → ${paper}`
      : null;

  if (!paper && !document.test_type_changed_at) return null;

  const reclassifyTooltip = document.test_type_changed_at ? (
    <TooltipContent side="bottom" className="max-w-xs">
      {transition ? (
        <p className="font-medium">{transition}</p>
      ) : (
        <p className="font-medium">Paper changed</p>
      )}
      <p className="text-muted-foreground">
        Reclassified {formatRelativeDate(document.test_type_changed_at)}
      </p>
      <p className="text-muted-foreground">
        {new Date(document.test_type_changed_at).toLocaleString()}
      </p>
    </TooltipContent>
  ) : null;

  // Prefer "↻ Obj → Essay" when we know the transition; otherwise current paper + optional ↻
  if (document.test_type_changed_at && transition) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 shrink-0 text-amber-700 dark:text-amber-400",
                className
              )}
              aria-label={`Paper changed: ${transition}`}
              onClick={(e) => e.stopPropagation()}
            >
              <RotateCcw className="h-3 w-3" />
              <span className={cn("font-medium", textClassName)}>{transition}</span>
            </span>
          </TooltipTrigger>
          {reclassifyTooltip}
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-0.5 shrink-0", className)}>
      {paper && (
        <span className={cn("text-muted-foreground", textClassName)}>{paper}</span>
      )}
      {document.test_type_changed_at && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex text-amber-600 dark:text-amber-400"
                aria-label="Paper changed"
                onClick={(e) => e.stopPropagation()}
              >
                <RotateCcw className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            {reclassifyTooltip}
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );
}
