"use client";

import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  MinusCircle,
  UserCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AssignedInspectorsBreakdown } from "@/components/centre-assigned-inspectors";
import {
  CentreSummaryDetailModal,
  CentreSummaryModalEmpty,
  CentreSummaryModalLoading,
  CentreSummaryModalPanel,
} from "@/components/centre-summary-detail-modal";
import {
  getCachedCentreInvigilatorDays,
  peekCachedCentreInvigilatorDays,
} from "@/lib/finance-statistics-cache";
import type {
  AssignedInspectorAtCentre,
  FinanceCentreDayInvigilatorRow,
  FinanceCentreSchoolSummaryResponse,
  TimetableSubjectFilter,
} from "@/lib/api";
import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type InvigilationTone = "over" | "match" | "under";

function invigilationTone(declared: number, expected: number): InvigilationTone {
  if (declared > expected) return "over";
  if (declared < expected) return "under";
  return "match";
}

function invigilatorTheme(tone: InvigilationTone) {
  switch (tone) {
    case "over":
      return {
        card: "border-destructive/35 bg-gradient-to-br from-destructive/[0.05] via-card to-card",
        bar: "bg-destructive",
        declared: "text-destructive",
        badge: "bg-destructive/15 text-destructive",
        Icon: AlertCircle,
        badgeText: "Over",
        variance: "text-destructive",
        modalAccent: "from-destructive/12 via-card to-card",
        icon: "bg-destructive/10 text-destructive",
      };
    case "match":
      return {
        card: "border-success/35 bg-gradient-to-br from-success/[0.05] via-card to-card",
        bar: "bg-success",
        declared: "text-success",
        badge: "bg-success/15 text-success",
        Icon: CheckCircle2,
        badgeText: "Match",
        variance: "text-success",
        modalAccent: "from-success/12 via-card to-card",
        icon: "bg-success/10 text-success",
      };
    case "under":
      return {
        card: "border-amber-500/35 bg-gradient-to-br from-amber-500/[0.05] via-card to-card dark:border-amber-400/35",
        bar: "bg-amber-500 dark:bg-amber-400",
        declared: "text-amber-700 dark:text-amber-400",
        badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        Icon: MinusCircle,
        badgeText: "Short",
        variance: "text-amber-700 dark:text-amber-400",
        modalAccent: "from-amber-500/12 via-card to-card",
        icon: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      };
  }
}

function varianceDetail(variance: number): string {
  if (variance === 0) return "0 difference";
  if (variance > 0) return `+${variance} over`;
  return `${Math.abs(variance)} short`;
}

function subjectScopeLabel(filter: TimetableSubjectFilter): string {
  if (filter === "CORE_ONLY") return "Core";
  if (filter === "ELECTIVE_ONLY") return "Elective";
  return "All";
}

function formatExamDayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DetailActionTile({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof CalendarDays;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-left shadow-sm transition-colors hover:border-border hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </button>
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
  theme,
}: {
  open: boolean;
  onClose: () => void;
  centreLabel: string;
  subjectFilter: TimetableSubjectFilter;
  days: FinanceCentreDayInvigilatorRow[] | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  theme: ReturnType<typeof invigilatorTheme>;
}) {
  const dayTotal = days?.reduce((s, d) => s + d.invigilators_required, 0) ?? null;
  const candidateTotal = days?.reduce((s, d) => s + d.unique_candidates, 0) ?? null;

  return (
    <CentreSummaryDetailModal
      open={open}
      onClose={onClose}
      title="Expected by exam day"
      centreLabel={centreLabel}
      scopeLabel={subjectScopeLabel(subjectFilter)}
      icon={CalendarDays}
      iconClassName={theme.icon}
      headerAccentClassName={theme.modalAccent}
      footer={
        dayTotal != null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Total expected</span>
            <span className="font-semibold tabular-nums text-foreground">{dayTotal}</span>
          </div>
        ) : null
      }
    >
      {loading ? <CentreSummaryModalLoading message="Loading…" /> : null}
      {loadError ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <button type="button" className={officialAccountsBtnSecondary} onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !loadError && days?.length === 0 ? (
        <CentreSummaryModalEmpty message="No examination dates in scope for this centre." />
      ) : null}
      {!loading && !loadError && days && days.length > 0 ? (
        <CentreSummaryModalPanel>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 text-right font-semibold tabular-nums">Cand.</th>
                <th className="px-3 py-2 text-right font-semibold tabular-nums">Req.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {days.map((d) => (
                <tr key={d.examination_date} className="hover:bg-muted/25">
                  <td className="px-3 py-2 text-foreground">{formatExamDayLabel(d.examination_date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {d.unique_candidates}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                    {d.invigilators_required}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidateTotal != null ? (
            <p className="border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
              {candidateTotal.toLocaleString()} candidates · {days.length} day{days.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </CentreSummaryModalPanel>
      ) : null}
    </CentreSummaryDetailModal>
  );
}

function ExpectedByDayBreakdown({
  examId,
  centerId,
  subjectFilter,
  centreLabel,
  theme,
}: {
  examId: number;
  centerId: string;
  subjectFilter: TimetableSubjectFilter;
  centreLabel: string;
  theme: ReturnType<typeof invigilatorTheme>;
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
      <DetailActionTile
        icon={CalendarDays}
        label="By exam day"
        hint="Daily expected count"
        onClick={() => setOpen(true)}
      />
      <ExpectedByDayModal
        open={open}
        onClose={() => setOpen(false)}
        centreLabel={centreLabel}
        subjectFilter={subjectFilter}
        days={days}
        loading={loading}
        loadError={loadError}
        onRetry={() => void loadDays({ revalidate: true })}
        theme={theme}
      />
    </>
  );
}

type CardProps = {
  summary: FinanceCentreSchoolSummaryResponse;
  examId: number;
  centerId: string;
  subjectFilter: TimetableSubjectFilter;
  refreshing?: boolean;
  assignedInspectors: AssignedInspectorAtCentre[];
  inspectorsRefreshing?: boolean;
};

export function InvigilatorSummaryCard({
  summary,
  examId,
  centerId,
  subjectFilter,
  assignedInspectors,
  inspectorsRefreshing = false,
}: CardProps) {
  const declared = summary.invigilator_days_declared;
  const expected = summary.expected_invigilations_total;
  const tone = invigilationTone(declared, expected);
  const theme = invigilatorTheme(tone);
  const StatusIcon = theme.Icon;
  const centreLabel = `${summary.center_code} — ${summary.center_name}`;
  const progressPct =
    expected > 0 ? Math.min(100, Math.round((declared / expected) * 100)) : 0;
  const barWidth = tone === "over" ? 100 : progressPct;

  return (
    <div
      className={cn(
        "flex h-full min-h-36 flex-col gap-3 rounded-xl border p-4 sm:p-5 lg:min-h-[10.5rem]",
        "bg-card shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
        theme.card,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Invigilator days
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{subjectScopeLabel(subjectFilter)} scope</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            theme.badge,
          )}
        >
          <StatusIcon className="size-3" aria-hidden />
          {theme.badgeText}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/50 bg-background/50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Declared</p>
          <p className={cn("mt-0.5 text-2xl font-bold tabular-nums leading-none", theme.declared)}>{declared}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Expected</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">{expected}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className={cn("font-medium", theme.variance)}>{varianceDetail(summary.variance)}</span>
          {expected > 0 ? (
            <span className="tabular-nums text-muted-foreground">
              {declared}/{expected}
            </span>
          ) : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted/80" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", theme.bar)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      <div className="mt-auto flex gap-2">
        <ExpectedByDayBreakdown
          examId={examId}
          centerId={centerId}
          subjectFilter={subjectFilter}
          centreLabel={centreLabel}
          theme={theme}
        />
        <AssignedInspectorsBreakdown
          key={subjectFilter}
          variant="tile"
          icon={UserCheck}
          label="Inspectors"
          hint={`${assignedInspectors.length} assigned`}
          inspectors={assignedInspectors}
          centreLabel={centreLabel}
          subjectFilter={subjectFilter}
          refreshing={inspectorsRefreshing}
          theme={theme}
        />
      </div>
    </div>
  );
}
