"use client";

import { useEffect, useMemo, useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import type { ExaminationScriptSeriesConfigRow } from "@/lib/api";
import { displaySubjectCode } from "@/lib/script-control-completion";
import {
  filterSeriesConfigBySubjectType,
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesConfig: ExaminationScriptSeriesConfigRow[];
  subjectTypeFilter: ScriptControlSubjectTypeFilter;
  onSubjectTypeChange: (value: ScriptControlSubjectTypeFilter) => void;
  currentSubjectId?: number;
  onSelectSubject: (subjectId: number) => void;
};

function SubjectResultRow({
  row,
  active,
  onSelect,
}: {
  row: ExaminationScriptSeriesConfigRow;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex min-h-[56px] w-full items-center gap-3 px-1 py-3 text-left transition-colors",
          active ? "rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20" : "hover:bg-muted/50",
        )}
        onClick={onSelect}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-sm font-semibold">{displaySubjectCode(row)}</span>
          <span className="block truncate text-xs text-muted-foreground">{row.subject_name}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
          {row.subject_type.toLowerCase()}
        </span>
      </button>
    </li>
  );
}

export function ScriptControlMobileSubjectPicker({
  open,
  onOpenChange,
  seriesConfig,
  subjectTypeFilter,
  onSubjectTypeChange,
  currentSubjectId,
  onSelectSubject,
}: Props) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const debouncedSearch = useDebounced(search, 200);

  const filteredByType = useMemo(
    () => filterSeriesConfigBySubjectType(seriesConfig, subjectTypeFilter),
    [seriesConfig, subjectTypeFilter],
  );

  const items = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return filteredByType;
    return filteredByType.filter((row) => {
      const code = displaySubjectCode(row).toLowerCase();
      const name = row.subject_name.toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [debouncedSearch, filteredByType]);

  function selectRow(row: ExaminationScriptSeriesConfigRow) {
    onSelectSubject(row.subject_id);
    onOpenChange(false);
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Change subject" disableAutoFocus>
      <div className="space-y-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Change subject</h2>
          <p className="text-sm text-muted-foreground">Subjects registered for this examination.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Subject type
          </span>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "min-h-10 flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  subjectTypeFilter === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onSubjectTypeChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or name…"
          className="min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          autoComplete="off"
        />

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {`${items.length} subject${items.length === 1 ? "" : "s"}`}
          </p>
          {items.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No subjects match this filter.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.map((row) => (
                <SubjectResultRow
                  key={row.subject_id}
                  row={row}
                  active={row.subject_id === currentSubjectId}
                  onSelect={() => selectRow(row)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
