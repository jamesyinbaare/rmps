"use client";

import { useCallback, useEffect, useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import {
  ScriptControlStatusTabs,
  statusFilterEmptyMessage,
  type ScriptControlStatusFilter,
} from "@/components/script-control/script-control-status-tabs";
import { STATUS_BADGE } from "@/components/script-control/script-control-view-table";
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
  subtitle,
  onSelect,
}: {
  row: ScriptControlSchoolStatusRow;
  active?: boolean;
  subtitle?: string;
  onSelect: () => void;
}) {
  const code = row.school_code;
  const name = row.school_name;
  const status = row.overall_status;
  const progress =
    "recorded_series" in row && "expected_series" in row
      ? `${row.recorded_series}/${row.expected_series} series`
      : null;

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
          <span className="block font-mono text-sm font-semibold">{code}</span>
          <span className="block truncate text-xs text-muted-foreground">{name}</span>
          {subtitle ? <span className="block text-xs text-primary">{subtitle}</span> : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {status ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_BADGE[status])}>
              {status}
            </span>
          ) : null}
          {progress ? <span className="text-xs tabular-nums text-muted-foreground">{progress}</span> : null}
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
  const [statusFilter, setStatusFilter] = useState<ScriptControlStatusFilter>("all");
  const isSearching = debouncedSearch.trim().length >= 2;
  const effectiveStatus: ScriptControlStatusFilter = isSearching ? "all" : statusFilter;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScriptControlSchoolStatusRow[]>([]);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof getScriptControlSchoolStatus>>["status_counts"] | null>(
    null,
  );

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        examination_id: examId,
        subject_id: subjectId,
        paper_number: paperNumber,
        region: region.trim() || undefined,
        school_q: isSearching ? debouncedSearch.trim() : undefined,
        status: effectiveStatus,
        skip: 0,
        limit: isSearching ? 500 : 100,
      };
      const res =
        recordType === "regular"
          ? await getScriptControlSchoolStatus(params)
          : await getIrregularScriptControlSchoolStatus(params);
      setItems(res.items);
      setCounts(res.status_counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schools");
      setItems([]);
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, effectiveStatus, examId, isSearching, paperNumber, recordType, region, statusFilter, subjectId]);

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
            Schools registered for this subject and paper only.
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

        {isSearching ? (
          <p className="text-xs text-muted-foreground">
            Showing all schools matching your search for this subject and paper.
          </p>
        ) : (
          <ScriptControlStatusTabs active={statusFilter} counts={counts} onChange={setStatusFilter} />
        )}

        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {loading ? "Loading…" : `${items.length} school${items.length === 1 ? "" : "s"}`}
          </p>
          {!loading && items.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              {isSearching
                ? "No schools match your search for this subject and paper."
                : statusFilterEmptyMessage(statusFilter)}
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
