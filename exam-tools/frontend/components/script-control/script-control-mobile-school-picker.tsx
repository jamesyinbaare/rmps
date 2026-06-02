"use client";

import { useCallback, useEffect, useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  getIrregularScriptControlSchoolStatus,
  getScriptControlSchoolStatus,
  type ScriptControlSchoolStatusRow,
} from "@/lib/api";
import { REGION_OPTIONS } from "@/lib/school-enums";
import type { RecentSchoolEntry } from "@/lib/script-control-recent-schools";
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
  examId: number;
  subjectId: number;
  paperNumber: number;
  recordType: "regular" | "irregular";
  region: string;
  onRegionChange: (value: string) => void;
  currentSchoolId?: string;
  onSelectSchool: (schoolId: string, entry: RecentSchoolEntry) => void;
};

function SchoolResultRow({
  row,
  active,
  onSelect,
}: {
  row: ScriptControlSchoolStatusRow;
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
          <span className="block font-mono text-sm font-semibold">{row.school_code}</span>
          <span className="block truncate text-xs text-muted-foreground">{row.school_name}</span>
        </span>
      </button>
    </li>
  );
}

export function ScriptControlMobileSchoolPicker({
  open,
  onOpenChange,
  examId,
  subjectId,
  paperNumber,
  recordType,
  region,
  onRegionChange,
  currentSchoolId,
  onSelectSchool,
}: Props) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const isSearching = debouncedSearch.trim().length >= 2;
  const hasRegion = region.trim().length > 0;
  const shouldFetch = hasRegion || isSearching;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScriptControlSchoolStatusRow[]>([]);

  const fetchSchools = useCallback(async () => {
    if (!shouldFetch) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = {
        examination_id: examId,
        subject_id: subjectId,
        paper_number: paperNumber,
        region: hasRegion ? region.trim() : undefined,
        school_q: isSearching ? debouncedSearch.trim() : undefined,
        status: "all" as const,
        skip: 0,
        limit: 500,
      };
      const res =
        recordType === "regular"
          ? await getScriptControlSchoolStatus(params)
          : await getIrregularScriptControlSchoolStatus(params);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schools");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, examId, hasRegion, isSearching, paperNumber, recordType, region, shouldFetch, subjectId]);

  useEffect(() => {
    if (!open) return;
    void fetchSchools();
  }, [fetchSchools, open]);

  function selectRow(row: ScriptControlSchoolStatusRow) {
    const entry: RecentSchoolEntry = {
      schoolId: row.school_id,
      schoolCode: row.school_code,
      schoolName: row.school_name,
    };
    onSelectSchool(row.school_id, entry);
    onOpenChange(false);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Find school"
      disableAutoFocus
    >
      <div className="space-y-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Find school</h2>
          <p className="text-sm text-muted-foreground">
            Choose a region or search by code or name to list schools for this subject and paper.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Region
          </label>
          <SearchableCombobox
            options={REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
            value={region}
            onChange={onRegionChange}
            placeholder="All regions"
            searchPlaceholder="Search region…"
            widthClass="w-full"
            showAllOption={false}
          />
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or name…"
          className="min-h-11 w-full rounded-lg border border-input-border bg-input px-3 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          autoComplete="off"
        />

        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div>
          {!shouldFetch ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              Select a region or type at least 2 characters to search.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              {isSearching
                ? "No schools match your search for this subject and paper."
                : "No schools in this region for this subject and paper."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.map((row) => (
                <SchoolResultRow
                  key={row.school_id}
                  row={row}
                  active={row.school_id === currentSchoolId}
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
