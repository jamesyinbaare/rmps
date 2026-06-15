import { Loader2 } from "lucide-react";

import { RatioPresetsInput } from "@/components/inspector-analysis/ratio-presets-input";
import type { Examination, TimetableSubjectFilter } from "@/lib/api";
import { formatExamLabel, type SubjectScopeSelection } from "@/lib/inspector-analysis-report";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const SUBJECT_FILTER_OPTIONS: { value: TimetableSubjectFilter; label: string }[] = [
  { value: "ALL", label: "All subjects" },
  { value: "CORE_ONLY", label: "Core only" },
  { value: "ELECTIVE_ONLY", label: "Electives only" },
];

const filterFieldClass = "flex min-w-0 flex-col gap-1.5";
const filterControlClass = `${formInputClass} mt-0`;
const filterHintClass = "min-h-10 text-xs leading-snug text-muted-foreground";

type Props = {
  idPrefix: string;
  exams: Examination[];
  examsLoading: boolean;
  examId: number | null;
  onExamIdChange: (id: number | null) => void;
  subjectFilter: SubjectScopeSelection;
  onSubjectFilterChange: (scope: SubjectScopeSelection) => void;
  showRatio?: boolean;
  candidatesPerInspector?: number;
  onCandidatesPerInspectorChange?: (value: number) => void;
  rowSearch: string;
  onRowSearchChange: (value: string) => void;
  summaryActive: boolean;
  scopeSelected: boolean;
  canLoad: boolean;
  shellBusy: boolean;
  statsBusy: boolean;
  loadedCount: number;
  centreCount: number;
  isStale: boolean;
  onLoad: () => void;
  filterChips?: React.ReactNode;
  tableToolbar?: React.ReactNode;
};

export function InspectorAnalysisFilterToolbar({
  idPrefix,
  exams,
  examsLoading,
  examId,
  onExamIdChange,
  subjectFilter,
  onSubjectFilterChange,
  showRatio = false,
  candidatesPerInspector = 300,
  onCandidatesPerInspectorChange,
  rowSearch,
  onRowSearchChange,
  summaryActive,
  scopeSelected,
  canLoad,
  shellBusy,
  statsBusy,
  loadedCount,
  centreCount,
  isStale,
  onLoad,
  filterChips,
  tableToolbar,
}: Props) {
  const loadLabel = shellBusy
    ? "Loading centres…"
    : statsBusy
      ? `Loading ${loadedCount}/${centreCount}…`
      : summaryActive
        ? isStale
          ? "Refresh (settings changed)"
          : "Refresh"
        : "Load report";

  return (
    <div className="space-y-4 border-b border-border bg-muted/20 px-4 py-4 sm:px-5 sm:py-5">
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          showRatio ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-2",
        )}
      >
        <div className={filterFieldClass}>
          <label className={formLabelClass} htmlFor={`${idPrefix}-exam`}>
            Examination
          </label>
          <select
            id={`${idPrefix}-exam`}
            className={filterControlClass}
            value={examId ?? ""}
            disabled={examsLoading || exams.length === 0}
            onChange={(e) => {
              const v = e.target.value;
              onExamIdChange(v ? Number.parseInt(v, 10) : null);
            }}
          >
            {exams.length === 0 ? <option value="">No examinations</option> : null}
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {formatExamLabel(ex)}
              </option>
            ))}
          </select>
          <p className={filterHintClass} aria-hidden>
            &nbsp;
          </p>
        </div>

        <div className={filterFieldClass}>
          <label className={formLabelClass} htmlFor={`${idPrefix}-scope`}>
            Subject scope
          </label>
          <select
            id={`${idPrefix}-scope`}
            className={filterControlClass}
            value={subjectFilter}
            onChange={(e) => onSubjectFilterChange(e.target.value as SubjectScopeSelection)}
          >
            <option value="">Select scope…</option>
            {SUBJECT_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className={filterHintClass}>Required before loading.</p>
        </div>

        {showRatio && onCandidatesPerInspectorChange ? (
          <RatioPresetsInput
            id={`${idPrefix}-ratio`}
            value={candidatesPerInspector}
            disabled={examId === null}
            onChange={onCandidatesPerInspectorChange}
          />
        ) : null}
      </div>

      {!scopeSelected && !summaryActive ? (
        <p className="rounded-lg border border-dashed border-border bg-background/80 px-3 py-2.5 text-sm text-muted-foreground">
          Select a <strong className="text-foreground">subject scope</strong>
          {showRatio ? (
            <>
              {" "}
              and set the <strong className="text-foreground">candidates-per-inspector</strong> rule
            </>
          ) : null}
          , then choose <strong className="text-foreground">Load report</strong>.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          className={cn(
            officialAccountsBtnSecondary,
            "gap-2 min-h-10",
            isStale && summaryActive && "border-amber-500/50 bg-amber-500/10",
          )}
          disabled={!canLoad}
          onClick={onLoad}
          aria-busy={shellBusy || statsBusy}
        >
          {shellBusy || statsBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {loadLabel}
        </button>
        {isStale && summaryActive ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            Settings changed — refresh to update
          </span>
        ) : null}
      </div>

      {filterChips ? <div className="border-t border-border pt-4">{filterChips}</div> : null}

      {summaryActive ? (
        <div className="relative z-20 flex flex-col gap-3 overflow-visible border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className={cn(filterFieldClass, "sm:max-w-xs sm:flex-1")}>
            <label className={formLabelClass} htmlFor={`${idPrefix}-search`}>
              Search centres
            </label>
            <input
              id={`${idPrefix}-search`}
              type="search"
              className={filterControlClass}
              placeholder="Code or name…"
              value={rowSearch}
              onChange={(e) => onRowSearchChange(e.target.value)}
            />
          </div>
          {tableToolbar ? <div className="flex shrink-0 items-center gap-2">{tableToolbar}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
