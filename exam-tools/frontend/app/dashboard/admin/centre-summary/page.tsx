"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Download,
  CalendarDays,
  Loader2,
  MinusCircle,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { SubjectScopeBadge, SubjectScopeLegend, timetableFilterBadgeScope } from "@/components/subject-scope-badge";
import {
  apiJson,
  displayBankCode,
  downloadFinanceCentreSchoolSummaryExport,
  downloadFinanceCentreSchoolSummaryBogExport,
  centreBogExportFilename,
  listExaminationCentres,
  schoolSummaryExportFilename,
  type AdminExamCentreOfficialRow,
  type Examination,
  type FinanceCentreDayInvigilatorRow,
  type FinanceCentreSchoolSummaryResponse,
  type PerExamCentreItem,
  type TimetableSubjectFilter,
} from "@/lib/api";
import {
  getCachedCentreInvigilatorDays,
  getCachedCentreSchoolSummary,
  peekCachedCentreInvigilatorDays,
  peekCachedCentreSchoolSummary,
} from "@/lib/finance-statistics-cache";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  OFFICIAL_ACCOUNTS_ADMIN_HREF,
  BANK_ACCOUNTS_LABEL,
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";
import { subjectScopeBadgeClass } from "@/lib/subject-scope-display";
import { OfficialAllowanceBreakdownCell } from "@/components/official-allowance-breakdown";
import { REGION_OPTIONS } from "@/lib/school-enums";

const DEFAULT_SUBJECT_FILTER: TimetableSubjectFilter = "CORE_ONLY";

const SUBJECT_SCOPE_OPTIONS: { value: TimetableSubjectFilter; label: string; hint: string }[] = [
  { value: "CORE_ONLY", label: "Core", hint: "Core subjects only" },
  { value: "ELECTIVE_ONLY", label: "Elective", hint: "Elective subjects only" },
  { value: "ALL", label: "All", hint: "Include core and elective examination days" },
];

const ROLE_CARDS: {
  key: keyof FinanceCentreSchoolSummaryResponse["role_counts"];
  shortLabel: string;
  fullLabel: string;
}[] = [
  { key: "external_inspector", shortLabel: "Ext. insp.", fullLabel: "External Inspector" },
  { key: "police_officer", shortLabel: "Police", fullLabel: "Police Officer" },
  { key: "supervisor", shortLabel: "Supervisor", fullLabel: "Supervisor" },
  { key: "depot_keeper", shortLabel: "Depot", fullLabel: "Depot Keeper" },
  { key: "assistant_supervisor", shortLabel: "Asst. sup.", fullLabel: "Assistant Supervisor" },
];

const ALL_DESIGNATIONS = "__all__";

type InvigilationTone = "over" | "match" | "under";
type SortKey = "name" | "designation" | "days";
type SortDir = "asc" | "desc";

const filterToolbarClass =
  "space-y-4 border-b border-border bg-muted/20 px-4 py-4 sm:px-5";
const filterToolbarSectionClass = "flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4";
const filterFieldClass = "flex min-w-0 flex-col gap-1.5";
/** Toolbar selects — text-sm to match compact controls. */
const filterSelectClass =
  "block w-full min-h-10 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const statCardClass =
  "flex h-36 flex-col items-center justify-center rounded-xl border border-border bg-card p-2 text-center lg:h-full lg:min-h-36";

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function invigilationTone(declared: number, expected: number): InvigilationTone {
  if (declared > expected) return "over";
  if (declared < expected) return "under";
  return "match";
}

function invigilatorCardStyles(tone: InvigilationTone) {
  switch (tone) {
    case "over":
      return {
        card: "border-destructive/45 bg-destructive/5 ring-1 ring-destructive/15",
        declared: "text-destructive",
        badge: "bg-destructive/15 text-destructive",
        Icon: AlertCircle,
        badgeText: "Over",
        captionText: "Over expected",
      };
    case "match":
      return {
        card: "border-success/45 bg-success/5 ring-1 ring-success/15",
        declared: "text-success",
        badge: "bg-success/15 text-success",
        Icon: CheckCircle2,
        badgeText: "Match",
        captionText: "Matches expected",
      };
    case "under":
      return {
        card: "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/15 dark:border-amber-400/40",
        declared: "text-amber-700 dark:text-amber-400",
        badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        Icon: MinusCircle,
        badgeText: "Short",
        captionText: "Below expected",
      };
  }
}

