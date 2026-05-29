"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";

import { OfficialRatesExamModal } from "@/components/official-rates-exam-modal";
import { OfficialRatesFormulaCallout } from "@/components/official-rates-formula-callout";
import { RoleGuard } from "@/components/role-guard";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { apiJson, getExaminationDesignationRates, type Examination } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  formatExamLabel,
  ratesConfigStatusFromRows,
  rowToDraft,
  type ExamRatesConfigStatus,
} from "@/lib/official-rates-draft";
import { officialAccountsPanelClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const STATUS_FETCH_CONCURRENCY = 4;

type ExamRatesSummary = {
  status: ExamRatesConfigStatus;
  configured: number;
  total: number;
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
        {summary.configured} of {summary.total} roles priced
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
  const data = await getExaminationDesignationRates(examId);
  const rows = data.items.map(rowToDraft);
  return {
    status: ratesConfigStatusFromRows(rows),
    configured: rows.filter((r) => r.daily_rate_ghs.trim()).length,
    total: rows.length,
  };
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
        onResult(id, { status: "unknown", configured: 0, total: 6 });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, examIds.length) }, () => worker()));
}

function OfficialRatesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [summaries, setSummaries] = useState<Record<number, ExamRatesSummary>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalExamId, setModalExamId] = useState<number | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "We could not load the exam list. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0) return;
    const raw = searchParams.get("exam");
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) {
        setModalExamId(n);
      }
    }
    setUrlHydrated(true);
  }, [exams, searchParams]);

  const refreshSummaries = useCallback(async (examList: Examination[]) => {
    if (examList.length === 0) return;
    setSummariesLoading(true);
    const ids = examList.map((e) => e.id);
    await fetchSummariesWithConcurrency(ids, STATUS_FETCH_CONCURRENCY, (id, summary) => {
      setSummaries((prev) => ({ ...prev, [id]: summary }));
    });
    setSummariesLoading(false);
  }, []);

  useEffect(() => {
    if (exams.length === 0) return;
    void refreshSummaries(exams);
  }, [exams, refreshSummaries]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (modalExamId != null) p.set("exam", String(modalExamId));
    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [urlHydrated, modalExamId, pathname, router, searchParams]);

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...exams].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return formatExamLabel(a).localeCompare(formatExamLabel(b));
    });
    if (!q) return sorted;
    return sorted.filter((ex) => formatExamLabel(ex).toLowerCase().includes(q));
  }, [exams, search]);

  const modalExam = useMemo(
    () => (modalExamId != null ? exams.find((e) => e.id === modalExamId) ?? null : null),
    [exams, modalExamId],
  );

  function openExam(examId: number) {
    setModalExamId(examId);
  }

  function closeModal() {
    setModalExamId(null);
  }

  function onRatesSaved() {
    if (modalExamId != null) {
      void fetchExamRatesSummary(modalExamId).then((summary) => {
        setSummaries((prev) => ({ ...prev, [modalExamId]: summary }));
      });
    }
  }

  return (
    <div className="space-y-6">
      <OfficialAccountsPageIntro
        description="Set how much each role is paid for an examination—daily pay, commuting, and airtime. Choose an exam below to view or update its rates."
        footerNote={<OfficialRatesFormulaCallout />}
      />

      <div className={officialAccountsPanelClass}>
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <label className={formLabelClass} htmlFor="official-rates-search">
            Find an examination
          </label>
          <div className="relative mt-1.5 max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="official-rates-search"
              type="search"
              className={cn(formInputClass, "pl-9")}
              placeholder="Search by name or year…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Select an exam to view or change its allowance amounts.
          </p>
        </div>

        {loadError ? (
          <p className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-5">
            {loadError}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col />
              <col className="w-[11rem]" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-4 py-2.5 font-semibold sm:px-5">Examination</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Allowances</th>
                <th className="px-2 py-2.5 sm:px-3" aria-hidden>
                  <span className="sr-only">View rates</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {exams.length === 0 && !loadError ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5">
                    No examinations to show.
                  </td>
                </tr>
              ) : null}
              {filteredExams.length === 0 && exams.length > 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-5">
                    Nothing matched your search. Try different words.
                  </td>
                </tr>
              ) : null}
              {filteredExams.map((exam) => {
                const summary = summaries[exam.id];
                const loading = summariesLoading && summary === undefined;
                const label = formatExamLabel(exam);
                return (
                  <tr
                    key={exam.id}
                    role="button"
                    tabIndex={0}
                    className="group cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
                    onClick={() => openExam(exam.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openExam(exam.id);
                      }
                    }}
                    aria-label={`${label}, ${loading ? "loading allowance status" : summary?.status === "complete" ? "allowances complete" : summary?.status === "partial" ? `${summary.configured} of ${summary.total} roles priced` : "allowances not set up"}`}
                  >
                    <td className="px-4 py-3 align-middle font-medium text-foreground sm:px-5">
                      {label}
                    </td>
                    <td className="px-4 py-3 align-middle sm:px-5">
                      <StatusBadge summary={summary} loading={loading} />
                    </td>
                    <td className="px-2 py-3 align-middle text-center sm:px-3">
                      <ChevronRight
                        className="mx-auto size-4 text-muted-foreground group-hover:text-foreground"
                        aria-hidden
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:px-5">
          {filteredExams.length} examination{filteredExams.length === 1 ? "" : "s"}
          {search.trim() ? " match your search" : ""}. &ldquo;Complete&rdquo; means every role has a daily rate.
        </p>
      </div>

      {modalExam ? (
        <OfficialRatesExamModal
          exam={modalExam}
          allExams={exams}
          onClose={closeModal}
          onSaved={onRatesSaved}
        />
      ) : null}
    </div>
  );
}

export default function OfficialRatesPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <OfficialRatesContent />
    </RoleGuard>
  );
}
