"use client";

import { Check } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { formInputClass, formLabelClass } from "@/lib/form-classes";
import type { SubjectOfficerWorkspaceOption } from "@/lib/subject-officer-exams";
import { subjectOfficerWorkspacePickerCopy } from "@/lib/subject-officer-workspace-ui";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

type Props = {
  workspaces: SubjectOfficerWorkspaceOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  footer: ReactNode;
  searchThreshold?: number;
};

function WorkspaceCard({
  workspace,
  selected,
  disabled,
  onSelect,
}: {
  workspace: SubjectOfficerWorkspaceOption;
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
        "relative flex min-h-14 w-full flex-col items-start gap-1 rounded-xl border px-4 py-3.5 text-left transition-colors",
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
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {workspace.examinationName}
      </span>
      <span className="line-clamp-2 text-sm font-semibold text-foreground">{workspace.subjectLabel}</span>
    </button>
  );
}

export function SubjectOfficerWorkspacePicker({
  workspaces,
  selectedId,
  onSelect,
  disabled,
  footer,
  searchThreshold = 6,
}: Props) {
  const [query, setQuery] = useState("");
  const searchable = workspaces.length > searchThreshold;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.examinationName.toLowerCase().includes(q) ||
        w.subjectLabel.toLowerCase().includes(q),
    );
  }, [workspaces, query]);

  const gridClass =
    workspaces.length >= 4 ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col gap-3";

  return (
    <div className="flex min-h-[min(60dvh,32rem)] flex-col">
      {searchable ? (
        <div className="shrink-0 pb-3">
          <label className={formLabelClass} htmlFor="so-workspace-search">
            Search
          </label>
          <input
            id="so-workspace-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={subjectOfficerWorkspacePickerCopy.searchPlaceholder}
            autoComplete="off"
            disabled={disabled}
            className={cn(formInputClass, "min-h-11")}
          />
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label={subjectOfficerWorkspacePickerCopy.radiogroupLabel}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", gridClass)}
      >
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? "No workspaces match your search." : "No assignments available."}
          </p>
        ) : (
          filtered.map((w) => (
            <WorkspaceCard
              key={w.assignmentId}
              workspace={w}
              selected={selectedId === w.assignmentId}
              disabled={disabled}
              onSelect={() => onSelect(w.assignmentId)}
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

export function SubjectOfficerWorkspacePickerSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading workspaces">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}
