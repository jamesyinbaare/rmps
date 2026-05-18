"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  adminBulkUploadInspectorPostings,
  adminCreateInspectorPosting,
  adminDeleteInspectorPosting,
  adminListInspectorPostings,
  adminUpdateInspectorPosting,
  apiJson,
  downloadInspectorPostingsBulkTemplate,
  type AdminInspectorExamPostingRow,
  type Examination,
  type ExaminationCenterListResponse,
  type ExamInspectorSubjectScopeApi,
  listInspectors,
  type InspectorPostingBulkUploadResponse,
  type InspectorSchoolRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card shadow-sm";
const toolbarClass =
  "flex flex-col gap-4 border-b border-border bg-muted/20 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-5 sm:py-5";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnDestructive =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnGhost =
  "inline-flex min-h-9 items-center justify-center rounded-md px-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50";

const SCOPES: ExamInspectorSubjectScopeApi[] = ["ALL", "CORE", "ELECTIVE"];
const SCOPE_STYLES: Record<ExamInspectorSubjectScopeApi, string> = {
  ALL: "bg-primary/10 text-primary",
  CORE: "bg-info/15 text-info",
  ELECTIVE: "bg-warning/15 text-warning",
};
const RELATED_LINKS = [
  { href: "/dashboard/admin/inspectors", label: "Inspectors" },
  { href: "/dashboard/admin/examination-centres", label: "Centres" },
  { href: "/dashboard/admin/examinations", label: "Examinations" },
] as const;

function Modal({
  title,
  subtitle,
  titleId,
  children,
  onClose,
  canClose = true,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  canClose?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
        onClick={() => canClose && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 max-h-[min(90vh,48rem)] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className={cn(
              "shrink-0 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted",
              inputFocusRing,
              !canClose && "opacity-40",
            )}
          >
            Close
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const key = scope as ExamInspectorSubjectScopeApi;
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide",
        SCOPE_STYLES[key] ?? "bg-muted text-muted-foreground",
      )}
    >
      {scope}
    </span>
  );
}

