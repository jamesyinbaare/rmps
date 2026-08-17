"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { WorkforcePayoutsCommandBar } from "@/components/workforce/workforce-payouts-command-bar";
import { WorkforcePayoutsTable } from "@/components/workforce/workforce-payouts-table";
import {
  downloadAdminWorkforcePayoutsBogExport,
  listAdminWorkforcePayouts,
  type Examination,
  type WorkforcePayoutRow,
} from "@/lib/api";
import {
  officialAccountsBtnSecondary,
  officialAccountsPanelClass,
  officialAccountsPayoutSegmentedClass,
} from "@/lib/official-accounts-zone";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import {
  matchesWorkforcePayoutSearch,
  sortWorkforcePayoutRows,
  sumWorkforcePayableGhs,
  workforcePayoutMissingBank,
  workforcePayoutsWithWork,
  type WorkforcePayoutBankFilter,
  type WorkforcePayoutSortDir,
  type WorkforcePayoutSortKey,
} from "@/lib/workforce-payout-rows";
import { cn } from "@/lib/utils";

type Props = {
  config: WorkforceKindConfig;
  exams: Examination[];
  formatExamLabel: (exam: Examination) => string;
};

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

function workUnitLabel(kind: WorkforceKindConfig["kind"]): string {
  return kind === "data-entry-clerk" ? "entries" : "scripts";
}

