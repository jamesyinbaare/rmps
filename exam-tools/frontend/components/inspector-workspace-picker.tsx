"use client";

import { Check } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { formInputClass, formLabelClass } from "@/lib/form-classes";
import type { MyInspectorPostingRow } from "@/lib/api";
import {
  inspectorWorkspacePickerCopy,
  postingScopeLabel,
  scopePickerHeadlineClassName,
} from "@/lib/inspector-posting-ui";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

type InspectorWorkspacePickerProps = {
  postings: MyInspectorPostingRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  footer: ReactNode;
  searchThreshold?: number;
};

function PostingCard({
  posting,
  selected,
  disabled,
  onSelect,
}: {
  posting: MyInspectorPostingRow;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-14 w-full flex-col items-center gap-1.5 rounded-xl border px-6 py-3.5 text-center transition-colors",
        inputFocusRing,
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:bg-muted/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {selected ? (
        <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
      <span className={scopePickerHeadlineClassName(posting.subject_scope)}>
        {postingScopeLabel(posting.subject_scope)}
      </span>
      <span className="line-clamp-2 w-full text-sm font-medium text-foreground">{posting.center_name}</span>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">{posting.center_code}</span>
    </button>
  );
}

export function InspectorWorkspacePicker({
  postings,
  selectedId,
  onSelect,
  disabled,
  footer,
  searchThreshold = 6,
}: InspectorWorkspacePickerProps) {
  const [query, setQuery] = useState("");
  const searchable = postings.length > searchThreshold;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return postings;
    return postings.filter(
      (p) =>
        p.center_code.toLowerCase().includes(q) ||
        p.center_name.toLowerCase().includes(q) ||
        postingScopeLabel(p.subject_scope).toLowerCase().includes(q),
    );
  }, [postings, query]);

  const gridClass =
    postings.length >= 4 ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col gap-3";

  return (
    <div className="flex min-h-[min(60dvh,32rem)] flex-col">
      {searchable ? (
        <div className="shrink-0 pb-3">
          <label className={formLabelClass} htmlFor="inspector-workspace-search">
            Search centres
          </label>
          <input
            id="inspector-workspace-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={inspectorWorkspacePickerCopy.searchPlaceholder}
            autoComplete="off"
            disabled={disabled}
            className={cn(formInputClass, "min-h-11")}
          />
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label={inspectorWorkspacePickerCopy.radiogroupLabel}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", gridClass)}
      >
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? "No centres match your search." : "No postings available."}
          </p>
        ) : (
          filtered.map((p) => (
            <PostingCard
              key={p.id}
              posting={p}
              selected={selectedId === p.id}
              disabled={disabled}
              onSelect={() => onSelect(p.id)}
            />
          ))
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 shrink-0 border-t border-border bg-card/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:-mx-0 sm:px-0">
        {footer}
      </div>
    </div>
  );
}

export function InspectorWorkspacePickerSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading postings">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}
