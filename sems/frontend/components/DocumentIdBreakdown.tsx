"use client";

import {
  resolveDocumentIdParts,
  type ResolvedDocumentIdPart,
} from "@/lib/document-id";
import { cn } from "@/lib/utils";
import type { School, Subject } from "@/types/document";

type DocumentIdBreakdownProps = {
  id: string;
  schools: School[];
  subjects: Subject[];
  className?: string;
  /** Focus the ID input and select this digit range (start inclusive, end exclusive). */
  onSegmentClick?: (start: number, end: number) => void;
};

function meaning(part: ResolvedDocumentIdPart): string {
  if (part.status === "ok" && part.display) return part.display;
  if (part.status === "unknown") {
    switch (part.key) {
      case "school":
        return "Unknown school";
      case "subject":
        return "Unknown subject";
      case "series":
        return "Bad series";
      case "type":
        return "Bad type";
      case "sheet":
        return "Bad page";
    }
  }
  if (!part.digits) return part.label;
  return `${part.label}…`;
}

/** Single-line resolved ID sentence: School · Subject · Series · Type · Sheet */
export function DocumentIdBreakdown({
  id,
  schools,
  subjects,
  className,
  onSegmentClick,
}: DocumentIdBreakdownProps) {
  const digits = id.replace(/\D/g, "").slice(0, 13);
  const parts = resolveDocumentIdParts(digits, schools, subjects);
  const activeKey =
    parts.find((part) => part.status === "pending")?.key ??
    (digits.length === 13 ? null : parts[parts.length - 1]?.key ?? null);
  const allOk = digits.length === 13 && parts.every((p) => p.status === "ok");

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-snug transition-colors duration-200",
        allOk && "text-emerald-700 dark:text-emerald-400",
        className
      )}
      aria-live="polite"
    >
      {parts.map((part, index) => {
        const label = meaning(part);
        const isActive = part.key === activeKey;

        return (
          <span key={part.key} className="inline-flex items-center gap-1">
            {index > 0 && (
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onSegmentClick?.(part.startIndex, part.endIndex)}
              aria-label={`${part.label}${part.digits ? ` ${part.digits}` : ""}: ${label}`}
              className={cn(
                "max-w-56 truncate rounded px-1 py-0.5 text-left transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive && "bg-primary/10 text-foreground ring-1 ring-primary/30",
                !isActive && part.status === "ok" && "font-medium text-foreground",
                !isActive && part.status === "unknown" && "text-destructive",
                !isActive && part.status === "pending" && "text-muted-foreground",
                onSegmentClick && "cursor-pointer hover:bg-muted/80"
              )}
            >
              {label}
            </button>
          </span>
        );
      })}
    </p>
  );
}
