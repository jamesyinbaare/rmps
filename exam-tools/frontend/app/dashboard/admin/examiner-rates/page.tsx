"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";

import { ExaminerRatesExamModal } from "@/components/examiner-rates-exam-modal";
import { ExaminerRatesFormulaCallout } from "@/components/examiner-rates-formula-callout";
import { RoleGuard } from "@/components/role-guard";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import {
  apiJson,
  getExaminationExaminerMarkingRates,
  getExaminationExaminerRoleAllowanceRates,
  getExaminationExaminerTravelRates,
  type Examination,
} from "@/lib/api";
import {
  examinerRatesConfigStatus,
  formatExamLabel,
  markingRatesFromApi,
  roleRatesFromApi,
  travelRatesFromApi,
  type ExamRatesConfigStatus,
} from "@/lib/examiner-rates-draft";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsPanelClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const STATUS_FETCH_CONCURRENCY = 4;

type ExamRatesSummary = {
  status: ExamRatesConfigStatus;
  configuredRoleCells: number;
  totalRoleCells: number;
  markingConfigured: number;
  markingTotal: number;
  travelConfigured: number;
};

function StatusBadge({ summary, loading }: { summary: ExamRatesSummary | undefined; loading: boolean }) {
  if (loading || !summary || summary.status === "unknown") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Loading…
      </span>
    );
  }
  if (summary.status === "complete") {
    return (
      <span className="inline-flex rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
        Complete
      </span>
    );
  }
  if (summary.status === "partial") {
    return (
      <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
        {summary.configuredRoleCells}/{summary.totalRoleCells} role · {summary.markingConfigured}/{summary.markingTotal} marking · {summary.travelConfigured}/16 T&amp;T
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Not set up
    </span>
  );
}

async function fetchExamRatesSummary(examId: number): Promise<ExamRatesSummary> {
  const [roleData, markingData, travelData] = await Promise.all([
    getExaminationExaminerRoleAllowanceRates(examId),
    getExaminationExaminerMarkingRates(examId),
    getExaminationExaminerTravelRates(examId),
  ]);
  const roleDraft = roleRatesFromApi(roleData);
  const markingDraft = markingRatesFromApi(markingData);
  const travelDraft = travelRatesFromApi(travelData);
  const { status, configuredRoleCells, totalRoleCells, markingConfigured, markingTotal, travelConfigured } =
    examinerRatesConfigStatus(roleDraft, markingDraft, travelDraft, markingData.items.length);
  return { status, configuredRoleCells, totalRoleCells, markingConfigured, markingTotal, travelConfigured };
}

async function fetchSummariesWithConcurrency(
  examIds: number[],
  concurrency: number,
  onResult: (examId: number, summary: ExamRatesSummary) => void,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < examIds.length) {
      const i = index++;
      const id = examIds[i]!;
      try {
        const summary = await fetchExamRatesSummary(id);
        onResult(id, summary);
      } catch {
        onResult(id, {
          status: "unknown",
          configuredRoleCells: 0,
          totalRoleCells: 0,
          markingConfigured: 0,
          markingTotal: 0,
          travelConfigured: 0,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, examIds.length) }, () => worker()));
}

function ExaminerRatesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [summaries, setSummaries] = useState<Record<number, ExamRatesSummary>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const selectedExamId = useMemo(() => {
    const raw = searchParams.get("exam");
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const selectedExam = useMemo(
    () => (selectedExamId != null ? exams.find((e) => e.id === selectedExamId) ?? null : null),
    [exams, selectedExamId],
  );

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter((e) => formatExamLabel(e).toLowerCase().includes(q) || String(e.id).includes(q));
  }, [exams, search]);

  const loadExams = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiJson<Examination[]>("/examinations");
      setExams(data);
      setSummariesLoading(true);
      await fetchSummariesWithConcurrency(
        data.map((e) => e.id),
        STATUS_FETCH_CONCURRENCY,
        (examId, summary) => setSummaries((prev) => ({ ...prev, [examId]: summary })),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We could not load examinations.");
    } finally {
      setSummariesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  function openExam(examId: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("exam", String(examId));
    router.push(`${pathname}?${p.toString()}`);
  }

  function closeModal() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("exam");
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  async function handleSaved() {
    if (selectedExamId != null) {
      try {
        const summary = await fetchExamRatesSummary(selectedExamId);
        setSummaries((prev) => ({ ...prev, [selectedExamId]: summary }));
      } catch {
        /* ignore refresh failure */
      }
    }
  }

  return (
    <div className="space-y-4">
      <OfficialAccountsPageIntro
        description="Set flat role allowances, per-subject marking rates, and regional T & T for each examination."
        footerNote={<ExaminerRatesFormulaCallout />}
      />

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <div className={cn(officialAccountsPanelClass, "p-4 sm:p-5")}>
        <div className="mb-4 max-w-md">
          <label className={formLabelClass} htmlFor="examiner-rates-search">
            Search examinations
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="examiner-rates-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(formInputClass, "pl-9")}
              placeholder="Year, series, or exam id"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2.5 font-semibold">Examination</th>
                <th className="px-3 py-2.5 font-semibold">ID</th>
                <th className="px-3 py-2.5 font-semibold">Config</th>
                <th className="px-3 py-2.5 font-semibold" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredExams.map((exam) => (
                <tr key={exam.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-3 font-medium">{formatExamLabel(exam)}</td>
                  <td className="px-3 py-3 tabular-nums text-muted-foreground">#{exam.id}</td>
                  <td className="px-3 py-3">
                    <StatusBadge summary={summaries[exam.id]} loading={summariesLoading && !summaries[exam.id]} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openExam(exam.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      Configure
                      <ChevronRight className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedExam ? (
        <ExaminerRatesExamModal
          exam={selectedExam}
          allExams={exams}
          onClose={closeModal}
          onSaved={() => void handleSaved()}
        />
      ) : null}
    </div>
  );
}

export default function ExaminerRatesPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <ExaminerRatesContent />
    </RoleGuard>
  );
}
