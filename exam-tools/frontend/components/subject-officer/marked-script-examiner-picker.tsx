"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";

import { EXAMINER_LIST_SEARCH_DEBOUNCE_MS, useDebounced } from "@/hooks/use-debounced";
import type { MarkedScriptReturnExaminerOption } from "@/lib/api";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const EXAMINER_LIST_LABEL_MAX_LEN = 40;

const filterControlClass =
  "block w-full min-h-9 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export type MarkedScriptExaminerFilterOptions = {
  pendingOnly?: boolean;
  region?: string;
  role?: string;
  /** When true (default), the query matches examiner name only. */
  nameOnly?: boolean;
};

function sortMarkedScriptExaminers(
  examiners: MarkedScriptReturnExaminerOption[],
): MarkedScriptReturnExaminerOption[] {
  return [...examiners].sort((a, b) => {
    if (a.pending_count !== b.pending_count) return b.pending_count - a.pending_count;
    return a.examiner_name.localeCompare(b.examiner_name, undefined, { sensitivity: "base" });
  });
}

export function filterMarkedScriptExaminers(
  examiners: MarkedScriptReturnExaminerOption[],
  query: string,
  pendingOrOptions: boolean | MarkedScriptExaminerFilterOptions = {},
): MarkedScriptReturnExaminerOption[] {
  const options: MarkedScriptExaminerFilterOptions =
    typeof pendingOrOptions === "boolean" ? { pendingOnly: pendingOrOptions } : pendingOrOptions;
  const { pendingOnly = false, region = "", role = "", nameOnly = true } = options;

  const q = query.trim().toLowerCase();
  let result = examiners;

  if (pendingOnly) {
    result = result.filter((e) => e.pending_count > 0);
  }

  if (region) {
    result = result.filter((e) => e.region === region);
  }

  if (role) {
    result = result.filter((e) => e.examiner_type === role);
  }

  if (q) {
    result = result.filter((e) => {
      if (nameOnly) {
        return e.examiner_name.toLowerCase().includes(q);
      }
      const regionText = regionLabel(e.region).toLowerCase();
      return (
        e.examiner_name.toLowerCase().includes(q) ||
        e.examiner_type.toLowerCase().includes(q) ||
        e.region.toLowerCase().includes(q) ||
        regionText.includes(q)
      );
    });
  }

  return sortMarkedScriptExaminers(result);
}

export function formatMarkedScriptExaminerOptionLabel(
  examiner: MarkedScriptReturnExaminerOption,
): string {
  const role = examiner.examiner_type;
  const region = regionLabel(examiner.region);
  const pending =
    examiner.pending_count > 0 ? ` · ${examiner.pending_count} pending` : "";
  return `${examiner.examiner_name} · ${role} · ${region}${pending}`;
}

function formatExaminerListLabel(name: string, maxLen = EXAMINER_LIST_LABEL_MAX_LEN): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

type Props = {
  examiners: MarkedScriptReturnExaminerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  pendingOnly: boolean;
  onPendingOnlyChange: (pendingOnly: boolean) => void;
  loading?: boolean;
  listClassName?: string;
  className?: string;
};

export function MarkedScriptExaminerPicker({
  examiners,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  pendingOnly,
  onPendingOnlyChange,
  loading = false,
  listClassName,
  className,
}: Props) {
  const debouncedSearchQuery = useDebounced(searchQuery, EXAMINER_LIST_SEARCH_DEBOUNCE_MS);
  const isDebouncing =
    searchQuery.trim() !== debouncedSearchQuery.trim() && searchQuery.trim().length > 0;
  const shouldShowList = debouncedSearchQuery.trim().length > 0 || pendingOnly;

  const filteredExaminers = useMemo(() => {
    if (!shouldShowList) return [];
    return filterMarkedScriptExaminers(examiners, debouncedSearchQuery, { pendingOnly, nameOnly: false });
  }, [debouncedSearchQuery, examiners, pendingOnly, shouldShowList]);

  const pendingTotal = useMemo(
    () => examiners.filter((e) => e.pending_count > 0).length,
    [examiners],
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <p className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground">
        Examiners
        {examiners.length > 0 ? (
          <span className="ml-1.5 font-normal text-muted-foreground">({examiners.length})</span>
        ) : null}
      </p>

      <div className="shrink-0 space-y-2 border-b border-border p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="msr-examiner-list-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search examiners…"
            aria-label="Search examiners"
            className={cn(filterControlClass, "py-2 pl-8 text-sm")}
            autoComplete="off"
          />
        </div>

        {pendingTotal > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 px-0.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 rounded border-border"
              checked={pendingOnly}
              onChange={(e) => onPendingOnlyChange(e.target.checked)}
            />
            Pending only ({pendingTotal})
          </label>
        ) : null}
      </div>

      <ul
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain p-2",
          listClassName,
        )}
        role="listbox"
        aria-label="Examiners"
        aria-busy={loading}
      >
        {loading && examiners.length === 0 ? (
          <li className="px-3 py-4 text-xs text-muted-foreground">Loading examiners…</li>
        ) : isDebouncing ? (
          <li className="px-3 py-4 text-xs text-muted-foreground">Searching…</li>
        ) : !shouldShowList ? (
          <li className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
            Type to search examiners.
          </li>
        ) : filteredExaminers.length === 0 ? (
          <li className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
            {examiners.length === 0
              ? "No examiners with allocated scripts for this subject."
              : selectedId
                ? "No examiners match your search. The selected examiner's scripts, if any, appear below."
                : pendingOnly && !debouncedSearchQuery.trim()
                  ? "No examiners with pending scripts."
                  : "No examiners match your search."}
          </li>
        ) : (
          filteredExaminers.map((examiner) => {
            const selected = examiner.examiner_id === selectedId;
            const allVerified = examiner.pending_count === 0;
            const labelFull = `${examiner.examiner_name} · ${examiner.examiner_type} · ${regionLabel(examiner.region)}`;

            return (
              <li key={examiner.examiner_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={labelFull}
                  title={labelFull}
                  onClick={() => onSelect(examiner.examiner_id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    selected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/80",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 flex h-2.5 w-2.5 shrink-0 rounded-full",
                      allVerified
                        ? "bg-success"
                        : "border-2 border-amber-500/70 bg-transparent",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate font-medium leading-snug",
                        !selected && "text-foreground",
                      )}
                    >
                      {formatExaminerListLabel(examiner.examiner_name)}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-xs leading-snug",
                        selected ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {examiner.examiner_type} · {regionLabel(examiner.region)}
                    </span>
                  </span>
                  {examiner.pending_count > 0 ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        selected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                      )}
                    >
                      {examiner.pending_count}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
