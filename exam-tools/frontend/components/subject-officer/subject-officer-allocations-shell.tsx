"use client";

import { ChevronRight, Loader2, MapPin, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { SubjectOfficerExamSelector } from "@/components/subject-officer/subject-officer-exam-bar";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { Badge } from "@/components/ui/badge";
import {
  getMarkedScriptReturnFilters,
  getSubjectOfficerExaminerScriptsAllocation,
  type ExaminerPublicScriptsAllocationBlock,
  type MarkedScriptReturnExaminerOption,
  type SubjectOfficerMeAssignmentSubject,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import {
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarRowClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

const SUBJECT_COMBO_THRESHOLD = 5;
const EXAMINER_LIST_LABEL_MAX_LEN = 28;
const panelHeightClass = "lg:h-[min(72vh,720px)]";

const compactLabelClass = "text-xs font-medium text-muted-foreground";
const filterControlCompact =
  "block w-full min-h-9 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const comboboxCompactProps = {
  widthClass: "w-full mt-0.5",
  triggerClassName: "h-9 min-h-9 py-0",
  truncateTrigger: true as const,
};

type Session = {
  examId: number | null;
  subjectId: number | null;
  examinerId: string | null;
};

type Props = {
  assignments: SubjectOfficerMeExamAssignment[];
  examId: number | null;
  onExamChange: (id: number | null) => void;
  assignmentsLoading?: boolean;
  session: Session;
  onSessionChange: (next: Partial<Session>) => void;
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

function formatExaminerListLabel(name: string, type: string, maxLen = EXAMINER_LIST_LABEL_MAX_LEN): string {
  const full = `${name} · ${type}`;
  if (full.length <= maxLen) return full;
  return `${full.slice(0, maxLen - 1)}…`;
}

function filterExaminers(
  examiners: MarkedScriptReturnExaminerOption[],
  query: string,
): MarkedScriptReturnExaminerOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return examiners;
  return examiners.filter(
    (e) =>
      e.examiner_name.toLowerCase().includes(q) ||
      e.examiner_type.toLowerCase().includes(q),
  );
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
    <div
      className={cn(
        "grid min-h-[420px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(260px,300px)_1fr]",
        panelHeightClass,
      )}
    >
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
  assignments,
  examId,
  onExamChange,
  assignmentsLoading = false,
  session,
  onSessionChange,
}: Props) {
  const { subjectId, examinerId } = session;

  const [examiners, setExaminers] = useState<MarkedScriptReturnExaminerOption[]>([]);
  const [blocks, setBlocks] = useState<ExaminerPublicScriptsAllocationBlock[]>([]);
  const [loadingExaminers, setLoadingExaminers] = useState(false);
  const [loadingAllocation, setLoadingAllocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examinerListSearch, setExaminerListSearch] = useState("");

  const selectedExam = assignments.find((e) => e.examination_id === examId) ?? null;
  const subjectOptions: SubjectOfficerMeAssignmentSubject[] = selectedExam?.subjects ?? [];

  const subjectLabel = useMemo(() => {
    const s = subjectOptions.find((x) => x.subject_id === subjectId);
    return s ? subjectDisplayLabel(s) : "";
  }, [subjectId, subjectOptions]);

  const filteredExaminers = useMemo(
    () => filterExaminers(examiners, examinerListSearch),
    [examiners, examinerListSearch],
  );

  const selectedExaminer = useMemo(
    () => examiners.find((e) => e.examiner_id === examinerId) ?? null,
    [examiners, examinerId],
  );

  const detailRows = useMemo(() => flattenAllocationRows(blocks), [blocks]);
  const bookletTotal = useMemo(() => totalBooklets(blocks), [blocks]);

  const subjectSelected = examId != null && subjectId != null;

  useEffect(() => {
    setExaminerListSearch("");
  }, [subjectId]);

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
      onSessionChange({ examinerId: null });
    }
  }, [examinerId, examiners, onSessionChange]);

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

  function handleExamChange(id: number | null) {
    onExamChange(id);
    onSessionChange({ examId: id, subjectId: null, examinerId: null });
  }

  const commandBar = (
    <div className={officialAccountsCommandBarRowClass}>
      <SubjectOfficerExamSelector
        assignments={assignments}
        examId={examId}
        onExamChange={handleExamChange}
        loading={assignmentsLoading}
        compact
      />

      <div className="min-w-36 flex-1 sm:max-w-xs">
        <label className={compactLabelClass} htmlFor="alloc-subject">
          Subject
        </label>
        {subjectOptions.length <= SUBJECT_COMBO_THRESHOLD ? (
          <select
            id="alloc-subject"
            className={cn(officialAccountsCommandBarControlClass, "mt-0.5 w-full")}
            value={subjectId ?? ""}
            disabled={examId == null}
            onChange={(e) =>
              onSessionChange({
                subjectId: e.target.value ? Number(e.target.value) : null,
                examinerId: null,
              })
            }
          >
            <option value="">Select…</option>
            {subjectOptions.map((s) => (
              <option key={s.subject_id} value={s.subject_id}>
                {subjectDisplayLabel(s)}
              </option>
            ))}
          </select>
        ) : (
          <SearchableCombobox
            id="alloc-subject"
            options={subjectOptions.map((s) => ({
              value: String(s.subject_id),
              label: subjectDisplayLabel(s),
            }))}
            value={subjectId != null ? String(subjectId) : ""}
            onChange={(v) =>
              onSessionChange({
                subjectId: v ? Number(v) : null,
                examinerId: null,
              })
            }
            placeholder="Select…"
            searchPlaceholder="Search…"
            showAllOption={false}
            disabled={examId == null}
            {...comboboxCompactProps}
          />
        )}
      </div>
    </div>
  );

  const masterDetail = !subjectSelected ? (
    <p className="text-sm text-muted-foreground">
      {examId == null
        ? "Select an examination and subject to view examiner allocations."
        : "Select a subject to view examiner allocations."}
    </p>
  ) : loadingExaminers && examiners.length === 0 ? (
    <MasterDetailSkeleton />
  ) : (
    <div
      className={cn(
        "grid min-h-[420px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(260px,300px)_1fr]",
        panelHeightClass,
      )}
    >
      <div className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:h-full lg:border-b-0 lg:border-r">
        <p className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground">
          Examiners
          {examiners.length > 0 ? (
            <span className="ml-1.5 font-normal text-muted-foreground">({examiners.length})</span>
          ) : null}
        </p>
        <div className="shrink-0 border-b border-border p-2">
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
          className="max-h-48 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 lg:max-h-none"
          role="listbox"
          aria-label="Examiners"
        >
          {filteredExaminers.length === 0 ? (
            <li className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
              {examiners.length === 0
                ? "No examiners found for this subject."
                : examinerId
                  ? "No examiners match your search. The selected examiner's allocation, if any, appears on the right."
                  : "No examiners match your search."}
            </li>
          ) : null}
          {filteredExaminers.map((examiner) => {
            const selected = examiner.examiner_id === examinerId;
            const label = formatExaminerListLabel(examiner.examiner_name, examiner.examiner_type);
            const labelFull = `${examiner.examiner_name} · ${examiner.examiner_type}`;
            return (
              <li key={examiner.examiner_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={labelFull}
                  title={labelFull}
                  onClick={() => onSessionChange({ examinerId: examiner.examiner_id })}
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
                    {label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      selected
                        ? "border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {examiner.examiner_type}
                  </span>
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

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden lg:h-full">
        {selectedExaminer || examinerId ? (
          <>
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border bg-gradient-to-b from-muted/35 to-muted/15 px-4 py-4 lg:px-5">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {selectedExaminer?.examiner_name ?? "Examiner"}
                  </h3>
                  {selectedExaminer ? (
                    <Badge variant="secondary" className="font-normal">
                      {selectedExaminer.examiner_type}
                    </Badge>
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
            <div className="max-h-[min(50vh,480px)] min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain p-3 lg:max-h-none lg:p-4 [&_th]:bg-card [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10">
              {loadingAllocation && detailRows.length === 0 ? (
                <div className="flex min-h-[200px] items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : detailRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
                  No published allocation yet for {selectedExaminer?.examiner_name ?? "this examiner"}.
                </div>
              ) : (
                <table className="w-full min-w-[32rem] border-collapse text-sm">
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
              )}
            </div>
          </>
        ) : (
          <p className="p-8 text-sm text-muted-foreground">Select an examiner to view their allocation.</p>
        )}
      </div>
    </div>
  );

  return (
    <SubjectOfficerPanelShell commandBar={commandBar}>
      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {masterDetail}
    </SubjectOfficerPanelShell>
  );
}
