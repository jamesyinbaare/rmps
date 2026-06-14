"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExaminerAccountsColumnsPopover } from "@/components/examiner-accounts/examiner-accounts-columns-popover";
import { ExaminerAccountsTable } from "@/components/examiner-accounts/examiner-accounts-table";
import { ExaminerPayoutsCommandBar } from "@/components/examiner-accounts/examiner-payouts-command-bar";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  downloadAdminExaminerAllowancesBogExport,
  downloadAdminExaminerAllowancesExport,
  listAdminExaminerAllowances,
  type AdminExaminerAllowanceRow,
  type Examination,
} from "@/lib/api";
import {
  bogExportFilenameSuffix,
  parseExaminerPayoutView,
  sumPayoutViewOnPage,
  type ExaminerPayoutView,
} from "@/lib/examiner-payout-view";
import { EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY } from "@/lib/examiner-accounts-table-columns";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  buildExaminerAccountsBySubjectHref,
  officialAccountsBtnSecondary,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPageLayoutClass,
  officialAccountsPanelFillClass,
  officialAccountsTabPanelClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";
import type { VisibilityState } from "@tanstack/react-table";

const SECTION_ID = "examiner-payouts";
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

const VALID_ROLES = new Set<string>([
  "chief_examiner",
  "assistant_chief_examiner",
  "assistant_examiner",
  "team_leader",
]);

function parseRoleFilter(raw: string | null): string {
  if (raw && VALID_ROLES.has(raw)) return raw;
  return "";
}

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function exportFilenameBase(exam: Examination | null): string {
  if (!exam) return "exam";
  const parts = [String(exam.year), exam.exam_series?.trim() || "", exam.exam_type.trim()].filter(Boolean);
  const raw = `${exam.id}_${parts.join("_")}`;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || `exam_${exam.id}`;
}

function ExaminerPayoutsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [items, setItems] = useState<AdminExaminerAllowanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [payoutView, setPayoutView] = useState<ExaminerPayoutView>("all");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    EXAMINER_ACCOUNTS_DEFAULT_COLUMN_VISIBILITY,
  );
  const [urlHydrated, setUrlHydrated] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedQueryKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (!cancelled) setExams(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load examinations.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlHydrated) return;
    const rawExam = searchParams.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) setExamId(n);
    } else {
      setExamId(exams[0]!.id);
    }
    setRoleFilter(parseRoleFilter(searchParams.get("role")));
    const reg = searchParams.get("region")?.trim() ?? "";
    setRegionFilter(reg && REGION_OPTIONS.some((r) => r.value === reg) ? reg : "");
    setSearchQuery(searchParams.get("search")?.trim() ?? "");
    const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    setPage(!Number.isNaN(rawPage) && rawPage > 0 ? rawPage : 1);
    const rawPageSize = Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
    setPageSize(
      PAGE_SIZE_OPTIONS.includes(rawPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? rawPageSize
        : DEFAULT_PAGE_SIZE,
    );
    setPayoutView(parseExaminerPayoutView(searchParams.get("payoutView")));
    setUrlHydrated(true);
  }, [exams, searchParams, urlHydrated]);

  const syncUrl = useCallback(
    (patch: {
      examId?: number | null;
      role?: string;
      region?: string;
      search?: string;
      page?: number;
      pageSize?: number;
      payoutView?: ExaminerPayoutView;
    }) => {
      const p = new URLSearchParams();
      const nextExam = patch.examId !== undefined ? patch.examId : examId;
      const nextRole = patch.role !== undefined ? patch.role : roleFilter;
      const nextRegion = patch.region !== undefined ? patch.region : regionFilter;
      const nextSearch = patch.search !== undefined ? patch.search : searchQuery;
      const nextPage = patch.page ?? page;
      const nextPageSize = patch.pageSize ?? pageSize;
      const nextPayoutView = patch.payoutView ?? payoutView;
      if (nextExam != null) p.set("exam", String(nextExam));
      if (nextRole) p.set("role", nextRole);
      if (nextRegion) p.set("region", nextRegion);
      if (nextSearch.trim()) p.set("search", nextSearch.trim());
      if (nextPage > 1) p.set("page", String(nextPage));
      if (nextPageSize !== DEFAULT_PAGE_SIZE) p.set("pageSize", String(nextPageSize));
      if (nextPayoutView !== "all") p.set("payoutView", nextPayoutView);
      const nextQuery = p.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) return;
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [examId, page, pageSize, pathname, payoutView, regionFilter, roleFilter, router, searchParams, searchQuery],
  );

  const queryKey = useMemo(
    () => `${examId}:${roleFilter}:${regionFilter}:${searchQuery.trim()}:${pageSize}`,
    [examId, roleFilter, regionFilter, searchQuery, pageSize],
  );

  const fetchRows = useCallback(
    async (targetPage: number, force = false) => {
      if (examId == null) return;
      const key = `${queryKey}:${targetPage}`;
      if (!force && loadedQueryKeyRef.current === key) return;

      setBusy(true);
      setLoadError(null);
      try {
        const res = await listAdminExaminerAllowances({
          examination_id: examId,
          role: roleFilter || null,
          region: regionFilter || null,
          search: searchQuery.trim() || null,
          skip: (targetPage - 1) * pageSize,
          limit: pageSize,
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(targetPage);
        loadedQueryKeyRef.current = key;
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examiner bank accounts.");
        setItems([]);
        setTotal(0);
      } finally {
        setBusy(false);
      }
    },
    [examId, pageSize, queryKey, regionFilter, roleFilter, searchQuery],
  );

  useEffect(() => {
    if (!urlHydrated || examId == null) return;
    void fetchRows(page);
  }, [urlHydrated, examId, page, fetchRows]);

  useEffect(() => {
    if (!urlHydrated) return;
    syncUrl({});
  }, [urlHydrated, examId, roleFilter, regionFilter, searchQuery, page, pageSize, payoutView, syncUrl]);

  const selectedExam = exams.find((e) => e.id === examId) ?? null;

  const bySubjectHref = useMemo(() => {
    if (examId == null) return null;
    return buildExaminerAccountsBySubjectHref({
      examId,
      region: regionFilter || undefined,
      role: roleFilter || undefined,
    });
  }, [examId, regionFilter, roleFilter]);

  const exportOptions = useMemo(
    () => [
      { key: "excel", label: "Export Excel", primary: true },
      { key: "bog_all", label: "BoG — All together" },
      { key: "bog_travel_commuting", label: "BoG — T&T & commuting" },
      { key: "bog_allowances_marking", label: "BoG — Allowances & marking" },
    ],
    [],
  );

  const exportDisabled = examId == null || total === 0 || !!exportBusy;
  const exportDisabledReason =
    examId == null ? "Select an examination" : total === 0 ? "No records to export" : undefined;

  async function onExport(key: string) {
    if (examId == null || !selectedExam) return;
    setExportBusy(`${SECTION_ID}:${key}`);
    try {
      const base = exportFilenameBase(selectedExam);
      const exportParams = {
        examination_id: examId,
        role: roleFilter || null,
        region: regionFilter || null,
        search: searchQuery.trim() || null,
      };
      if (key === "excel") {
        await downloadAdminExaminerAllowancesExport({
          ...exportParams,
          filename: `${base}_examiner_allowances.xlsx`,
        });
      } else if (key === "bog_all") {
        await downloadAdminExaminerAllowancesBogExport({
          ...exportParams,
          payout_mode: "all",
          filename: `${base}_${bogExportFilenameSuffix("all")}.xlsx`,
        });
      } else if (key === "bog_travel_commuting") {
        await downloadAdminExaminerAllowancesBogExport({
          ...exportParams,
          payout_mode: "travel_commuting",
          filename: `${base}_${bogExportFilenameSuffix("travel_commuting")}.xlsx`,
        });
      } else if (key === "bog_allowances_marking") {
        await downloadAdminExaminerAllowancesBogExport({
          ...exportParams,
          payout_mode: "allowances_marking",
          filename: `${base}_${bogExportFilenameSuffix("allowances_marking")}.xlsx`,
        });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportBusy(null);
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setPage(1);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadedQueryKeyRef.current = "";
      syncUrl({ search: q, page: 1 });
    }, 300);
  }

  const pagePayoutTotal = useMemo(() => sumPayoutViewOnPage(items, payoutView), [items, payoutView]);

  const tableMeta = busy
    ? "Updating examiners…"
    : `${total.toLocaleString()} examiner${total === 1 ? "" : "s"} · ${formatGhsAmount(String(pagePayoutTotal))} on this page`;

  return (
    <div className={officialAccountsPageLayoutClass}>
      <div className={officialAccountsPanelFillClass}>
        <ExaminerPayoutsCommandBar
          exams={exams}
          examId={examId}
          onExamChange={(id) => {
            setExamId(id);
            setPage(1);
            loadedQueryKeyRef.current = "";
            syncUrl({ examId: id, page: 1 });
          }}
          formatExamLabel={formatExamLabel}
          roleFilter={roleFilter}
          onRoleChange={(role) => {
            setRoleFilter(role);
            setPage(1);
            loadedQueryKeyRef.current = "";
            syncUrl({ role, page: 1 });
          }}
          regionFilter={regionFilter}
          onRegionChange={(region) => {
            setRegionFilter(region);
            setPage(1);
            loadedQueryKeyRef.current = "";
            syncUrl({ region, page: 1 });
          }}
          bySubjectHref={bySubjectHref}
          exportOptions={exportOptions}
          exportDisabled={exportDisabled}
          exportDisabledReason={exportDisabledReason}
          exportBusy={exportBusy}
          onExport={(key) => void onExport(key)}
        />

        {loadError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{loadError}</p>
            {examId != null ? (
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={() => void fetchRows(page, true)}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <section className={officialAccountsTabPanelClass}>
          <div className={cn(officialAccountsCommandBarClass, "shrink-0 border-t border-border/60 py-3")}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1 max-w-xl">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="examiner-payouts-search">
                  Search examiners
                </label>
                <input
                  id="examiner-payouts-search"
                  type="search"
                  className={cn(officialAccountsCommandBarSearchClass, "mt-1 w-full max-w-none")}
                  placeholder="Name or phone…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  disabled={busy && items.length === 0}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ExaminerAccountsColumnsPopover
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                  disabled={busy && items.length === 0}
                />
                <p className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
                  {tableMeta}
                </p>
              </div>
            </div>
          </div>

          <ExaminerAccountsTable
            items={items}
            busy={busy}
            emptyLabel="No examiners for this examination."
            hasActiveFilters={!!roleFilter || !!regionFilter || !!searchQuery.trim()}
            page={page}
            total={total}
            pageSize={pageSize}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageChange={(p) => {
              setPage(p);
              loadedQueryKeyRef.current = "";
              syncUrl({ page: p });
            }}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
              loadedQueryKeyRef.current = "";
              syncUrl({ pageSize: size, page: 1 });
            }}
            payoutView={payoutView}
            onPayoutViewChange={(view) => {
              setPayoutView(view);
              syncUrl({ payoutView: view });
            }}
            columnVisibility={columnVisibility}
          />
        </section>
      </div>
    </div>
  );
}

export default function ExaminerPayoutsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <ExaminerPayoutsContent />
    </RoleGuard>
  );
}
