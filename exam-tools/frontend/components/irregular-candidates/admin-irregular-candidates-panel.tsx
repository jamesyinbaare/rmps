"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Ticket,
  UserRound,
  X,
} from "lucide-react";

import { DataTable } from "@/components/data-table";
import { ExaminersSelectionBar } from "@/components/examiners/toolbar/examiners-selection-bar";
import { OfficialAccountsExportMenu } from "@/components/official-accounts-export-menu";
import { OfficialAccountsFilterChips } from "@/components/official-accounts-filter-chips";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { OfficialAccountsPanelHeader } from "@/components/official-accounts-panel-header";
import { OfficialModal } from "@/components/official-modal";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  downloadAdminIrregularCandidatePdf,
  downloadAdminIrregularCandidatePhotograph,
  downloadAdminIrregularCandidateVoucher,
  downloadAdminIrregularCandidatesExcel,
  downloadAdminIrregularCandidatesPdf,
  fetchAdminIrregularCandidateImageObjectUrl,
  listAdminIrregularCandidates,
  type IrregularCandidate,
} from "@/lib/api";
import {
  officialAccountsBtnPrimaryToolbar,
  officialAccountsBtnSecondaryToolbar,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarRowClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

function candidateDisplayName(c: IrregularCandidate): string {
  return [c.first_name, c.other_name, c.last_name].filter(Boolean).join(" ");
}

function formatDateOfBirth(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRecordedAt(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm leading-snug text-foreground">{display}</dd>
    </div>
  );
}

type ImagePreviewKind = "photograph" | "voucher";

type Props = {
  examId: number;
  examType?: string | null;
  examSeries?: string | null;
  examYear?: number | null;
  /** When false, omit the outer panel chrome (rarely used). */
  framed?: boolean;
  /** Standalone page owns OfficialAccountsPageIntro; exam detail keeps a compact header. */
  showIntro?: boolean;
  className?: string;
};

export function AdminIrregularCandidatesPanel({
  examId,
  examType,
  examSeries,
  examYear,
  framed = true,
  showIntro = true,
  className,
}: Props) {
  const [items, setItems] = useState<IrregularCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [centreId, setCentreId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [exportBusy, setExportBusy] = useState<string | null>(null);

  const [previewCandidate, setPreviewCandidate] = useState<IrregularCandidate | null>(null);
  const [modalError, setModalError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    kind: ImagePreviewKind;
    url: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);

  const exportBasename = useMemo(() => {
    const series = examSeries ? `_${examSeries}` : "";
    const raw = `irregular_candidates_${examType ?? "exam"}_${examYear ?? examId}${series}`;
    return raw.replace(/[^\w.\-]+/g, "_");
  }, [examId, examSeries, examType, examYear]);

  const load = useCallback(async () => {
    if (!Number.isFinite(examId)) return;
    setLoading(true);
    setError("");
    try {
      const response = await listAdminIrregularCandidates(examId, {
        skip: 0,
        limit: 500,
      });
      setItems(response.items);
      setTotal(response.total);
      setRowSelection({});
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Failed to load irregular candidates");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    setRowSelection({});
  }, [centreId, debouncedQuery]);

  useEffect(() => {
    if (!previewCandidate) {
      setPhotoUrl(null);
      setVoucherUrl(null);
      setModalError("");
      return;
    }
    let cancelled = false;
    const photoObjectUrlRef = { current: null as string | null };
    const voucherObjectUrlRef = { current: null as string | null };
    setImagesLoading(true);
    setPhotoUrl(null);
    setVoucherUrl(null);
    setModalError("");
    void (async () => {
      try {
        const [photo, voucher] = await Promise.all([
          fetchAdminIrregularCandidateImageObjectUrl(examId, previewCandidate.id, "photograph").catch(
            () => null,
          ),
          fetchAdminIrregularCandidateImageObjectUrl(examId, previewCandidate.id, "voucher").catch(
            () => null,
          ),
        ]);
        if (cancelled) {
          if (photo) URL.revokeObjectURL(photo);
          if (voucher) URL.revokeObjectURL(voucher);
          return;
        }
        photoObjectUrlRef.current = photo;
        voucherObjectUrlRef.current = voucher;
        setPhotoUrl(photo);
        setVoucherUrl(voucher);
      } finally {
        if (!cancelled) setImagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (photoObjectUrlRef.current) URL.revokeObjectURL(photoObjectUrlRef.current);
      if (voucherObjectUrlRef.current) URL.revokeObjectURL(voucherObjectUrlRef.current);
    };
  }, [examId, previewCandidate]);

  const centreOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of items) {
      if (!c.examination_centre_id) continue;
      map.set(
        c.examination_centre_id,
        `${c.examination_centre_code} — ${c.examination_centre_name}`,
      );
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    return items.filter((c) => {
      if (centreId.trim() && c.examination_centre_id !== centreId) return false;
      if (!q) return true;
      const name = candidateDisplayName(c).toLowerCase();
      return name.includes(q) || c.phone_number.toLowerCase().includes(q);
    });
  }, [centreId, debouncedQuery, items]);

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([id]) => Number(id))
        .filter((id) => Number.isFinite(id)),
    [rowSelection],
  );

  const centreCountInFilter = useMemo(() => {
    const set = new Set(filteredItems.map((c) => c.examination_centre_id));
    return set.size;
  }, [filteredItems]);

  const filterOptions = useMemo(
    () => ({
      q: debouncedQuery || null,
      centreId: centreId.trim() || null,
    }),
    [centreId, debouncedQuery],
  );

  const pdfExportHint =
    !centreId.trim() && centreCountInFilter > 1
      ? "All centres: zip with one PDF per centre"
      : "Detail PDF with photograph and voucher";

  const columns = useMemo<ColumnDef<IrregularCandidate>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all rows on this page"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select ${candidateDisplayName(row.original)}`}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        meta: { cellClassName: "w-10 px-3 py-2.5" },
      },
      {
        id: "name",
        accessorFn: (row) => candidateDisplayName(row),
        header: "Name",
        cell: ({ getValue }) => <span className="font-medium text-foreground">{getValue<string>()}</span>,
        meta: { cellClassName: "px-3 py-2.5" },
      },
      {
        id: "centre",
        accessorFn: (row) => `${row.examination_centre_code} ${row.examination_centre_name}`,
        header: "Centre",
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="font-mono text-xs">{row.original.examination_centre_code}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {row.original.examination_centre_name}
            </span>
          </span>
        ),
        meta: { cellClassName: "px-3 py-2.5 max-w-[12rem]" },
      },
      {
        accessorKey: "phone_number",
        header: "Phone",
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
        meta: { cellClassName: "px-3 py-2.5" },
      },
      {
        id: "programme",
        accessorFn: (row) => `${row.programme_code} ${row.programme_name}`,
        header: "Programme",
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="font-mono text-xs">{row.original.programme_code}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {row.original.programme_name}
            </span>
          </span>
        ),
        meta: { cellClassName: "px-3 py-2.5 max-w-[14rem]" },
      },
      {
        id: "created_at",
        accessorFn: (row) => row.created_at,
        header: "Recorded",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {formatRecordedAt(getValue<string>()) || "—"}
          </span>
        ),
        meta: { cellClassName: "px-3 py-2.5 whitespace-nowrap" },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting, rowSelection, pagination },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
  });

  const pageRows = table.getRowModel().rows;

  const navList = table.getSortedRowModel().rows.map((r) => r.original);

  const previewNavIndex = useMemo(() => {
    if (!previewCandidate) return -1;
    return navList.findIndex((c) => c.id === previewCandidate.id);
  }, [navList, previewCandidate]);

  const canGoPrev = previewNavIndex > 0;
  const canGoNext = previewNavIndex >= 0 && previewNavIndex < navList.length - 1;
  const showPreviewNav = previewCandidate != null && navList.length > 1 && previewNavIndex >= 0;

  const goPrevCandidate = useCallback(() => {
    if (!canGoPrev) return;
    setImagePreview(null);
    setPreviewCandidate(navList[previewNavIndex - 1]);
  }, [canGoPrev, navList, previewNavIndex]);

  const goNextCandidate = useCallback(() => {
    if (!canGoNext) return;
    setImagePreview(null);
    setPreviewCandidate(navList[previewNavIndex + 1]);
  }, [canGoNext, navList, previewNavIndex]);

  useEffect(() => {
    if (!previewCandidate || !showPreviewNav) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevCandidate();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNextCandidate();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewCandidate, showPreviewNav, goPrevCandidate, goNextCandidate]);

  const runExcelExport = async (mode: "filtered" | "selected") => {
    setExportBusy(mode === "selected" ? "selection:excel" : "irr:excel");
    setError("");
    try {
      await downloadAdminIrregularCandidatesExcel(
        examId,
        {
          ...filterOptions,
          ids: mode === "selected" ? selectedIds : null,
        },
        `${exportBasename}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download Excel");
    } finally {
      setExportBusy(null);
    }
  };

  const runPdfExport = async (mode: "filtered" | "selected") => {
    setExportBusy(mode === "selected" ? "selection:pdf" : "irr:pdf");
    setError("");
    try {
      await downloadAdminIrregularCandidatesPdf(
        examId,
        {
          ...filterOptions,
          ids: mode === "selected" ? selectedIds : null,
        },
        `${exportBasename}.pdf`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setExportBusy(null);
    }
  };

  const safeDownload = async (action: () => Promise<void>, fallback: string) => {
    setModalError("");
    try {
      await action();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : fallback);
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setCentreId("");
  };

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onRemove: () => void }[] = [];
    if (debouncedQuery) {
      chips.push({
        id: "q",
        label: `Search: ${debouncedQuery}`,
        onRemove: () => {
          setSearchInput("");
          setDebouncedQuery("");
        },
      });
    }
    if (centreId) {
      const label = centreOptions.find((o) => o.value === centreId)?.label ?? centreId;
      chips.push({
        id: "centre",
        label: `Centre: ${label}`,
        onRemove: () => setCentreId(""),
      });
    }
    return chips;
  }, [centreId, centreOptions, debouncedQuery]);

  const busy = loading || !!exportBusy;
  const showLoading = loading && items.length === 0;
  const noneRecorded = !loading && items.length === 0 && !error;
  const noFilterMatch = !loading && items.length > 0 && filteredItems.length === 0;

  const closePreview = () => {
    setPreviewCandidate(null);
    setImagePreview(null);
    setModalError("");
  };

  const body = (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {showIntro ? (
        <OfficialAccountsPanelHeader
          title="Irregular candidates"
          count={filteredItems.length}
          busy={loading}
        />
      ) : null}

      <div
        className={cn(
          officialAccountsCommandBarClass,
          "sticky top-0 z-10 gap-3 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/40",
        )}
      >
        <div className={cn(officialAccountsCommandBarRowClass, "gap-2 sm:gap-3")}>
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="admin-irr-q"
              type="search"
              className={cn(officialAccountsCommandBarSearchClass, "pl-9 pr-9")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or phone…"
              autoComplete="off"
              spellCheck={false}
            />
            {searchInput ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
                onClick={() => {
                  setSearchInput("");
                  setDebouncedQuery("");
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <SearchableCombobox
            id="admin-irr-centre"
            options={centreOptions}
            value={centreId}
            onChange={setCentreId}
            placeholder="All centres"
            searchPlaceholder="Search centres…"
            emptyText="No centres match."
            allOptionLabel="All centres"
            widthClass="w-full min-w-[12rem] sm:w-[16rem]"
            truncateTrigger
            triggerClassName="h-10 min-h-10"
            disabled={busy && centreOptions.length === 0}
          />

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <OfficialAccountsExportMenu
              toolbar
              hideSummary
              sectionId="irr"
              recordCount={filteredItems.length}
              centreCount={centreCountInFilter || null}
              disabled={busy || filteredItems.length === 0}
              disabledReason="No candidates to export"
              exportBusy={exportBusy}
              footnote={pdfExportHint}
              options={[
                { key: "excel", label: "Download Excel", primary: true },
                {
                  key: "pdf",
                  label: "Download PDF",
                  description: pdfExportHint,
                },
              ]}
              onExport={(key) => {
                if (key === "excel") void runExcelExport("filtered");
                if (key === "pdf") void runPdfExport("filtered");
              }}
            />
            <button
              type="button"
              className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex gap-1.5")}
              disabled={busy}
              onClick={() => void load()}
              aria-label="Refresh"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              <span className="sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <OfficialAccountsFilterChips
          variant="inline"
          chips={filterChips}
          onClearAll={clearFilters}
        />
      </div>

      {error ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive sm:px-5" role="alert">
          {error}
        </p>
      ) : null}

      <ExaminersSelectionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setRowSelection({})}
        disabled={busy}
        className="mx-4 mt-3 sm:mx-5"
      >
        <button
          type="button"
          className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex min-h-9 gap-1.5 px-3 text-xs")}
          disabled={busy}
          onClick={() => void runExcelExport("selected")}
        >
          {exportBusy === "selection:excel" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="size-3.5" aria-hidden />
          )}
          Excel
        </button>
        <button
          type="button"
          className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex min-h-9 gap-1.5 px-3 text-xs")}
          disabled={busy}
          onClick={() => void runPdfExport("selected")}
        >
          {exportBusy === "selection:pdf" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <FileText className="size-3.5" aria-hidden />
          )}
          PDF
        </button>
      </ExaminersSelectionBar>

      <div className="relative min-w-0">
        {showLoading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            Loading irregular candidates…
          </div>
        ) : noneRecorded ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-6" aria-hidden />
            </span>
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium text-foreground">
                No irregular candidates recorded for this examination
              </p>
              <p className="text-sm text-muted-foreground">
                When inspectors register irregular candidates, they will appear here for preview and
                export.
              </p>
            </div>
          </div>
        ) : noFilterMatch ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium text-foreground">No candidates match these filters</p>
              <p className="text-sm text-muted-foreground">
                Try another name, phone, or centre — or clear filters to see everyone.
              </p>
            </div>
            <button
              type="button"
              className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex gap-1.5")}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className={cn("hidden md:block", loading && "opacity-60 transition-opacity")}>
              <DataTable
                table={table}
                striped
                stickyHeader
                className="rounded-none border-0"
                emptyMessage="No irregular candidates recorded yet."
                onRowClick={(row) => setPreviewCandidate(row)}
              />
            </div>

            <ul className={cn("divide-y divide-border md:hidden", loading && "opacity-60")}>
              {pageRows.map((row) => {
                const c = row.original;
                const name = candidateDisplayName(c);
                return (
                  <li key={c.id}>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 rounded border-border"
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        aria-label={`Select ${name}`}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setPreviewCandidate(c)}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                          {c.examination_centre_code}
                          <span className="text-border"> · </span>
                          {c.phone_number}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRecordedAt(c.created_at) || "—"}
                        </p>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {!showLoading && filteredItems.length > 0 ? (
        <OfficialAccountsPagination
          page={pagination.pageIndex + 1}
          pageSize={pagination.pageSize}
          total={filteredItems.length}
          busy={busy}
          pageSizeOptions={[10, 25, 50, 100]}
          recordLabel="candidate"
          onPageChange={(page) =>
            setPagination((prev) => ({ ...prev, pageIndex: Math.max(0, page - 1) }))
          }
          onPageSizeChange={(pageSize) => setPagination({ pageIndex: 0, pageSize })}
        />
      ) : null}

      {total > items.length ? (
        <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground sm:px-5">
          Showing first {items.length.toLocaleString()} of {total.toLocaleString()} recorded
          candidates. Narrow with search or centre if you need a specific subset.
        </p>
      ) : null}

      {previewCandidate ? (
        <OfficialModal
          title={candidateDisplayName(previewCandidate)}
          subtitle={`${previewCandidate.examination_centre_code} — ${previewCandidate.examination_centre_name}`}
          titleId="admin-irr-preview-title"
          size="wide"
          formError={modalError || null}
          onRequestClose={closePreview}
          toolbar={
            showPreviewNav ? (
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2.5"
                  disabled={!canGoPrev}
                  onClick={goPrevCandidate}
                  aria-label="Previous candidate"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {previewNavIndex + 1} of {navList.length}
                  </span>
                  <span className="hidden sm:inline"> · use ← → keys</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 px-2.5"
                  disabled={!canGoNext}
                  onClick={goNextCandidate}
                  aria-label="Next candidate"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null
          }
          footer={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex gap-1.5")}
                onClick={() =>
                  void safeDownload(
                    () => downloadAdminIrregularCandidatePhotograph(examId, previewCandidate.id),
                    "Failed to download photograph",
                  )
                }
              >
                <Download className="size-4" aria-hidden />
                Photo
              </button>
              <button
                type="button"
                className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex gap-1.5")}
                onClick={() =>
                  void safeDownload(
                    () => downloadAdminIrregularCandidateVoucher(examId, previewCandidate.id),
                    "Failed to download voucher",
                  )
                }
              >
                <Download className="size-4" aria-hidden />
                Voucher
              </button>
              <button
                type="button"
                className={cn(officialAccountsBtnPrimaryToolbar, "inline-flex gap-1.5")}
                disabled={!!exportBusy}
                onClick={() =>
                  void safeDownload(async () => {
                    setExportBusy("modal:pdf");
                    try {
                      await downloadAdminIrregularCandidatePdf(
                        examId,
                        previewCandidate.id,
                        `${exportBasename}_${previewCandidate.id}.pdf`,
                      );
                    } finally {
                      setExportBusy(null);
                    }
                  }, "Failed to download PDF")
                }
              >
                <FileText className="size-4" aria-hidden />
                Download PDF
              </button>
              <button
                type="button"
                className={cn(officialAccountsBtnSecondaryToolbar, "inline-flex")}
                onClick={closePreview}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="overflow-hidden rounded-xl border border-border bg-muted/10 text-left transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                onClick={() =>
                  setImagePreview({
                    kind: "photograph",
                    url: photoUrl,
                    loading: imagesLoading,
                    error: !imagesLoading && !photoUrl ? "Photograph unavailable" : null,
                  })
                }
              >
                <p className="border-b border-border/70 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Photograph
                </p>
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt={`Photograph of ${candidateDisplayName(previewCandidate)}`}
                    className="h-32 w-full bg-black/5 object-cover sm:h-44 sm:object-contain"
                  />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground sm:h-44">
                    {imagesLoading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="size-4" aria-hidden />
                    )}
                    {imagesLoading ? "Loading…" : "Unavailable"}
                  </div>
                )}
              </button>
              <button
                type="button"
                className="overflow-hidden rounded-xl border border-border bg-muted/10 text-left transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                onClick={() =>
                  setImagePreview({
                    kind: "voucher",
                    url: voucherUrl,
                    loading: imagesLoading,
                    error: !imagesLoading && !voucherUrl ? "Voucher unavailable" : null,
                  })
                }
              >
                <p className="border-b border-border/70 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Voucher
                </p>
                {voucherUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={voucherUrl}
                    alt={`Voucher for ${candidateDisplayName(previewCandidate)}`}
                    className="h-32 w-full bg-black/5 object-cover sm:h-44 sm:object-contain"
                  />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground sm:h-44">
                    {imagesLoading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Ticket className="size-4" aria-hidden />
                    )}
                    {imagesLoading ? "Loading…" : "Unavailable"}
                  </div>
                )}
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border/70 pt-4">
              <DetailField label="First name" value={previewCandidate.first_name} />
              <DetailField label="Last name" value={previewCandidate.last_name} />
              {previewCandidate.other_name?.trim() ? (
                <DetailField label="Other name" value={previewCandidate.other_name} />
              ) : null}
              <DetailField label="Gender" value={previewCandidate.gender} />
              <DetailField
                label="Date of birth"
                value={formatDateOfBirth(previewCandidate.date_of_birth)}
              />
              <DetailField label="Phone" value={previewCandidate.phone_number} />
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Programme
                </dt>
                <dd className="mt-0.5 break-words text-sm leading-snug text-foreground">
                  <span className="font-mono">{previewCandidate.programme_code}</span>
                  <span className="text-muted-foreground"> — {previewCandidate.programme_name}</span>
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Subjects
                </dt>
                <dd className="mt-0.5 break-words text-sm leading-snug text-foreground">
                  {previewCandidate.subjects
                    .map((s) => `${s.subject_code} — ${s.subject_name}`)
                    .join(", ") || "—"}
                </dd>
              </div>
              <DetailField
                label="School"
                value={`${previewCandidate.school_code} — ${previewCandidate.school_name}`}
              />
              <DetailField label="Guardian name" value={previewCandidate.guardian_name} />
              <DetailField label="Guardian phone" value={previewCandidate.guardian_phone_number} />
              {previewCandidate.ghanapost_gps_address?.trim() ? (
                <div className="col-span-2">
                  <DetailField
                    label="GhanaPost GPS"
                    value={previewCandidate.ghanapost_gps_address}
                  />
                </div>
              ) : null}
              <DetailField label="Recorded" value={formatRecordedAt(previewCandidate.created_at)} />
            </dl>
          </div>
        </OfficialModal>
      ) : null}

      {imagePreview && previewCandidate ? (
        <ImagePreviewOverlay
          kind={imagePreview.kind}
          candidateName={candidateDisplayName(previewCandidate)}
          url={imagePreview.url}
          loading={imagePreview.loading}
          error={imagePreview.error}
          downloading={downloadingImage}
          onDownload={() => {
            void (async () => {
              setDownloadingImage(true);
              try {
                if (imagePreview.kind === "photograph") {
                  await downloadAdminIrregularCandidatePhotograph(examId, previewCandidate.id);
                } else {
                  await downloadAdminIrregularCandidateVoucher(examId, previewCandidate.id);
                }
              } catch (err) {
                setModalError(err instanceof Error ? err.message : "Failed to download image");
              } finally {
                setDownloadingImage(false);
              }
            })();
          }}
          onDismiss={() => setImagePreview(null)}
        />
      ) : null}
    </div>
  );

  if (!framed) return body;

  return (
    <section className={cn(officialAccountsPanelClass, "flex min-w-0 flex-col overflow-hidden p-0")}>
      {body}
    </section>
  );
}

function ImagePreviewOverlay({
  kind,
  candidateName,
  url,
  loading,
  error,
  downloading,
  onDownload,
  onDismiss,
}: {
  kind: ImagePreviewKind;
  candidateName: string;
  url: string | null;
  loading: boolean;
  error: string | null;
  downloading: boolean;
  onDownload: () => void;
  onDismiss: () => void;
}) {
  const title = kind === "photograph" ? "Photograph" : "Voucher";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-irr-image-preview-title"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
        onClick={onDismiss}
      />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl">
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2
              id="admin-irr-image-preview-title"
              className="truncate text-xs font-semibold text-foreground"
            >
              {title}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">{candidateName}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!url || downloading}
            onClick={onDownload}
            className="gap-1.5"
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            Download
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss} aria-label="Close">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/5 p-3">
          {loading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${title} of ${candidateName}`}
              className="max-h-[70vh] max-w-full object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No image</p>
          )}
        </div>
      </div>
    </div>
  );
}
