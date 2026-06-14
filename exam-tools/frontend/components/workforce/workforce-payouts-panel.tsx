"use client";

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
} from "@/lib/official-accounts-zone";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import {
  matchesWorkforcePayoutSearch,
  sortWorkforcePayoutRows,
  workforcePayoutsWithWork,
  type WorkforcePayoutSortDir,
  type WorkforcePayoutSortKey,
} from "@/lib/workforce-payout-rows";

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

export function WorkforcePayoutsPanel({ config, exams, formatExamLabel }: Props) {
  const unit = workUnitLabel(config.kind);
  const sectionId = `wf-payout-${config.kind}`;

  const [examId, setExamId] = useState<number | null>(null);
  const [items, setItems] = useState<WorkforcePayoutRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  }, [examId]);

  const withWork = useMemo(() => workforcePayoutsWithWork(items), [items]);

  const filteredSorted = useMemo(() => {
    const filtered = withWork.filter((row) => matchesWorkforcePayoutSearch(row, searchQuery));
    return sortWorkforcePayoutRows(filtered, sortKey, sortDir);
  }, [withWork, searchQuery, sortKey, sortDir]);

  const total = filteredSorted.length;
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, page, pageSize]);

  const ratesHref = examId != null ? `${config.adminRatesPath}?exam=${examId}` : config.adminRatesPath;

  const exportDisabledReason = useMemo(() => {
    if (examId == null) return "Select an examination";
    if (withWork.length === 0) return "No completed work for this examination";
    return undefined;
  }, [examId, withWork.length]);

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

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  const emptyLabel = `No completed batches for this examination yet.`;

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
        clientFilteredCount={searchQuery.trim() ? total : undefined}
      />

      {loadError ? (
        <div className="mx-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 sm:mx-4">
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
        unitLabel={unit}
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
        clientFilteredCount={searchQuery.trim() ? total : undefined}
        pageScroll
      />
    </div>
  );
}