function varianceDetail(variance: number): string {
  if (variance === 0) return "0 difference";
  if (variance > 0) return `+${variance} over`;
  return `${Math.abs(variance)} short`;
}

function SummarySkeleton() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-5" role="status" aria-label="Loading summary">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="h-36 w-full animate-pulse rounded-xl bg-muted/50 lg:max-w-sm" />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
    </div>
  );
}

function formatExamDayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function subjectScopeLabel(filter: TimetableSubjectFilter): string {
  return SUBJECT_SCOPE_OPTIONS.find((o) => o.value === filter)?.label ?? filter;
}

function SubjectScopeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: TimetableSubjectFilter;
  onChange: (value: TimetableSubjectFilter) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(filterFieldClass, "w-fit shrink-0")}
      title="Choose which subject types to include in centre totals and official lists."
    >
      <span className={formLabelClass}>Subject scope</span>
      <div
        className="inline-flex min-h-10 shrink-0 rounded-lg border border-input-border bg-muted/30 p-0.5 shadow-sm"
        role="radiogroup"
        aria-label="Subject scope"
      >
        {SUBJECT_SCOPE_OPTIONS.map((opt) => {
          const id = `centre-summary-scope-${opt.value}`;
          const checked = value === opt.value;
          const badgeScope = timetableFilterBadgeScope(opt.value);
          return (
            <label
              key={opt.value}
              htmlFor={id}
              title={opt.hint}
              className={cn(
                "flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors",
                checked
                  ? cn("shadow-sm ring-1 ring-success/30", subjectScopeBadgeClass(badgeScope))
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <input
                id={id}
                type="radio"
                name="centre-summary-scope"
                className="sr-only"
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ExpectedByDayModal({
  open,
  onClose,
  centreLabel,
  subjectFilter,
  days,
  loading,
  loadError,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  centreLabel: string;
  subjectFilter: TimetableSubjectFilter;
  days: FinanceCentreDayInvigilatorRow[] | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dayTotal = days?.reduce((s, d) => s + d.invigilators_required, 0) ?? null;

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-3.5 sm:px-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              Expected by exam day
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={centreLabel}>
              {centreLabel}
            </p>
            <p className="text-xs text-muted-foreground">{subjectScopeLabel(subjectFilter)}</p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[min(24rem,55vh)] overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading breakdown…
            </p>
          ) : null}
          {loadError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-destructive">{loadError}</p>
              <button type="button" className={officialAccountsBtnSecondary} onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : null}
          {!loading && !loadError && days?.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No examination dates in scope for this centre.
            </p>
          ) : null}
          {!loading && !loadError && days && days.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-semibold">Date</th>
                  <th className="pb-2 pr-3 text-right font-semibold tabular-nums">Candidates</th>
                  <th className="pb-2 text-right font-semibold tabular-nums">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {days.map((d) => (
                  <tr key={d.examination_date} className="hover:bg-muted/30">
                    <td className="py-2.5 pr-3 text-foreground">{formatExamDayLabel(d.examination_date)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {d.unique_candidates}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{d.invigilators_required}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20 font-semibold">
                  <td className="py-2.5 pr-3">Total expected</td>
                  <td className="py-2.5 pr-3" />
                  <td className="py-2.5 text-right tabular-nums">{dayTotal}</td>
                </tr>
              </tfoot>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExpectedByDayBreakdown({
  examId,
  centerId,
  subjectFilter,
  centreLabel,
}: {
  examId: number;
  centerId: string;
  subjectFilter: TimetableSubjectFilter;
  centreLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<FinanceCentreDayInvigilatorRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDays = useCallback(async (options?: { revalidate?: boolean }) => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getCachedCentreInvigilatorDays({
        examId,
        centerId,
        subject_filter: subjectFilter,
        revalidate: options?.revalidate,
      });
      setDays(result.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load daily breakdown");
      setDays(null);
    } finally {
      setLoading(false);
    }
  }, [examId, centerId, subjectFilter]);

  useEffect(() => {
    const cached = peekCachedCentreInvigilatorDays(examId, centerId, subjectFilter);
    setDays(cached);
    setLoadError(null);
  }, [examId, centerId, subjectFilter]);

  useEffect(() => {
    if (!open) return;
    void loadDays();
  }, [open, loadDays]);

  return (
    <>
      <button
        type="button"
        className="mt-1 text-left text-xs font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Expected by exam day
      </button>
      <ExpectedByDayModal
        open={open}
        onClose={() => setOpen(false)}
        centreLabel={centreLabel}
        subjectFilter={subjectFilter}
        days={days}
        loading={loading}
        loadError={loadError}
        onRetry={() => void loadDays({ revalidate: true })}
      />
    </>
  );
}


function SummaryCardsRow({
  summary,
  examId,
  centerId,
  subjectFilter,
}: {
  summary: FinanceCentreSchoolSummaryResponse;
  examId: number;
  centerId: string;
  subjectFilter: TimetableSubjectFilter;
}) {
  const declared = summary.invigilator_days_declared;
  const expected = summary.expected_invigilations_total;
  const tone = invigilationTone(declared, expected);
  const styles = invigilatorCardStyles(tone);
  const Icon = styles.Icon;

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(18rem,2.25fr)_repeat(5,minmax(4.5rem,1fr))] lg:grid-rows-1">
        <div
          className={cn(
            "col-span-3 flex h-36 flex-col justify-between rounded-xl border p-4 sm:p-5 lg:col-span-1 lg:h-full lg:min-h-36",
            styles.card,
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invigilator days</p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                styles.badge,
              )}
            >
              <Icon className="size-3" aria-hidden />
              {styles.badgeText}
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold leading-none tracking-tight tabular-nums">
            <span className={styles.declared}>{declared}</span>
            <span className="mx-1 font-normal text-muted-foreground">/</span>
            <span className="text-foreground">{expected}</span>
          </p>
          <p className={cn("text-xs font-medium", styles.declared)}>{varianceDetail(summary.variance)}</p>
          <ExpectedByDayBreakdown
            examId={examId}
            centerId={centerId}
            subjectFilter={subjectFilter}
            centreLabel={`${summary.center_code} — ${summary.center_name}`}
          />
        </div>

        {ROLE_CARDS.map(({ key, shortLabel, fullLabel }) => (
          <div key={key} title={fullLabel} className={statCardClass}>
            <p className="line-clamp-2 text-[10px] font-medium leading-tight text-muted-foreground">{shortLabel}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{summary.role_counts[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function sortOfficials(rows: AdminExamCentreOfficialRow[], key: SortKey, dir: SortDir): AdminExamCentreOfficialRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "days") return (a.num_days - b.num_days) * mul;
    if (key === "designation") return a.designation.localeCompare(b.designation) * mul;
    return a.full_name.localeCompare(b.full_name) * mul;
  });
}

function ExportButton({
  disabled,
  busy,
  label,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(officialAccountsBtnPrimary, "w-full sm:w-auto")}
      disabled={disabled || busy}
      title={disabled ? "Select a centre to export" : undefined}
      onClick={onClick}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          Exporting…
        </>
      ) : (
        <>
          <Download className="mr-2 size-4" aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

function AdminCentreSummaryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centers, setCenters] = useState<PerExamCentreItem[]>([]);
  const [centerId, setCenterId] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<TimetableSubjectFilter>(DEFAULT_SUBJECT_FILTER);
  const [regionFilter, setRegionFilter] = useState("");
  const [summary, setSummary] = useState<FinanceCentreSchoolSummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportBogBusy, setExportBogBusy] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);

  const [tableSearch, setTableSearch] = useState("");
  const [designationFilter, setDesignationFilter] = useState(ALL_DESIGNATIONS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
        setExamListError(null);
      } catch (e) {
        if (!cancelled) setExamListError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (examId == null) {
      setCenters([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await listExaminationCentres(examId, { subject_filter: subjectFilter });
        if (cancelled) return;
        setCenters(data.items);
        setCenterId((cur) => (cur && data.items.some((c) => c.id === cur) ? cur : ""));
      } catch {
        if (!cancelled) setCenters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, subjectFilter]);

  useEffect(() => {
    if (exams.length === 0) return;
    const sp = searchParams;
    const rawExam = sp.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) setExamId(n);
    } else {
      setExamId((cur) => (cur === null && exams.length ? exams[0]!.id : cur));
    }
    const cid = sp.get("centerId")?.trim();
    if (cid) setCenterId(cid);
    const st = sp.get("st");
    if (st === "ALL" || st === "CORE_ONLY" || st === "ELECTIVE_ONLY") setSubjectFilter(st);
    const reg = sp.get("region")?.trim() ?? "";
    if (reg && REGION_OPTIONS.some((r) => r.value === reg)) setRegionFilter(reg);
    setUrlHydrated(true);
  }, [exams, searchParams]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (centerId.trim()) p.set("centerId", centerId.trim());
    if (subjectFilter !== DEFAULT_SUBJECT_FILTER) p.set("st", subjectFilter);
    if (regionFilter) p.set("region", regionFilter);
    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [urlHydrated, examId, centerId, subjectFilter, regionFilter, pathname, router, searchParams]);

  const regionSelectOptions = useMemo(() => {
    const present = new Set(
      centers.map((c) => c.region).filter((r): r is string => Boolean(r?.trim())),
    );
    return REGION_OPTIONS.filter((r) => present.has(r.value));
  }, [centers]);

  const filteredCenters = useMemo(() => {
    if (!regionFilter) return centers;
    return centers.filter((c) => c.region === regionFilter);
  }, [centers, regionFilter]);

  useEffect(() => {
    if (!regionFilter || regionSelectOptions.length === 0) return;
    if (!regionSelectOptions.some((r) => r.value === regionFilter)) {
      setRegionFilter("");
    }
  }, [regionFilter, regionSelectOptions]);

  useEffect(() => {
    setCenterId((cur) =>
      cur && filteredCenters.some((c) => c.id === cur) ? cur : "",
    );
  }, [filteredCenters]);

  const centerOptions = useMemo(
    () =>
      filteredCenters.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
      })),
    [filteredCenters],
  );

  const fetchSummary = useCallback(async (options?: { revalidate?: boolean }) => {
    if (examId === null || !centerId.trim()) {
      setSummary(null);
      return;
    }
    setBusy(true);
    setLoadError(null);
    try {
      const result = await getCachedCentreSchoolSummary({
        examId,
        centerId: centerId.trim(),
        subject_filter: subjectFilter,
        revalidate: options?.revalidate,
        onUpdate: (data) => setSummary(data),
      });
      setSummary(result.data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load bank accounts by centre");
    } finally {
      setBusy(false);
    }
  }, [examId, centerId, subjectFilter]);

  useEffect(() => {
    if (examId === null || !centerId.trim()) {
      setSummary(null);
      return;
    }
    const cached = peekCachedCentreSchoolSummary(examId, centerId.trim(), subjectFilter);
    if (cached) setSummary(cached);
  }, [examId, centerId, subjectFilter]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  async function onExport() {
    if (examId === null || !summary || !centerId.trim()) return;
    setExportBusy(true);
    setLoadError(null);
    const filename = schoolSummaryExportFilename(
      summary.center_code,
      summary.center_name,
      subjectFilter,
    );
    try {
      await downloadFinanceCentreSchoolSummaryExport({
        examId,
        centerId: centerId.trim(),
        subject_filter: subjectFilter,
        filename,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function onExportBog() {
    if (examId === null || !summary || !centerId.trim()) return;
    setExportBogBusy(true);
    setLoadError(null);
    const filename = centreBogExportFilename(
      summary.center_code,
      summary.center_name,
      subjectFilter,
    );
    try {
      await downloadFinanceCentreSchoolSummaryBogExport({
        examId,
        centerId: centerId.trim(),
        subject_filter: subjectFilter,
        filename,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "BoG export failed");
    } finally {
      setExportBogBusy(false);
    }
  }

  const officials = summary?.officials ?? [];
  const canLoad = examId !== null && centerId.trim().length > 0;
  const initialLoading = canLoad && busy && !summary;
  const refreshing = canLoad && busy && !!summary;

  const designationOptions = useMemo(() => {
    const labels = new Set(officials.map((o) => o.designation));
    return [
      { value: ALL_DESIGNATIONS, label: "All designations" },
      ...[...labels].sort().map((d) => ({ value: d, label: d })),
    ];
  }, [officials]);

  const filteredOfficials = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    let rows = officials;
    if (designationFilter !== ALL_DESIGNATIONS) {
      rows = rows.filter((r) => r.designation === designationFilter);
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q) ||
          r.telephone_number.includes(q) ||
          r.account_number.includes(q) ||
          r.bank_name.toLowerCase().includes(q),
      );
    }
    return sortOfficials(rows, sortKey, sortDir);
  }, [officials, tableSearch, designationFilter, sortKey, sortDir]);

  const examOfficialsHref =
    examId != null && centerId.trim()
      ? `${OFFICIAL_ACCOUNTS_ADMIN_HREF}?exam=${examId}&centerId=${encodeURIComponent(centerId.trim())}`
      : OFFICIAL_ACCOUNTS_ADMIN_HREF;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const exportDisabled = !summary || !canLoad || exportBusy || exportBogBusy;
  const exportControl = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <ExportButton
        disabled={exportDisabled}
        busy={exportBusy}
        label="Export Excel"
        onClick={() => void onExport()}
      />
      <ExportButton
        disabled={exportDisabled}
        busy={exportBogBusy}
        label="Export BoG"
        onClick={() => void onExportBog()}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <OfficialAccountsPageIntro description="View official account and allowance details for one examination centre — every official recorded there, their role, invigilator days, and bank details. Use this to reconcile counts and export payment data for a single centre." />

      <div className={officialAccountsPanelClass}>
        <div className={filterToolbarClass}>
          <div className={filterToolbarSectionClass}>
            <div className={cn(filterFieldClass, "min-w-0 flex-1 sm:max-w-md")}>
              <label className={formLabelClass} htmlFor="centre-summary-exam">
                Examination
              </label>
              <select
                id="centre-summary-exam"
                className={filterSelectClass}
                value={examId ?? ""}
                onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
                disabled={exams.length === 0}
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {formatExamLabel(ex)}
                  </option>
                ))}
              </select>
            </div>
            <SubjectScopeToggle
              value={subjectFilter}
              onChange={setSubjectFilter}
              disabled={exams.length === 0}
            />
          </div>

          <div className={cn(filterToolbarSectionClass, "border-t border-border/60 pt-4")}>
            <div className={cn(filterFieldClass, "w-full sm:w-40 sm:shrink-0")}>
              <label className={formLabelClass} htmlFor="centre-summary-region">
                Region
              </label>
              <select
                id="centre-summary-region"
                className={filterSelectClass}
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                disabled={centers.length === 0 || regionSelectOptions.length === 0}
              >
                <option value="">All regions</option>
                {regionSelectOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={cn(filterFieldClass, "min-w-0 flex-1")}>
              <span className={formLabelClass}>Examination centre</span>
              <SearchableCombobox
                options={centerOptions}
                value={centerId}
                onChange={setCenterId}
                placeholder="Select centre…"
                searchPlaceholder="Code or name…"
                emptyText={
                  filteredCenters.length
                    ? "No match."
                    : regionFilter
                      ? "No centres in this region."
                      : subjectFilter !== "ALL"
                        ? "No centres for this scope."
                        : "No centres."
                }
                widthClass="w-full min-w-0"
                showAllOption={false}
                disabled={filteredCenters.length === 0}
              />
            </div>

            <div className="w-full shrink-0 sm:w-auto">{exportControl}</div>
          </div>
        </div>

        {examListError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{examListError}</p>
          </div>
        ) : null}

        {loadError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{loadError}</p>
            {canLoad ? (
              <button type="button" className={officialAccountsBtnSecondary} onClick={() => void fetchSummary()}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!canLoad ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center sm:px-5">
            <Building2 className="size-10 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-foreground">Choose an examination centre</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Pick an examination, subject scope, and centre above.
            </p>
          </div>
        ) : null}

        {initialLoading ? <SummarySkeleton /> : null}

        {summary ? (
          <div className="relative" aria-busy={refreshing}>
            {refreshing ? (
              <div className="pointer-events-none absolute inset-0 z-10 bg-background/40" aria-hidden />
            ) : null}
            <SummaryCardsRow
              summary={summary}
              examId={examId!}
              centerId={centerId.trim()}
              subjectFilter={subjectFilter}
            />

            <SubjectScopeLegend className="border-t border-border/60 px-4 py-3 sm:px-5" />

            <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-2 sm:flex-row sm:items-end sm:gap-3 sm:px-5">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <label className="sr-only" htmlFor="centre-summary-search">
                  Search officials
                </label>
                <input
                  id="centre-summary-search"
                  type="search"
                  className={formInputClass}
                  placeholder="Search officials…"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                />
              </div>
              <div className="min-w-0 flex-1 sm:max-w-[11rem]">
                <label className="sr-only" htmlFor="centre-summary-designation">
                  Designation
                </label>
                <select
                  id="centre-summary-designation"
                  className={formInputClass}
                  value={designationFilter}
                  onChange={(e) => setDesignationFilter(e.target.value)}
                >
                  {designationOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="pb-2 text-xs text-muted-foreground sm:ml-auto sm:max-w-xs sm:text-right sm:pb-2.5">
                {filteredOfficials.length} official{filteredOfficials.length === 1 ? "" : "s"}
                {busy ? " · updating…" : ""}
              </p>
            </div>

            <div className="max-h-[min(32rem,60vh)] overflow-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                  <tr className="border-b border-border/60 text-left">
                    <th
                      rowSpan={2}
                      className="w-10 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      #
                    </th>
                    <th colSpan={3} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Official
                    </th>
                    <th colSpan={4} className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Bank account
                    </th>
                    <th colSpan={2} className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact & duty
                    </th>
                    <th className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Allowance
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-3 py-2.5">
                      <button type="button" className="font-semibold hover:underline" onClick={() => toggleSort("name")}>
                        Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2.5">
                      <button
                        type="button"
                        className="font-semibold hover:underline"
                        onClick={() => toggleSort("designation")}
                      >
                        Designation {sortKey === "designation" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Scope</th>
                    <th className="border-l border-border/60 px-3 py-2.5 font-semibold">Bank</th>
                    <th className="px-3 py-2.5 font-semibold">Branch</th>
                    <th className="px-3 py-2.5 font-semibold">Code</th>
                    <th className="px-3 py-2.5 font-semibold">Account no.</th>
                    <th className="border-l border-border/60 px-3 py-2.5">
                      <button type="button" className="font-semibold hover:underline" onClick={() => toggleSort("days")}>
                        Days {sortKey === "days" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 font-semibold">Phone</th>
                    <th className="border-l border-border/60 px-3 py-2.5 font-semibold">Total allowance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {!busy && filteredOfficials.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center">
                        <p className="text-sm font-medium text-foreground">
                          {officials.length === 0
                            ? "No officials recorded for this centre"
                            : "No officials match your filters"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {officials.length === 0 ? (
                            <>
                              Account details are entered by the inspector at the centre.{" "}
                              <Link href={examOfficialsHref} className="font-medium text-primary hover:underline">
                                Open {BANK_ACCOUNTS_LABEL}
                              </Link>
                            </>
                          ) : (
                            "Try clearing search or designation filter."
                          )}
                        </p>
                      </td>
                    </tr>
                  ) : null}
                  {filteredOfficials.map((row, index) => {
                    const isInvigilator = row.designation === "Invigilator";
                    return (
                      <tr
                        key={row.id}
                        className={cn("hover:bg-muted/30", isInvigilator && "bg-success/5")}
                      >
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2 font-medium">{row.full_name}</td>
                        <td className="px-3 py-2">{row.designation}</td>
                        <td className="px-3 py-2">
                          <SubjectScopeBadge scope={row.subject_scope} />
                        </td>
                        <td className="max-w-40 truncate border-l border-border/60 px-3 py-2" title={row.bank_name}>
                          {row.bank_name}
                        </td>
                        <td className="max-w-40 truncate px-3 py-2" title={row.branch_name}>
                          {row.branch_name}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{displayBankCode(row.bank_code)}</td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">{row.account_number}</td>
                        <td
                          className={cn(
                            "border-l border-border/60 px-3 py-2 tabular-nums",
                            isInvigilator && "font-semibold",
                          )}
                        >
                          {row.num_days}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.telephone_number}</td>
                        <td className="border-l border-border/60 px-3 py-2">
                          <OfficialAllowanceBreakdownCell
                            row={row}
                            examinationId={examId}
                            officialName={row.full_name}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminCentreSummaryPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <AdminCentreSummaryContent />
    </RoleGuard>
  );
}
