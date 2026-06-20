"use client";

import { ChevronRight, Loader2, MapPin, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EXAMINER_LIST_SEARCH_DEBOUNCE_MS, useDebounced } from "@/hooks/use-debounced";
import { AllocationDetailCards } from "@/components/subject-officer/allocation-detail-cards";
import { ExaminerRoleBadge } from "@/components/subject-officer/examiner-role-badge";
import { SubjectOfficerExaminerDetailFilters } from "@/components/subject-officer/subject-officer-examiner-detail-filters";
import {
  markedScriptExaminerRegionOptions,
  markedScriptExaminerRoleOptions,
} from "@/components/subject-officer/marked-script-examiner-picker";
import {
  SO_MASTER_DETAIL_DETAIL_CLASS,
  SO_MASTER_DETAIL_GRID_CLASS,
  SO_MASTER_DETAIL_MASTER_CLASS,
} from "@/components/examiners/constants";
import { SubjectOfficerExaminerMobilePicker } from "@/components/subject-officer/subject-officer-examiner-mobile-picker";
import {
  examinerRoleLabel,
  filterAllocationExaminers,
  filterExaminersByRegionAndRole,
  regionLabel,
  sortAllocationExaminers,
} from "@/components/subject-officer/subject-officer-examiner-utils";
import { SubjectOfficerSelectedExaminerBar } from "@/components/subject-officer/subject-officer-selected-examiner-bar";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { SubjectOfficerWorkspaceStrip } from "@/components/subject-officer/subject-officer-workspace-strip";
import { Badge } from "@/components/ui/badge";
import {
  getMarkedScriptReturnFilters,
  getSubjectOfficerExaminerScriptsAllocation,
  type ExaminerPublicScriptsAllocationBlock,
  type MarkedScriptReturnExaminerOption,
} from "@/lib/api";
import {
  officialAccountsCommandBarRowClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const EXAMINER_LIST_LABEL_MAX_LEN = 28;

const filterControlCompact =
  "block w-full min-h-9 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type Props = {
  examId: number;
  subjectId: number;
  workspaceLabel: string;
  examinerId: string | null;
  onExaminerChange: (id: string | null) => void;
};

type AllocationDetailRow = {
  key: string;
  paperNumber: number;
  schoolCode: string;
  schoolName: string;
  envelopeNumber: number;
  seriesNumber: number;
  bookletCount: number;
};

function formatExaminerListLabel(name: string, maxLen = EXAMINER_LIST_LABEL_MAX_LEN): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

function filterExaminers(
  examiners: MarkedScriptReturnExaminerOption[],
  query: string,
): MarkedScriptReturnExaminerOption[] {
  return filterAllocationExaminers(examiners, query);
}

function flattenAllocationRows(blocks: ExaminerPublicScriptsAllocationBlock[]): AllocationDetailRow[] {
  return blocks.flatMap((block) =>
    block.rows.map((row) => ({
      key: `${block.paper_number}-${row.school_code}-${row.envelope_number}-${row.series_number}`,
      paperNumber: block.paper_number,
      schoolCode: row.school_code,
      schoolName: row.school_name,
      envelopeNumber: row.envelope_number,
      seriesNumber: row.series_number,
      bookletCount: row.booklet_count,
    })),
  );
}

function totalBooklets(blocks: ExaminerPublicScriptsAllocationBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.total_booklets, 0);
}

function MasterDetailSkeleton() {
  return (
    <div className={cn(SO_MASTER_DETAIL_GRID_CLASS, "lg:min-h-[420px]")}>
      <div className="animate-pulse border-b border-border p-4 lg:border-b-0 lg:border-r">
        <div className="mb-3 h-4 w-32 rounded bg-muted" />
        <div className="mb-2 h-9 rounded bg-muted" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/60" />
          ))}
        </div>
      </div>
      <div className="animate-pulse p-4">
        <div className="mb-4 h-6 w-48 rounded bg-muted" />
        <div className="h-48 rounded bg-muted/60" />
      </div>
    </div>
  );
}