function SearchablePicker<T extends { id: string }>({
  label,
  hint,
  searchId,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  loading,
  items,
  selectedId,
  onSelect,
  renderItem,
  selectedLabel,
  emptyMessage = "No matches.",
}: {
  label: string;
  hint?: string;
  searchId: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  loading?: boolean;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderItem: (item: T) => { primary: string; secondary?: string };
  selectedLabel: string | null;
  emptyMessage?: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className={formLabelClass} htmlFor={searchId}>
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        id={searchId}
        type="search"
        className={formInputClass}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        autoComplete="off"
      />
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="max-h-44 divide-y divide-border overflow-y-auto">
            {items.map((item) => {
              const { primary, secondary } = renderItem(item);
              const selected = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                      selected && "bg-primary/10 ring-1 ring-inset ring-primary/25",
                    )}
                  >
                    <span className="font-medium text-foreground">{primary}</span>
                    {secondary ? <span className="text-xs text-muted-foreground">{secondary}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selectedLabel ? (
        <p className="text-xs text-foreground">
          <span className="font-medium text-muted-foreground">Selected:</span> {selectedLabel}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Choose one option from the list.</p>
      )}
    </div>
  );
}

function postingInspectorLabel(r: AdminInspectorExamPostingRow): string {
  return r.inspector_phone_number
    ? `${r.inspector_full_name} · ${r.inspector_phone_number}`
    : r.inspector_full_name;
}

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function filterCentreItems(items: ExaminationCenterListResponse["items"], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return items.slice(0, 45);
  return items
    .filter(
      (c) =>
        c.school.name.toLowerCase().includes(t) ||
        c.school.code.toLowerCase().includes(t) ||
        c.school.region.toLowerCase().includes(t),
    )
    .slice(0, 60);
}

export default function AdminInspectorPostingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlExamIdRef = useRef<number | null>(null);
  const openedFromUrlRef = useRef(false);

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [rows, setRows] = useState<AdminInspectorExamPostingRow[]>([]);
  const [centres, setCentres] = useState<ExaminationCenterListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPostings, setLoadingPostings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tableSearch, setTableSearch] = useState("");

  const [filterInspectorUserId, setFilterInspectorUserId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<AdminInspectorExamPostingRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<AdminInspectorExamPostingRow | null>(null);

  const [inspId, setInspId] = useState("");
  const [inspectorQuery, setInspectorQuery] = useState("");
  const [inspectorHits, setInspectorHits] = useState<InspectorSchoolRow[]>([]);
  const [inspectorHitsLoading, setInspectorHitsLoading] = useState(false);

  const [centerId, setCenterId] = useState("");
  const [centreFilterCreate, setCentreFilterCreate] = useState("");
  const [centreFilterEdit, setCentreFilterEdit] = useState("");

  const [scope, setScope] = useState<ExamInspectorSubjectScopeApi>("ALL");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [sendSmsOnBulk, setSendSmsOnBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<InspectorPostingBulkUploadResponse | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("examinationId");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    urlExamIdRef.current = !Number.isNaN(parsed) ? parsed : null;
    if (urlExamIdRef.current != null && exams.some((e) => e.id === urlExamIdRef.current)) {
      setExamId(urlExamIdRef.current);
    }
    const ins = searchParams.get("inspectorUserId")?.trim();
    setFilterInspectorUserId(ins && ins.length > 0 ? ins : null);
    if (searchParams.get("openCreate") !== "1") {
      openedFromUrlRef.current = false;
    }
  }, [searchParams, exams]);

  const loadExams = useCallback(async () => {
    try {
      const list = await apiJson<Examination[]>("/examinations");
      setExams(list);
      setExamId(() => {
        const urlId = urlExamIdRef.current;
        if (urlId != null && list.some((e) => e.id === urlId)) return urlId;
        return list.length ? list[0].id : null;
      });
    } catch (e) {
      setExams([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
    }
  }, []);

  const loadCentres = useCallback(async () => {
    try {
      const cenRes = await apiJson<ExaminationCenterListResponse>(
        "/schools/examination-centers?skip=0&limit=500",
      );
      setCentres(cenRes);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load examination centres");
    }
  }, []);

  const reloadPostings = useCallback(async () => {
    if (examId == null) {
      setRows([]);
      setLoadingPostings(false);
      return;
    }
    setLoadingPostings(true);
    setLoadError(null);
    try {
      const res = await adminListInspectorPostings({
        examinationId: examId,
        inspectorUserId: filterInspectorUserId,
      });
      setRows(res.items);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load postings");
    } finally {
      setLoadingPostings(false);
    }
  }, [examId, filterInspectorUserId]);

  useEffect(() => {
    void loadExams();
    void loadCentres();
  }, [loadExams, loadCentres]);

  useEffect(() => {
    void reloadPostings();
  }, [reloadPostings]);

  useEffect(() => {
    if (searchParams.get("openCreate") !== "1") return;
    if (openedFromUrlRef.current) return;
    if (examId == null || centres == null) return;
    openedFromUrlRef.current = true;
    const cid = searchParams.get("centerId")?.trim() ?? "";
    const items = centres.items;
    const validCenter =
      cid && items.some((x) => x.school.id === cid) ? cid : (items[0]?.school.id ?? "");
    setFormError(null);
    setInspectorQuery("");
    setInspId("");
    setCentreFilterCreate("");
    setCenterId(validCenter);
    setScope("ALL");
    setNotes("");
    setCreateOpen(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("openCreate");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [examId, centres, searchParams, pathname, router]);

  useEffect(() => {
    if (!createOpen) return;
    const t = window.setTimeout(() => {
      void (async () => {
        setInspectorHitsLoading(true);
        try {
          const q = inspectorQuery.trim();
          const res = await listInspectors({
            limit: 50,
            skip: 0,
            sort: "full_name",
            order: "asc",
            q: q || null,
          });
          setInspectorHits(res.items);
        } catch {
          setInspectorHits([]);
        } finally {
          setInspectorHitsLoading(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [inspectorQuery, createOpen]);

  const filteredCentresCreate = useMemo(
    () => filterCentreItems(centres?.items ?? [], centreFilterCreate),
    [centres, centreFilterCreate],
  );

  const filteredCentresEdit = useMemo(
    () => filterCentreItems(centres?.items ?? [], centreFilterEdit),
    [centres, centreFilterEdit],
  );

  const centrePickerItems = useMemo(
    () =>
      (createOpen ? filteredCentresCreate : filteredCentresEdit).map((c) => ({
        id: c.school.id,
        school: c.school,
      })),
    [createOpen, filteredCentresCreate, filteredCentresEdit],
  );

  const selectedInspectorLabel = useMemo(() => {
    if (!inspId) return null;
    const hit = inspectorHits.find((h) => h.id === inspId);
    if (!hit) return null;
    return hit.phone_number ? `${hit.full_name} · ${hit.phone_number}` : hit.full_name;
  }, [inspId, inspectorHits]);

  const selectedCentreLabel = useMemo(() => {
    if (!centerId || !centres) return null;
    const c = centres.items.find((x) => x.school.id === centerId);
    return c ? `${c.school.name} (${c.school.code})` : null;
  }, [centerId, centres]);

  const filterInspectorLabel = useMemo(() => {
    if (!filterInspectorUserId) return null;
    const row = rows.find((r) => r.inspector_user_id === filterInspectorUserId);
    return row ? postingInspectorLabel(row) : null;
  }, [filterInspectorUserId, rows]);

  const visibleRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.inspector_full_name.toLowerCase().includes(q) ||
        (r.inspector_phone_number?.toLowerCase().includes(q) ?? false) ||
        r.center_name.toLowerCase().includes(q) ||
        r.center_code.toLowerCase().includes(q) ||
        r.subject_scope.toLowerCase().includes(q) ||
        (r.notes?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, tableSearch]);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [exams, examId]);

  function clearInspectorFilter() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("inspectorUserId");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openCreate(presetCenterId?: string | null) {
    setFormError(null);
    setInspectorQuery("");
    setInspId("");
    setCentreFilterCreate("");
    const items = centres?.items ?? [];
    const cid =
      presetCenterId && items.some((x) => x.school.id === presetCenterId)
        ? presetCenterId
        : (items[0]?.school.id ?? "");
    setCenterId(cid);
    setScope("ALL");
    setNotes("");
    setCreateOpen(true);
  }

  function openEdit(row: AdminInspectorExamPostingRow) {
    setFormError(null);
    setEditRow(row);
    setCenterId(row.center_id);
    setCentreFilterEdit("");
    setScope(row.subject_scope as ExamInspectorSubjectScopeApi);
    setNotes(row.notes ?? "");
  }

  function closeModals() {
    setCreateOpen(false);
    setEditRow(null);
    setDeleteRow(null);
    setFormError(null);
    setCentreFilterCreate("");
    setCentreFilterEdit("");
    setInspectorQuery("");
  }

  async function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (examId == null) return;
    if (!inspId.trim() || !centerId.trim()) {
      setFormError("Inspector and centre are required.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await adminCreateInspectorPosting(examId, {
        inspector_user_id: inspId.trim(),
        center_id: centerId.trim(),
        subject_scope: scope,
        notes: notes.trim() || null,
      });
      closeModals();
      await reloadPostings();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create posting");
    } finally {
      setSubmitting(false);
    }
  }

  async function onEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (examId == null || editRow == null) return;
    if (!centerId.trim()) {
      setFormError("Centre is required.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await adminUpdateInspectorPosting(examId, editRow.id, {
        center_id: centerId.trim(),
        subject_scope: scope,
        notes: notes.trim() || null,
      });
      closeModals();
      await reloadPostings();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not update posting");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (examId == null || deleteRow == null) return;
    setSubmitting(true);
    try {
      await adminDeleteInspectorPosting(examId, deleteRow.id);
      closeModals();
      await reloadPostings();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onBulkUpload() {
    if (examId == null || !bulkFile) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await adminBulkUploadInspectorPostings(examId, bulkFile, {
        send_sms: sendSmsOnBulk,
      });
      setBulkResult(res);
      setBulkFile(null);
      await reloadPostings();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Inspector postings</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Assign inspectors to examination centre hosts with subject scope (All, Core, or Elective) for the selected
          examination.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Related admin pages">
          {RELATED_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5",
                inputFocusRing,
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <section className={panelClass}>
        <div className={toolbarClass}>
          <div className="min-w-48 flex-1 sm:max-w-md">
            <label htmlFor="admin-ip-exam" className={formLabelClass}>
              Examination
            </label>
            <select
              id="admin-ip-exam"
              className={formInputClass}
              value={examId ?? ""}
              onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              className={btnSecondary}
              disabled={examId == null}
              onClick={() => {
                if (examId == null) return;
                setBulkError(null);
                void downloadInspectorPostingsBulkTemplate(examId).catch((err: unknown) => {
                  setBulkError(err instanceof Error ? err.message : "Template download failed");
                });
              }}
            >
              Download template
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => openCreate()}
              disabled={examId == null || centres == null || loadingPostings}
            >
              Add posting
            </button>
          </div>
        </div>
        {filterInspectorUserId ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5 sm:px-5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filter</span>
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-background py-1 pl-3 pr-1 text-sm">
              <span className="truncate text-foreground">{filterInspectorLabel ?? "Inspector"}</span>
              <button
                type="button"
                onClick={clearInspectorFilter}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  inputFocusRing,
                )}
              >
                Clear
              </button>
            </span>
          </div>
        ) : null}

        <div className="border-b border-border px-4 py-3 sm:px-5">
          <label htmlFor="ip-table-search" className={formLabelClass}>
            Search postings
          </label>
          <input
            id="ip-table-search"
            type="search"
            className={cn(formInputClass, "mt-1.5 max-w-md")}
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Inspector, centre, scope, or notes…"
            disabled={examId == null}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <p className="text-sm font-medium text-foreground">Postings</p>
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {loadingPostings
              ? "Loading…"
              : tableSearch.trim()
                ? `${visibleRows.length} of ${rows.length}`
                : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          {loadingPostings && rows.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground sm:px-5">Loading postings…</p>
          ) : visibleRows.length === 0 ? (

            <div className="px-4 py-16 text-center sm:px-5">
              <p className="text-sm font-medium text-foreground">
                {rows.length === 0 ? "No postings yet" : "No postings match your search"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {rows.length === 0 && selectedExam
                  ? `Add a posting for ${formatExamLabel(selectedExam)} or use bulk upload below.`
                  : rows.length === 0
                    ? "Select an examination to get started."
                    : "Try a different search term."}
              </p>
              {rows.length === 0 && examId != null && centres != null ? (
                <button type="button" className={cn(btnPrimary, "mt-4")} onClick={() => openCreate()}>
                  Add posting
                </button>
              ) : null}
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 sm:px-5">Inspector</th>
                  <th className="px-4 py-3 sm:px-5">Centre</th>
                  <th className="px-4 py-3 sm:px-5">Scope</th>
                  <th className="hidden px-4 py-3 sm:table-cell sm:px-5">Notes</th>
                  <th className="px-4 py-3 text-right sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {visibleRows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/25">
                    <td className="px-4 py-3 sm:px-5">
                      <span className="font-medium text-foreground">{r.inspector_full_name}</span>
                      {r.inspector_phone_number ? (
                        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                          {r.inspector_phone_number}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <span className="text-foreground">{r.center_name}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{r.center_code}</span>
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <ScopeBadge scope={r.subject_scope} />
                    </td>
                    <td
                      className="hidden max-w-[12rem] truncate px-4 py-3 text-muted-foreground sm:table-cell sm:px-5"
                      title={r.notes ?? ""}
                    >
                      {r.notes ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <div className="inline-flex gap-1">
                        <button type="button" className={btnGhost} onClick={() => openEdit(r)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={cn(btnGhost, "text-destructive hover:bg-destructive/10")}
                          onClick={() => setDeleteRow(r)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {examId != null ? (
        <details className={cn(panelClass, "group")}>
          <summary
            className={cn(
              "cursor-pointer list-none px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden",
              inputFocusRing,
              "rounded-2xl",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Bulk upload</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Import inspectors and postings from Excel or CSV</p>
              </div>
              <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </div>
          </summary>
          <div className="space-y-4 border-t border-border px-4 pb-5 pt-2 sm:px-5">
            <p className="text-xs text-muted-foreground">
              Columns: phone_number, full_name, optional password; center_1/scope_1 … center_5/scope_5 (ALL, CORE,
              ELECTIVE). At least one centre+scope pair per row (center_1/scope_1 … center_5/scope_5).
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-md">
                <label className={formLabelClass} htmlFor="ip-bulk-file">
                  Spreadsheet file
                </label>
                <input
                  id="ip-bulk-file"
                  type="file"
                  accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className={cn(
                    formInputClass,
                    "file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground",
                  )}
                  disabled={bulkBusy}
                  onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <label className="flex w-full cursor-pointer items-center gap-2 text-sm text-foreground sm:w-auto">
                <input
                  type="checkbox"
                  checked={sendSmsOnBulk}
                  onChange={(e) => setSendSmsOnBulk(e.target.checked)}
                  className="size-4 rounded border-input-border"
                />
                Send SMS for new inspectors
              </label>
              <button type="button" className={btnPrimary} disabled={bulkBusy || !bulkFile} onClick={() => void onBulkUpload()}>
                {bulkBusy ? "Uploading…" : "Upload file"}
              </button>
            </div>
            {bulkError ? (
              <p className="text-sm text-destructive" role="alert">
                {bulkError}
              </p>
            ) : null}
            {bulkResult ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <p className="font-medium text-foreground">
                  {bulkResult.successful} succeeded · {bulkResult.failed} failed · {bulkResult.total_rows} rows
                </p>
                {bulkResult.errors.length > 0 ? (
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-destructive">
                    {bulkResult.errors.slice(0, 30).map((e) => (
                      <li key={`${e.row_number}-${e.error_message.slice(0, 24)}`}>
                        Row {e.row_number}: {e.error_message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}



      {createOpen ? (
        <Modal
          title="Add inspector posting"
          subtitle={selectedExam ? formatExamLabel(selectedExam) : undefined}
          titleId="admin-ip-create-title"
          onClose={closeModals}
          canClose={!submitting}
          wide
        >
          <form className="space-y-4" onSubmit={onCreateSubmit}>
            {formError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <SearchablePicker
              label="Inspector"
              hint="Search by name or phone number."
              searchId="ip-insp-q"
              searchPlaceholder="Name or phone"
              searchValue={inspectorQuery}
              onSearchChange={setInspectorQuery}
              loading={inspectorHitsLoading}
              items={inspectorHits}
              selectedId={inspId}
              onSelect={setInspId}
              renderItem={(u) => ({
                primary: u.full_name,
                secondary:
                  [u.phone_number, u.school_code ? `School ${u.school_code}` : null, u.school_name]
                    .filter(Boolean)
                    .join(" · ") || undefined,
              })}
              selectedLabel={selectedInspectorLabel}
              emptyMessage={inspectorQuery.trim() ? "No inspectors match." : "Type to search inspectors."}
            />
            <SearchablePicker
              label="Centre (host)"
              hint="Examination centre where this inspector is posted."
              searchId="ip-centre-q"
              searchPlaceholder="Name, code, or region"
              searchValue={centreFilterCreate}
              onSearchChange={setCentreFilterCreate}
              items={centrePickerItems}
              selectedId={centerId}
              onSelect={setCenterId}
              renderItem={(c) => ({
                primary: c.school.name,
                secondary: `${c.school.code} · ${c.school.region}`,
              })}
              selectedLabel={selectedCentreLabel}
              emptyMessage="No centres match. Try another search."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabelClass} htmlFor="ip-scope">
                  Subject scope
                </label>
                <select
                  id="ip-scope"
                  className={formInputClass}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ExamInspectorSubjectScopeApi)}
                  disabled={submitting}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formLabelClass} htmlFor="ip-notes">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="ip-notes"
                  className={formInputClass}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal note"
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" className={btnSecondary} onClick={closeModals} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className={btnPrimary} disabled={submitting}>
                {submitting ? "Creating…" : "Create posting"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editRow ? (
        <Modal
          title="Edit posting"
          subtitle={`${postingInspectorLabel(editRow)} · ${editRow.center_name}`}
          titleId="admin-ip-edit-title"
          onClose={closeModals}
          canClose={!submitting}
          wide
        >
          <form className="space-y-4" onSubmit={onEditSubmit}>
            {formError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <p className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              To assign a different inspector, delete this posting and create a new one.
            </p>
            <SearchablePicker
              label="Centre (host)"
              searchId="ip-edit-centre-q"
              searchPlaceholder="Name, code, or region"
              searchValue={centreFilterEdit}
              onSearchChange={setCentreFilterEdit}
              items={centrePickerItems}
              selectedId={centerId}
              onSelect={setCenterId}
              renderItem={(c) => ({
                primary: c.school.name,
                secondary: `${c.school.code} · ${c.school.region}`,
              })}
              selectedLabel={selectedCentreLabel}
              emptyMessage="No centres match. Try another search."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabelClass} htmlFor="ip-edit-scope">
                  Subject scope
                </label>
                <select
                  id="ip-edit-scope"
                  className={formInputClass}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ExamInspectorSubjectScopeApi)}
                  disabled={submitting}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formLabelClass} htmlFor="ip-edit-notes">
                  Notes
                </label>
                <input
                  id="ip-edit-notes"
                  className={formInputClass}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" className={btnSecondary} onClick={closeModals} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className={btnPrimary} disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteRow ? (
        <Modal
          title="Delete posting?"
          subtitle={postingInspectorLabel(deleteRow)}
          titleId="admin-ip-del-title"
          onClose={closeModals}
          canClose={!submitting}
        >
          <div className="space-y-3 text-sm text-foreground">
            <p>
              Remove <span className="font-medium">{deleteRow.center_name}</span> (
              <ScopeBadge scope={deleteRow.subject_scope} />) from this examination?
            </p>
            <p className="text-muted-foreground">This cannot be undone.</p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={closeModals} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className={btnDestructive} onClick={() => void confirmDelete()} disabled={submitting}>
              {submitting ? "Deleting…" : "Delete posting"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