function CheckerPayoutSummary({
  payableGhs,
  missingBank,
  bankFilter,
  onBankFilterChange,
  disabled,
}: {
  payableGhs: number;
  missingBank: number;
  bankFilter: WorkforcePayoutBankFilter;
  onBankFilterChange: (value: WorkforcePayoutBankFilter) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="hidden items-baseline gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs tabular-nums md:inline-flex">
        <span className="font-medium text-success/80">GHS</span>
        <span className="font-semibold text-success">
          {payableGhs.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </p>
      <div className={officialAccountsPayoutSegmentedClass} role="group" aria-label="Bank details filter">
        {(
          [
            { value: "all", label: "All" },
            { value: "missing-bank", label: missingBank > 0 ? `Missing bank (${missingBank})` : "Missing bank" },
          ] as const
        ).map((opt) => {
          const active = bankFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled || (opt.value === "missing-bank" && missingBank === 0)}
              aria-pressed={active}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onBankFilterChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkforcePayoutsPanel({ config, exams, formatExamLabel }: Props) {
  const unit = workUnitLabel(config.kind);
  const sectionId = `wf-payout-${config.kind}`;
  const isChecker = config.kind === "script-checker";

  const [examId, setExamId] = useState<number | null>(null);
  const [items, setItems] = useState<WorkforcePayoutRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bankFilter, setBankFilter] = useState<WorkforcePayoutBankFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<WorkforcePayoutSortKey>("full_name");
  const [sortDir, setSortDir] = useState<WorkforcePayoutSortDir>("asc");

  useEffect(() => {
    if (exams.length > 0 && examId == null) setExamId(exams[0]!.id);
  }, [examId, exams]);

  const loadPayouts = useCallback(async () => {
    if (examId == null) {
      setItems([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listAdminWorkforcePayouts({
        kind: config.kind,
        examination_id: examId,
      });
      setItems(data.items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load payouts");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [config.kind, examId]);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  useEffect(() => {
    setPage(1);
    setSearchQuery("");
    setBankFilter("all");
  }, [examId]);

  const withWork = useMemo(() => workforcePayoutsWithWork(items), [items]);
  const missingBankCount = useMemo(
    () => withWork.filter(workforcePayoutMissingBank).length,
    [withWork],
  );
  const payableTotal = useMemo(() => sumWorkforcePayableGhs(withWork), [withWork]);
  const ratesUnset = withWork.length > 0 && withWork.some((row) => !row.has_rate);

  const filteredSorted = useMemo(() => {
    const scoped =
      isChecker && bankFilter === "missing-bank" ? withWork.filter(workforcePayoutMissingBank) : withWork;
    const filtered = scoped.filter((row) => matchesWorkforcePayoutSearch(row, searchQuery));
    return sortWorkforcePayoutRows(filtered, sortKey, sortDir);
  }, [isChecker, bankFilter, withWork, searchQuery, sortKey, sortDir]);

  const total = filteredSorted.length;
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, page, pageSize]);

  const ratesHref = examId != null ? `${config.adminRatesPath}?exam=${examId}` : config.adminRatesPath;
  const assignHref =
    examId != null ? `${config.adminManualAllocationPath}?exam=${examId}` : config.adminManualAllocationPath;

  const exportDisabledReason = useMemo(() => {
    if (examId == null) return "Select an examination";
    if (withWork.length === 0) {
      return isChecker ? "No allocations for this examination" : "No completed work for this examination";
    }
    return undefined;
  }, [examId, withWork.length, isChecker]);

  const exportOptions = useMemo(
    () => [
      {
        key: "bog",
        label: "BoG payment file",
        description: "Bank of Ghana format with serial numbers and grand total",
        primary: true,
      },
    ],
    [],
  );

  async function handleExport(key: string) {
    if (examId == null || key !== "bog") return;
    setExportBusy("bog");
    setLoadError(null);
    try {
      const exam = exams.find((e) => e.id === examId);
      const base = exam ? formatExamLabel(exam).replace(/[^a-zA-Z0-9_-]+/g, "_") : `exam_${examId}`;
      await downloadAdminWorkforcePayoutsBogExport({
        kind: config.kind,
        examination_id: examId,
        filename: `${config.kind.replace(/-/g, "_")}_payouts_${base}.xlsx`,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  function handleSortChange(key: WorkforcePayoutSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setPage(1);
  }

  function handleBankFilterChange(value: WorkforcePayoutBankFilter) {
    setBankFilter(value);
    setPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  const emptyLabel =
    isChecker && bankFilter === "missing-bank"
      ? "No checkers are missing bank details."
      : isChecker
        ? "No allocations for this examination yet."
        : "No completed batches for this examination yet.";
  const searchEmptyLabel = isChecker
    ? "No checkers match this search."
    : `No ${config.labelPlural.toLowerCase()} match this search.`;
  const hasActiveFilter = Boolean(searchQuery.trim()) || bankFilter === "missing-bank";

  return (
    <div className={officialAccountsPanelClass}>
      <WorkforcePayoutsCommandBar
        exams={exams}
        examId={examId}
        onExamChange={setExamId}
        formatExamLabel={formatExamLabel}
        sectionId={sectionId}
        personLabelPlural={config.labelPlural}
        searchInputId={`${sectionId}-search`}
        searchQuery={searchQuery}
        onSearchQueryChange={handleSearchChange}
        searchDisabled={loading && items.length === 0}
        exportOptions={exportOptions}
        exportDisabled={examId == null || withWork.length === 0 || !!exportBusy}
        exportDisabledReason={exportDisabledReason}
        exportBusy={exportBusy}
        onExport={(key) => void handleExport(key)}
        busy={loading}
        total={total}
        clientFilteredCount={hasActiveFilter ? total : undefined}
        hideRecordMeta={isChecker}
        aside={
          isChecker ? (
            <CheckerPayoutSummary
              payableGhs={payableTotal}
              missingBank={missingBankCount}
              bankFilter={bankFilter}
              onBankFilterChange={handleBankFilterChange}
              disabled={loading && items.length === 0}
            />
          ) : undefined
        }
      />

      {isChecker && ratesUnset ? (
        <div className="mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 sm:mx-4">
          <p className="text-sm text-amber-950 dark:text-amber-200">
            Rates for this examination are not configured yet. Payable amounts will stay at zero until they are set.
          </p>
          <Link href={ratesHref} className={cn(officialAccountsBtnSecondary, "shrink-0")}>
            Set rates
          </Link>
        </div>
      ) : null}

      {loadError ? (
        <div className="mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 sm:mx-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <button type="button" className={officialAccountsBtnSecondary} onClick={() => void loadPayouts()}>
            Retry
          </button>
        </div>
      ) : null}

      <WorkforcePayoutsTable
        items={pageItems}
        busy={loading}
        emptyLabel={emptyLabel}
        searchEmptyLabel={searchEmptyLabel}
        emptyActionHref={isChecker && !hasActiveFilter ? assignHref : undefined}
        emptyActionLabel={isChecker && !hasActiveFilter ? "Assign scripts" : undefined}
        unitLabel={unit}
        kind={config.kind}
        ratesHref={ratesHref}
        page={page}
        total={total}
        pageSize={pageSize}
        pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
        searchQuery={searchQuery}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        clientFilteredCount={hasActiveFilter ? total : undefined}
        pageScroll
      />
    </div>
  );
}
