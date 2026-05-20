"use client";

import { getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Phone,
  Search,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataTable } from "@/components/data-table";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  downloadAdminAttendanceSheet,
  downloadAdminAttendanceSheetsZip,
  fetchAdminAttendanceSheetBlob,
  getAdminAttendanceScheduledDates,
  getAdminAttendanceSheetSummary,
  listAdminAttendanceComplianceCentres,
  listAdminAttendanceSheets,
  type AttendanceCentreComplianceItem,
  type AttendanceSheetAdmin,
  type AttendanceSheetAdminSummary,
  type AttendanceUploadStatusFilter,
  type Examination,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const btnSecondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

const btnIcon =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-input-border bg-background text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

const filterFieldClass = "flex min-w-0 flex-col gap-1";
const filterLabelCompact = "text-xs font-medium text-muted-foreground";
const filterControlCompact =
  "block w-full min-h-9 rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const btnGhost =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-40";

const PAGE_SIZE = 50;
const CENTRE_LIST_LABEL_MAX_LEN = 25;
/** Fixed master–detail height on large screens; table and centre list scroll inside. */
const attendancePanelHeightClass = "lg:h-[min(72vh,720px)]";

type CentreUploadStatus = "uploaded" | "missing" | "not_due";

type CentreGroup = {
  centerId: string;
  centerCode: string;
  centerName: string;
  sheets: AttendanceSheetAdmin[];
  uploadStatus?: CentreUploadStatus;
  inspectorFullName?: string;
  inspectorPhone?: string | null;
};

function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type PreviewKind = "pdf" | "image" | "unsupported";

function formatExamDateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function attendanceFileKind(filename: string): PreviewKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) return "image";
  return "unsupported";
}

function groupItemsByCentre(items: AttendanceSheetAdmin[]): CentreGroup[] {
  const map = new Map<string, CentreGroup>();
  for (const row of items) {
    let group = map.get(row.center_id);
    if (!group) {
      group = {
        centerId: row.center_id,
        centerCode: row.center_code,
        centerName: row.center_name,
        sheets: [],
        uploadStatus: "uploaded",
      };
      map.set(row.center_id, group);
    }
    group.sheets.push(row);
  }
  return [...map.values()].sort((a, b) => a.centerCode.localeCompare(b.centerCode));
}

function complianceToCentreGroups(items: AttendanceCentreComplianceItem[]): CentreGroup[] {
  return items.map((c) => ({
    centerId: c.center_id,
    centerCode: c.center_code,
    centerName: c.center_name,
    sheets: [],
    uploadStatus: c.upload_status,
    inspectorFullName: c.inspector_full_name,
    inspectorPhone: c.inspector_phone,
  }));
}

function formatCentreListLabel(code: string, name: string, maxLen = CENTRE_LIST_LABEL_MAX_LEN): string {
  const full = `${code} - ${name}`;
  if (full.length <= maxLen) return full;
  return `${full.slice(0, maxLen - 1)}…`;
}

function filterCentreGroups(groups: CentreGroup[], query: string): CentreGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter(
    (g) =>
      g.centerCode.toLowerCase().includes(q) ||
      g.centerName.toLowerCase().includes(q) ||
      (g.inspectorFullName?.toLowerCase().includes(q) ?? false),
  );
}

