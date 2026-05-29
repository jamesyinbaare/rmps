"use client";

import type { RecordSubjectScope } from "@/lib/api";
import { cn } from "@/lib/utils";

export function scopeDisplayLabel(scope: RecordSubjectScope): string {
  return scope === "CORE" ? "Core" : "Elective";
}

export function ImportScopeModalHeader({
  sourceScope,
  destinationScope,
  subtitleId,
  compact = false,
}: {
  sourceScope: RecordSubjectScope | null;
  destinationScope: RecordSubjectScope | null;
  subtitleId: string;
  compact?: boolean;
}) {
  const from = sourceScope ? scopeDisplayLabel(sourceScope) : "the other scope";
  const to = destinationScope ? scopeDisplayLabel(destinationScope) : "this scope";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 pr-1",
        "max-sm:transition-[gap] max-sm:duration-300 max-sm:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:max-sm:transition-none",
        compact && "max-sm:gap-1",
      )}
    >
      {sourceScope && destinationScope ? (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label={`Copying from ${from} to ${to}`}
        >
          <span className="inline-flex items-center rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
            {from}
          </span>
          <span className="select-none text-sm text-muted-foreground" aria-hidden>
            →
          </span>
          <span className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {to}
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          "grid sm:grid-rows-[1fr] sm:opacity-100",
          "max-sm:transition-[grid-template-rows,opacity] max-sm:duration-300 max-sm:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:max-sm:transition-none",
          compact ? "max-sm:grid-rows-[0fr] max-sm:opacity-0" : "max-sm:grid-rows-[1fr] max-sm:opacity-100",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <h2 className="text-lg font-semibold leading-snug text-card-foreground">
            Choose existing officer accounts from your {from} roster
          </h2>
          <p id={subtitleId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Enter the number of days each worked before you add them.
          </p>
        </div>
      </div>
    </div>
  );
}
