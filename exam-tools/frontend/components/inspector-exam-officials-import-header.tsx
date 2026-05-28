"use client";

import type { RecordSubjectScope } from "@/lib/api";

export function scopeDisplayLabel(scope: RecordSubjectScope): string {
  return scope === "CORE" ? "Core" : "Elective";
}

export function ImportScopeModalHeader({
  sourceScope,
  destinationScope,
  subtitleId,
}: {
  sourceScope: RecordSubjectScope | null;
  destinationScope: RecordSubjectScope | null;
  subtitleId: string;
}) {
  const from = sourceScope ? scopeDisplayLabel(sourceScope) : "the other scope";
  const to = destinationScope ? scopeDisplayLabel(destinationScope) : "this scope";

  return (
    <div className="space-y-3 pr-1">
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
      <div>
        <h2 className="text-lg font-semibold leading-snug text-card-foreground">
          Choose existing officer accounts from your {from} roster
        </h2>
        <p id={subtitleId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enter the number of days each worked before you add them.
        </p>
      </div>
    </div>
  );
}