function ResultsSkeleton() {
  return (
    <div
      className={cn(
        "grid min-h-[420px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(260px,300px)_1fr]",
        attendancePanelHeightClass,
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

type AttendanceSheetPreviewModalProps = {
  examId: number;
  sheets: AttendanceSheetAdmin[];
  index: number;
  centreLabel: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onDownload: (sheet: AttendanceSheetAdmin) => void;
};

function AttendanceSheetPreviewModal({
  examId,
  sheets,
  index,
  centreLabel,
  onClose,
  onIndexChange,
  onDownload,
}: AttendanceSheetPreviewModalProps) {
  const sheet = sheets[index] ?? null;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const hasPrev = index > 0;
  const hasNext = index < sheets.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goPrev, goNext, onClose]);

  useEffect(() => {
    if (!sheet) return;
    let cancelled = false;
    let url: string | null = null;

    setLoading(true);
    setError(null);
    setBlobUrl(null);

    void (async () => {
      try {
        const blob = await fetchAdminAttendanceSheetBlob(examId, sheet.id);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load preview");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [examId, sheet?.id]);

  if (!sheet) return null;

  const kind = attendanceFileKind(sheet.original_filename);
  const titleId = "attendance-preview-title";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 bg-foreground/60"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0 pr-8">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {centreLabel}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground" title={sheet.original_filename}>
              <span className="font-medium text-foreground">{sheet.original_filename}</span>
              <span className="mx-1.5">·</span>
              {formatExamDateLabel(sheet.examination_date)}
              <span className="mx-1.5">·</span>
              {sheet.inspector_full_name}
              {sheets.length > 1 ? (
                <>
                  <span className="mx-1.5">·</span>
                  {index + 1} of {sheets.length}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {blobUrl && kind === "pdf" ? (
              <a href={blobUrl} target="_blank" rel="noopener noreferrer" className={cn(btnSecondary, "gap-1.5")}>
                <ExternalLink className="size-4" aria-hidden />
                Open in tab
              </a>
            ) : null}
            <button
              type="button"
              className={btnIcon}
              aria-label={`Download ${sheet.original_filename}`}
              onClick={() => onDownload(sheet)}
            >
              <Download className="size-4" aria-hidden />
            </button>
            <button type="button" className={btnIcon} aria-label="Close preview" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-[50vh] flex-1 items-center justify-center bg-muted/30 p-4">
          <button
            type="button"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card p-2 shadow-md transition-colors hover:bg-muted disabled:opacity-30"
            disabled={!hasPrev}
            aria-label="Previous file"
            onClick={goPrev}
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card p-2 shadow-md transition-colors hover:bg-muted disabled:opacity-30"
            disabled={!hasNext}
            aria-label="Next file"
            onClick={goNext}
          >
            <ChevronRight className="size-6" />
          </button>

          {loading ? (
            <Loader2 className="size-10 animate-spin text-muted-foreground" aria-label="Loading preview" />
          ) : error ? (
            <p className="max-w-md text-center text-sm text-destructive">{error}</p>
          ) : blobUrl && kind === "pdf" ? (
            <iframe
              title={`Preview ${sheet.original_filename}`}
              src={blobUrl}
              className="h-[min(70vh,800px)] w-full rounded-lg border border-border bg-white"
            />
          ) : blobUrl && kind === "image" ? (
            <img
              src={blobUrl}
              alt={`Attendance sheet ${formatExamDateLabel(sheet.examination_date)}`}
              className="max-h-[min(70vh,800px)] max-w-full rounded-lg border border-border object-contain shadow-sm"
            />
          ) : (
            <div className="max-w-md text-center text-sm text-muted-foreground">
              <p>Preview is not available for this file type.</p>
              <button
                type="button"
                className={cn(btnIcon, "mt-3")}
                aria-label={`Download ${sheet.original_filename}`}
                onClick={() => onDownload(sheet)}
              >
                <Download className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>

        <footer className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <span className="font-medium text-foreground">{sheet.original_filename}</span>
          <span className="mx-2">·</span>
          Uploaded {formatUploadedAt(sheet.created_at)}
          {sheet.notes?.trim() ? (
            <>
              <span className="mx-2">·</span>
              Note: {sheet.notes}
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function AttendanceSheetsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [scheduledDates, setScheduledDates] = useState<string[]>([]);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [scheduledDatesLoading, setScheduledDatesLoading] = useState(false);
  const [examId, setExamId] = useState<number | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [centreListSearch, setCentreListSearch] = useState("");
  const [uploadStatusFilter, setUploadStatusFilter] = useState<AttendanceUploadStatusFilter>("all");
  const [items, setItems] = useState<AttendanceSheetAdmin[]>([]);
  const [centreSheets, setCentreSheets] = useState<AttendanceSheetAdmin[]>([]);
  const [complianceCentres, setComplianceCentres] = useState<AttendanceCentreComplianceItem[]>([]);
  const [summary, setSummary] = useState<AttendanceSheetAdminSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [centreSheetsLoading, setCentreSheetsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkCentreBusy, setBulkCentreBusy] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const urlInitRef = useRef(false);
  const scheduledDatesValidatedRef = useRef(false);

  const useComplianceSidebar = uploadStatusFilter !== "all" && Boolean(filterDate);
  const scheduledDateSet = useMemo(() => new Set(scheduledDates), [scheduledDates]);
  const todayIso = serverToday ?? localTodayIso();
  const selectedDateNotYetDue = Boolean(filterDate && filterDate > todayIso);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<Examination[]>("/examinations");
        if (!cancelled) {
          setExams(data);
          if (data.length > 0) setExamId((prev) => prev ?? data[0]!.id);
        }
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlInitRef.current) return;
    urlInitRef.current = true;
    const sp = new URLSearchParams(searchParams.toString());
    const rawExam = sp.get("exam");
    if (rawExam) {
      const id = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(id) && exams.some((e) => e.id === id)) setExamId(id);
    }
    const date = sp.get("date");
    if (date) setFilterDate(date);
    const q = sp.get("q");
    if (q != null) setSearchInput(q);
    const p = sp.get("page");
    if (p) {
      const n = Number.parseInt(p, 10);
      if (!Number.isNaN(n) && n >= 1) setPage(n);
    }
    const center = sp.get("center");
    if (center) setSelectedCenterId(center);
    const mode = sp.get("mode");
    if (mode === "uploaded" || mode === "missing" || mode === "all") setUploadStatusFilter(mode);
    setUrlHydrated(true);
  }, [exams, searchParams]);

  useEffect(() => {
    if (examId === null) {
      setScheduledDates([]);
      setServerToday(null);
      return;
    }
    let cancelled = false;
    setScheduledDatesLoading(true);
    void (async () => {
      try {
        const res = await getAdminAttendanceScheduledDates(examId);
        if (cancelled) return;
        const dates = Array.isArray(res.dates) ? res.dates.map(String) : [];
        setScheduledDates(dates);
        setServerToday(res.today ?? null);
      } catch {
        if (!cancelled) setScheduledDates([]);
      } finally {
        if (!cancelled) setScheduledDatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!urlHydrated || scheduledDatesLoading) return;
    if (!scheduledDatesValidatedRef.current) {
      scheduledDatesValidatedRef.current = true;
      if (filterDate && scheduledDates.length > 0 && !scheduledDateSet.has(filterDate)) {
        setFilterDate("");
      }
    }
  }, [urlHydrated, scheduledDatesLoading, filterDate, scheduledDates, scheduledDateSet]);

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (filterDate) p.set("date", filterDate);
    if (debouncedSearch) p.set("q", debouncedSearch);
    if (page > 1) p.set("page", String(page));
    if (selectedCenterId) p.set("center", selectedCenterId);
    if (uploadStatusFilter !== "all") p.set("mode", uploadStatusFilter);
    const next = p.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [
    urlHydrated,
    examId,
    filterDate,
    debouncedSearch,
    page,
    selectedCenterId,
    uploadStatusFilter,
    pathname,
    router,
    searchParams,
  ]);

  const centreGroupsFromUploads = useMemo(() => groupItemsByCentre(items), [items]);
  const centreGroupsFromCompliance = useMemo(
    () => complianceToCentreGroups(complianceCentres),
    [complianceCentres],
  );
  const centreGroups = useComplianceSidebar ? centreGroupsFromCompliance : centreGroupsFromUploads;

  const filteredCentreGroups = useMemo(
    () => filterCentreGroups(centreGroups, centreListSearch),
    [centreGroups, centreListSearch],
  );

  const selectedGroup = useMemo(
    () => filteredCentreGroups.find((g) => g.centerId === selectedCenterId) ?? filteredCentreGroups[0] ?? null,
    [filteredCentreGroups, selectedCenterId],
  );

  const tableSheets = centreSheets.length > 0 ? centreSheets : (selectedGroup?.sheets ?? []);

  useEffect(() => {
    if (filteredCentreGroups.length === 0) {
      setSelectedCenterId(null);
      setPreviewIndex(null);
      return;
    }
    if (!selectedCenterId || !filteredCentreGroups.some((g) => g.centerId === selectedCenterId)) {
      setSelectedCenterId(filteredCentreGroups[0]!.centerId);
      setPreviewIndex(null);
    }
  }, [filteredCentreGroups, selectedCenterId]);

  const loadSummary = useCallback(async () => {
    if (examId === null) {
      setSummary(null);
      return;
    }
    try {
      const res = await getAdminAttendanceSheetSummary(examId, {
        examinationDate: filterDate || null,
        search: debouncedSearch || null,
      });
      setSummary(res);
    } catch {
      setSummary(null);
    }
  }, [examId, filterDate, debouncedSearch]);

  const loadList = useCallback(async () => {
    if (examId === null) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listAdminAttendanceSheets(examId, {
        page,
        pageSize: PAGE_SIZE,
        examinationDate: filterDate || null,
        search: debouncedSearch || null,
      });
      setItems(Array.isArray(res.items) ? res.items : []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [examId, page, filterDate, debouncedSearch]);

  const loadCompliance = useCallback(async () => {
    if (examId === null || !filterDate || uploadStatusFilter === "all") {
      setComplianceCentres([]);
      return;
    }
    setComplianceLoading(true);
    try {
      const res = await listAdminAttendanceComplianceCentres(examId, {
        examinationDate: filterDate,
        uploadStatus: uploadStatusFilter,
        search: debouncedSearch || null,
      });
      setComplianceCentres(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load compliance data");
      setComplianceCentres([]);
    } finally {
      setComplianceLoading(false);
    }
  }, [examId, filterDate, uploadStatusFilter, debouncedSearch]);

  const loadCentreSheets = useCallback(async () => {
    if (examId === null || !selectedCenterId) {
      setCentreSheets([]);
      return;
    }
    setCentreSheets([]);
    setCentreSheetsLoading(true);
    try {
      const res = await listAdminAttendanceSheets(examId, {
        page: 1,
        pageSize: 200,
        centerId: selectedCenterId,
        examinationDate: filterDate || null,
        search: debouncedSearch || null,
      });
      setCentreSheets(Array.isArray(res.items) ? res.items : []);
    } catch {
      setCentreSheets([]);
    } finally {
      setCentreSheetsLoading(false);
    }
  }, [examId, selectedCenterId, filterDate, debouncedSearch]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (useComplianceSidebar) {
      void loadCompliance();
    } else {
      void loadList();
    }
  }, [useComplianceSidebar, loadCompliance, loadList]);

  useEffect(() => {
    if (selectedCenterId && examId != null) {
      void loadCentreSheets();
    } else {
      setCentreSheets([]);
    }
  }, [selectedCenterId, examId, loadCentreSheets]);

  const onDownload = useCallback(
    async (row: AttendanceSheetAdmin) => {
      if (examId === null) return;
      setDownloadingId(row.id);
      setLoadError(null);
      try {
        await downloadAdminAttendanceSheet(examId, row);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Download failed");
      } finally {
        setDownloadingId(null);
      }
    },
    [examId],
  );

  const openPreview = useCallback(
    (row: AttendanceSheetAdmin) => {
      const sheets = tableSheets;
      const idx = sheets.findIndex((s) => s.id === row.id);
      if (idx >= 0) setPreviewIndex(idx);
    },
    [tableSheets],
  );

  const onDownloadAllForCentre = useCallback(async () => {
    if (examId === null || !selectedCenterId || tableSheets.length === 0 || !selectedGroup) return;
    setBulkCentreBusy(true);
    setLoadError(null);
    try {
      const zipFilename = `${selectedGroup.centerCode}_${selectedGroup.centerName}_attendance${
        filterDate ? `_${filterDate}` : ""
      }.zip`.replace(/[^\w.\-]+/g, "_");
      await downloadAdminAttendanceSheetsZip(
        examId,
        {
          centerId: selectedCenterId,
          examinationDate: filterDate || null,
          search: debouncedSearch || null,
        },
        zipFilename,
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Zip download failed");
    } finally {
      setBulkCentreBusy(false);
    }
  }, [examId, selectedCenterId, selectedGroup, tableSheets.length, filterDate, debouncedSearch]);

  const columns = useMemo<ColumnDef<AttendanceSheetAdmin>[]>(
    () => [
      {
        id: "inspector",
        accessorFn: (row) => row.inspector_full_name,
        header: "Inspector",
        cell: ({ row }) => (
          <div>
            <span className="font-medium text-foreground">{row.original.inspector_full_name}</span>
            {row.original.inspector_phone ? (
              <a
                href={`tel:${row.original.inspector_phone}`}
                className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone className="size-3" aria-hidden />
                {row.original.inspector_phone}
              </a>
            ) : null}
          </div>
        ),
      },
      {
        id: "examination_date",
        accessorFn: (row) => row.examination_date,
        header: "Examination date",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">{formatExamDateLabel(row.original.examination_date)}</span>
        ),
      },
      {
        id: "notes",
        accessorFn: (row) => row.notes ?? "",
        header: "Notes",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-xs text-muted-foreground">
            {row.original.notes?.trim() ? row.original.notes : "—"}
          </span>
        ),
      },
      {
        id: "uploaded",
        accessorFn: (row) => row.created_at,
        header: "Uploaded",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatUploadedAt(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={btnIcon}
              aria-label={`Preview ${row.original.original_filename}`}
              onClick={() => openPreview(row.original)}
            >
              <Eye className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={btnIcon}
              disabled={downloadingId === row.original.id}
              aria-label={`Download ${row.original.original_filename}`}
              onClick={() => void onDownload(row.original)}
            >
              {downloadingId === row.original.id ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
            </button>
          </div>
        ),
      },
    ],
    [downloadingId, onDownload, openPreview],
  );

  const sheetTable = useReactTable({
    data: tableSheets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasApiFilters = Boolean(debouncedSearch || filterDate);
  const listBusy = useComplianceSidebar ? complianceLoading : loading;

  const centreLabel = selectedGroup
    ? `${selectedGroup.centerCode} — ${selectedGroup.centerName}`
    : "";

  const hasActiveFilters = Boolean(filterDate || searchInput.trim() || uploadStatusFilter !== "all");

  const resultsMetaLine = useMemo(() => {
    if (examId == null) return null;
    if (listBusy) return "Loading…";
    if (useComplianceSidebar) {
      return `${filteredCentreGroups.length} centre${filteredCentreGroups.length === 1 ? "" : "s"}`;
    }
    if (total === 0) {
      return filterDate ? "No uploads" : "No uploads yet";
    }
    const centresPart =
      centreListSearch.trim() && centreGroups.length !== filteredCentreGroups.length
        ? `${filteredCentreGroups.length} of ${centreGroups.length} centres`
        : `${centreGroups.length} centre${centreGroups.length === 1 ? "" : "s"}`;
    const uploadsPart = `${total} upload${total === 1 ? "" : "s"}`;
    const pagePart = totalPages > 1 ? ` · page ${page} of ${totalPages}` : "";
    return `${centresPart} · ${uploadsPart}${pagePart}`;
  }, [
    examId,
    listBusy,
    useComplianceSidebar,
    filteredCentreGroups.length,
    total,
    filterDate,
    centreListSearch,
    centreGroups.length,
    totalPages,
    page,
  ]);

  const clearFilters = () => {
    setFilterDate("");
    setSearchInput("");
    setCentreListSearch("");
    setPage(1);
    setUploadStatusFilter("all");
  };

  function renderEmptyState() {
    if (examId === null) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Select an examination to review attendance uploads.</p>
        </div>
      );
    }
    if (uploadStatusFilter !== "all" && !filterDate) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Select a scheduled date to filter by upload status.</p>
          {scheduledDates.length === 0 && !scheduledDatesLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">No scheduled dates are available for this examination yet.</p>
          ) : null}
        </div>
      );
    }
    if (filteredCentreGroups.length === 0 && centreListSearch.trim()) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No centres on this list match &ldquo;{centreListSearch.trim()}&rdquo;.
          </p>
          <button type="button" className={cn(btnSecondary, "mt-4")} onClick={() => setCentreListSearch("")}>
            Clear centre filter
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {uploadStatusFilter === "missing"
            ? "No centres are missing an upload for the selected date and filters."
            : debouncedSearch || filterDate
              ? "No uploads match the current filters. Try clearing filters or another date."
              : "No attendance sheets have been uploaded for this examination yet."}
        </p>
        {(debouncedSearch || filterDate || uploadStatusFilter !== "all") && (
          <button type="button" className={cn(btnSecondary, "mt-4")} onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Attendance sheets</h1>
        <p className="mt-1 text-sm text-muted-foreground">Inspector uploads for allowance verification.</p>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className={cn(filterFieldClass, "min-w-[10rem] flex-1 sm:max-w-xs")}>
            <label htmlFor="attendance-exam" className={filterLabelCompact}>
              Examination
            </label>
            <select
              id="attendance-exam"
              aria-label="Examination"
              value={examId ?? ""}
              onChange={(e) => {
                setExamId(e.target.value ? Number(e.target.value) : null);
                setFilterDate("");
                setPage(1);
                scheduledDatesValidatedRef.current = false;
              }}
              className={filterControlCompact}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.year}
                  {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                </option>
              ))}
            </select>
          </div>

          <div className={cn(filterFieldClass, "min-w-[10rem] flex-1 sm:max-w-xs")}>
            <label htmlFor="attendance-filter-date" className={filterLabelCompact}>
              Scheduled date
            </label>
            <select
              id="attendance-filter-date"
              aria-label="Scheduled date"
              aria-busy={scheduledDatesLoading}
              value={filterDate}
              disabled={examId === null || scheduledDatesLoading}
              title={
                scheduledDates.length === 0 && !scheduledDatesLoading && examId != null
                  ? "No timetable dates for this examination"
                  : undefined
              }
              onChange={(e) => {
                setFilterDate(e.target.value);
                setPage(1);
              }}
              className={filterControlCompact}
            >
              <option value="">All dates — recent uploads</option>
              {scheduledDates.map((iso) => (
                <option key={iso} value={iso}>
                  {formatExamDateLabel(iso)}
                </option>
              ))}
            </select>
          </div>

          <div className={cn(filterFieldClass, "min-w-[10rem] flex-1 sm:max-w-sm")}>
            <label htmlFor="attendance-search" className={filterLabelCompact}>
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="attendance-search"
                type="search"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                placeholder="Centre or inspector"
                aria-label="Search uploads by centre or inspector"
                className={cn(filterControlCompact, "pl-9")}
                autoComplete="off"
              />
            </div>
          </div>

          <div className={cn(filterFieldClass, "shrink-0")} role="group" aria-label="Upload status">
            <span className={filterLabelCompact}>Status</span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { value: "all" as const, label: "All" },
                  { value: "uploaded" as const, label: "Uploaded" },
                  { value: "missing" as const, label: "Missing" },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={uploadStatusFilter === value}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
                    uploadStatusFilter === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                  onClick={() => {
                    setUploadStatusFilter(value);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={btnGhost}
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            aria-label="Clear all filters"
          >
            <X className="size-4" aria-hidden />
            Reset
          </button>
        </div>

        {summary?.centres_expected != null && examId != null && filterDate ? (
          <div
            className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs"
            aria-live="polite"
          >
            <span className="rounded-md border border-border bg-muted/50 px-2 py-1 tabular-nums text-foreground">
              Expected: {summary.centres_expected}
            </span>
            {selectedDateNotYetDue ? (
              <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-foreground">
                Not yet due
              </span>
            ) : (
              <span
                className={cn(
                  "rounded-md border px-2 py-1 tabular-nums",
                  (summary.centres_missing ?? 0) > 0
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/50 text-foreground",
                )}
              >
                Missing: {summary.centres_missing ?? 0}
              </span>
            )}
            <span className="text-muted-foreground">· {formatExamDateLabel(filterDate)}</span>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              {filterDate ? "Uploads for selected date" : "Recent uploads"}
            </h2>
            {examId != null && resultsMetaLine ? (
              <p className="text-sm text-muted-foreground">· {resultsMetaLine}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!useComplianceSidebar && totalPages > 1 ? (
              <>
                <button type="button" className={btnSecondary} disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </>
            ) : null}
          </div>
        </div>

        {listBusy ? (
          <ResultsSkeleton />
        ) : filteredCentreGroups.length === 0 ? (
          renderEmptyState()
        ) : (
          <div
            className={cn(
              "grid min-h-[420px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(260px,300px)_1fr]",
              attendancePanelHeightClass,
            )}
          >
            <div className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:h-full lg:border-b-0 lg:border-r">
              <p
                className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground"
                title={
                  !useComplianceSidebar
                    ? hasApiFilters
                      ? "Centre list is built from uploads on this page only"
                      : "Narrows centres on this page — does not search the whole examination"
                    : undefined
                }
              >
                Centres
              </p>
              <div className="shrink-0 border-b border-border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    id="centre-list-search"
                    type="search"
                    value={centreListSearch}
                    onChange={(e) => setCentreListSearch(e.target.value)}
                    placeholder="Search centres…"
                    aria-label="Search centres on this page"
                    className={cn(filterControlCompact, "py-2 pl-8 text-sm")}
                    autoComplete="off"
                  />
                </div>
              </div>
              <ul
                className="max-h-48 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 lg:max-h-none"
                role="listbox"
                aria-label="Examination centres"
              >
                {filteredCentreGroups.map((group) => {
                  const selected = selectedGroup?.centerId === group.centerId;
                  const uploaded = group.uploadStatus === "uploaded";
                  const notYetDue = group.uploadStatus === "not_due";
                  const centreLabel = formatCentreListLabel(group.centerCode, group.centerName);
                  const centreLabelFull = `${group.centerCode} - ${group.centerName}`;
                  return (
                    <li key={group.centerId}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={centreLabelFull}
                        title={centreLabelFull}
                        onClick={() => setSelectedCenterId(group.centerId)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                          selected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/80",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-2.5 w-2.5 shrink-0 rounded-full",
                            uploaded
                              ? "bg-success"
                              : notYetDue
                                ? "border-2 border-muted-foreground/30 bg-transparent"
                                : "border-2 border-muted-foreground/50 bg-transparent",
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate font-mono text-xs font-medium tabular-nums leading-snug",
                            !selected && "text-foreground",
                          )}
                        >
                          {centreLabel}
                        </span>
                        <ChevronRight className={cn("size-4 shrink-0", selected ? "opacity-90" : "text-muted-foreground")} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden lg:h-full">
              {selectedGroup ? (
                <>
                  <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 lg:px-5">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        <span className="font-mono tabular-nums">{selectedGroup.centerCode}</span>
                        <span className="mx-2 font-normal text-muted-foreground">—</span>
                        {selectedGroup.centerName}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selectedGroup.inspectorFullName ?? tableSheets[0]?.inspector_full_name ?? "Inspector"}
                        {selectedGroup.inspectorPhone || tableSheets[0]?.inspector_phone ? (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={`tel:${selectedGroup.inspectorPhone ?? tableSheets[0]?.inspector_phone}`}
                              className="text-primary hover:underline"
                            >
                              {selectedGroup.inspectorPhone ?? tableSheets[0]?.inspector_phone}
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {tableSheets.length > 0 ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        disabled={bulkCentreBusy}
                        onClick={() => void onDownloadAllForCentre()}
                      >
                        {bulkCentreBusy ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Download className="size-4" aria-hidden />
                        )}
                        <span className="ml-1.5">Download zip</span>
                      </button>
                    ) : null}
                  </div>
                  <div className="max-h-[min(50vh,480px)] min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain p-3 lg:max-h-none lg:p-4 [&_th]:bg-card [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10">
                    {centreSheetsLoading && tableSheets.length === 0 ? (
                      <div className="flex min-h-[200px] items-center justify-center">
                        <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : tableSheets.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-12 text-center text-sm text-muted-foreground">
                        {selectedGroup.uploadStatus === "not_due" ? (
                          <>
                            Attendance submission is not yet due for this centre
                            {filterDate ? ` on ${formatExamDateLabel(filterDate)}` : ""}.
                          </>
                        ) : selectedGroup.uploadStatus === "missing" ? (
                          <>
                            No attendance sheet uploaded for this centre
                            {filterDate ? ` on ${formatExamDateLabel(filterDate)}` : ""}. Contact the inspector to upload.
                          </>
                        ) : (
                          "No sheets for this centre with the current filters."
                        )}
                      </div>
                    ) : (
                      <DataTable
                        table={sheetTable}
                        showFooter={false}
                        emptyMessage="No sheets for this centre."
                        striped
                        onRowClick={(row) => openPreview(row)}
                      />
                    )}
                  </div>
                </>
              ) : (
                <p className="p-8 text-sm text-muted-foreground">Select an examination centre.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {previewIndex !== null && examId !== null && tableSheets.length > 0 ? (
        <AttendanceSheetPreviewModal
          examId={examId}
          sheets={tableSheets}
          index={previewIndex}
          centreLabel={centreLabel}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
          onDownload={(sheet) => void onDownload(sheet)}
        />
      ) : null}
    </div>
  );
}

export default function AdminAttendanceSheetsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <AttendanceSheetsContent />
    </RoleGuard>
  );
}