export function SubjectOfficerAllocationsShell({
  examId,
  subjectId,
  workspaceLabel,
  examinerId,
  onExaminerChange,
}: Props) {

  const [examiners, setExaminers] = useState<MarkedScriptReturnExaminerOption[]>([]);
  const [blocks, setBlocks] = useState<ExaminerPublicScriptsAllocationBlock[]>([]);
  const [loadingExaminers, setLoadingExaminers] = useState(false);
  const [loadingAllocation, setLoadingAllocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examinerListSearch, setExaminerListSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const debouncedExaminerListSearch = useDebounced(examinerListSearch, EXAMINER_LIST_SEARCH_DEBOUNCE_MS);
  const isDebouncing =
    examinerListSearch.trim() !== debouncedExaminerListSearch.trim() &&
    examinerListSearch.trim().length > 0;
  const hasExaminerSearch = debouncedExaminerListSearch.trim().length > 0;
  const hasActiveDetailFilters = regionFilter.length > 0 || roleFilter.length > 0;

  const subjectLabel = workspaceLabel.split(" · ").slice(-1)[0] ?? workspaceLabel;

  const regionOptions = useMemo(() => markedScriptExaminerRegionOptions(examiners), [examiners]);
  const roleOptions = useMemo(() => markedScriptExaminerRoleOptions(examiners), [examiners]);

  const filteredExaminers = useMemo(() => {
    const byRegionRole = filterExaminersByRegionAndRole(examiners, regionFilter, roleFilter);
    return sortAllocationExaminers(filterExaminers(byRegionRole, debouncedExaminerListSearch));
  }, [debouncedExaminerListSearch, examiners, regionFilter, roleFilter]);

  const selectedExaminer = useMemo(
    () => examiners.find((e) => e.examiner_id === examinerId) ?? null,
    [examiners, examinerId],
  );

  const detailRows = useMemo(() => flattenAllocationRows(blocks), [blocks]);
  const bookletTotal = useMemo(() => totalBooklets(blocks), [blocks]);

  const subjectSelected = examId != null && subjectId != null;

  useEffect(() => {
    if (!subjectSelected || examId == null || subjectId == null) {
      setExaminers([]);
      return;
    }
    let cancelled = false;
    setLoadingExaminers(true);
    setError(null);
    void getMarkedScriptReturnFilters(examId, subjectId)
      .then((data) => {
        if (!cancelled) setExaminers(data.examiners);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load examiners");
          setExaminers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExaminers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, subjectId, subjectSelected]);

  useEffect(() => {
    if (examinerId && examiners.length > 0 && !examiners.some((e) => e.examiner_id === examinerId)) {
      onExaminerChange(null);
    }
  }, [examinerId, examiners, onExaminerChange]);

  useEffect(() => {
    if (!subjectSelected || examId == null || subjectId == null || !examinerId) {
      setBlocks([]);
      return;
    }
    let cancelled = false;
    setLoadingAllocation(true);
    setError(null);
    void getSubjectOfficerExaminerScriptsAllocation(examId, examinerId, subjectId)
      .then((data) => {
        if (!cancelled) setBlocks(data.blocks);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load allocation");
          setBlocks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAllocation(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, examinerId, subjectId, subjectSelected]);

  const commandBar = (
    <div className={officialAccountsCommandBarRowClass}>
      <SubjectOfficerWorkspaceStrip workspaceLabel={workspaceLabel} workspace={null} />
    </div>
  );

  const masterDetail = loadingExaminers && examiners.length === 0 ? (
    <MasterDetailSkeleton />
  ) : (
    <>
      {!examinerId ? (
        <div className="max-md:px-3 max-md:py-4 lg:hidden">
          <SubjectOfficerExaminerMobilePicker
            variant="allocation"
            examiners={examiners}
            selectedId={null}
            onSelect={onExaminerChange}
            loading={loadingExaminers}
          />
        </div>
      ) : null}

      <div
        className={cn(
          SO_MASTER_DETAIL_GRID_CLASS,
          !examinerId && "hidden lg:grid",
        )}
      >
        <div className={SO_MASTER_DETAIL_MASTER_CLASS}>
        <p className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground">
          Examiners
          {examiners.length > 0 ? (
            <span className="ml-1.5 font-normal text-muted-foreground">({examiners.length})</span>
          ) : null}
        </p>
        <div className="shrink-0 space-y-2 border-b border-border p-2">
          <SubjectOfficerExaminerDetailFilters
            idPrefix="alloc-examiner"
            regionOptions={regionOptions}
            roleOptions={roleOptions}
            regionFilter={regionFilter}
            roleFilter={roleFilter}
            onRegionFilterChange={setRegionFilter}
            onRoleFilterChange={setRoleFilter}
            disabled={loadingExaminers}
          />
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="alloc-examiner-list-search"
              type="search"
              value={examinerListSearch}
              onChange={(e) => setExaminerListSearch(e.target.value)}
              placeholder="Search examiners…"
              aria-label="Search examiners"
              className={cn(filterControlCompact, "py-2 pl-8 text-sm")}
              autoComplete="off"
            />
          </div>
        </div>
        <ul
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          role="listbox"
          aria-label="Examiners"
        >
          {isDebouncing ? (
            <li className="px-3 py-4 text-xs text-muted-foreground">Searching…</li>
          ) : filteredExaminers.length === 0 ? (
            <li className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
              {examiners.length === 0
                ? "No examiners found for this subject."
                : hasExaminerSearch || hasActiveDetailFilters
                  ? examinerId
                    ? "No examiners match your search. The selected examiner's allocation, if any, appears on the right."
                    : "No examiners match your search or filters."
                  : "No examiners found for this subject."}
            </li>
          ) : null}
          {filteredExaminers.map((examiner) => {
            const selected = examiner.examiner_id === examinerId;
            const roleLabel = examinerRoleLabel(examiner.examiner_type);
            const labelFull = `${examiner.examiner_name} · ${roleLabel}`;
            return (
              <li key={examiner.examiner_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={labelFull}
                  title={labelFull}
                  onClick={() => onExaminerChange(examiner.examiner_id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    selected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/80",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-medium leading-snug",
                      !selected && "text-foreground",
                    )}
                  >
                    {formatExaminerListLabel(examiner.examiner_name)}
                  </span>
                  <ExaminerRoleBadge
                    examinerType={examiner.examiner_type}
                    variant={selected ? "selected" : "default"}
                  />
                  <ChevronRight
                    className={cn("size-4 shrink-0", selected ? "opacity-90" : "text-muted-foreground")}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className={cn(
          SO_MASTER_DETAIL_DETAIL_CLASS,
          !examinerId && "hidden lg:flex",
        )}
      >
        {selectedExaminer || examinerId ? (
          <>
            {selectedExaminer ? (
              <SubjectOfficerSelectedExaminerBar
                className="lg:hidden"
                name={selectedExaminer.examiner_name}
                examinerType={selectedExaminer.examiner_type}
                region={selectedExaminer.region}
                phone={selectedExaminer.phone_number}
                statValue={bookletTotal > 0 ? bookletTotal : undefined}
                statLabel={bookletTotal > 0 ? "booklets" : undefined}
                onChange={() => onExaminerChange(null)}
              />
            ) : null}

            <div className="hidden shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border bg-gradient-to-b from-muted/35 to-muted/15 px-4 py-4 lg:flex lg:px-5">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {selectedExaminer?.examiner_name ?? "Examiner"}
                  </h3>
                  {selectedExaminer ? (
                    <ExaminerRoleBadge
                      examinerType={selectedExaminer.examiner_type}
                      variant="secondary"
                    />
                  ) : null}
                  {subjectLabel ? (
                    <Badge
                      variant="outline"
                      className="border-border/80 bg-background/80 font-normal text-foreground"
                    >
                      {subjectLabel}
                    </Badge>
                  ) : null}
                </div>
                {selectedExaminer ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      {regionLabel(selectedExaminer.region)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      {selectedExaminer.phone_number?.trim() ? (
                        <a
                          href={`tel:${selectedExaminer.phone_number.trim()}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {selectedExaminer.phone_number.trim()}
                        </a>
                      ) : (
                        <span className="text-muted-foreground/80">No phone on file</span>
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
              {bookletTotal > 0 ? (
                <div className="shrink-0 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-center shadow-sm">
                  <p className="text-xl font-semibold tabular-nums leading-none text-foreground">
                    {bookletTotal.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Booklets
                  </p>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 p-3 lg:min-h-0 lg:flex-1 lg:overflow-x-auto lg:overflow-y-auto lg:overscroll-contain lg:p-4 [&_th]:bg-card [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10">
              {loadingAllocation && detailRows.length === 0 ? (
                <div className="flex min-h-[200px] items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : detailRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
                  No published allocation yet for {selectedExaminer?.examiner_name ?? "this examiner"}.
                </div>
              ) : (
                <>
                  <div className="lg:hidden">
                    <AllocationDetailCards rows={detailRows} bookletTotal={bookletTotal} />
                  </div>
                  <table className="hidden w-full min-w-[32rem] border-collapse text-sm lg:table">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Paper</th>
                      <th className="px-3 py-2 font-semibold">School</th>
                      <th className="px-3 py-2 text-right font-semibold">Env #</th>
                      <th className="px-3 py-2 text-right font-semibold">Series</th>
                      <th className="px-3 py-2 text-right font-semibold">Booklets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((row) => (
                      <tr key={row.key} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                          P{row.paperNumber}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-foreground">{row.schoolCode}</span>
                          <span className="text-muted-foreground"> — {row.schoolName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{row.envelopeNumber}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{row.seriesNumber}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {row.bookletCount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-semibold text-foreground">
                      <td className="px-3 py-2.5" colSpan={4}>
                        Total booklets
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {bookletTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="hidden p-8 text-sm text-muted-foreground lg:block">
            Select an examiner to view their allocation.
          </p>
        )}
      </div>
    </div>
    </>
  );

  return (
    <SubjectOfficerPanelShell commandBar={commandBar} flushMobileContent fillViewport>
      {error ? (
        <p className="mb-4 max-md:mx-3 shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-0">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{masterDetail}</div>
    </SubjectOfficerPanelShell>
  );
}
