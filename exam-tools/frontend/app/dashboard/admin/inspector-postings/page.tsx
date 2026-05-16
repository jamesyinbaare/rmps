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
  type InspectorListResponse,
  type InspectorPostingBulkUploadResponse,
  type InspectorSchoolRow,
} from "@/lib/api";
import { formInputClass, formLabelClass, primaryButtonClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const outlineBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";

const SCOPES: ExamInspectorSubjectScopeApi[] = ["ALL", "CORE", "ELECTIVE"];

function Modal({
  title,
  titleId,
  children,
  onClose,
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg sm:max-w-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted ${inputFocusRing}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
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
  const [busy, setBusy] = useState(false);

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
      return;
    }
    setBusy(true);
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
      setBusy(false);
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
          const res = await apiJson<InspectorListResponse>(
            `/inspectors?limit=50&skip=0&sort=full_name&order=asc${
              q ? `&q=${encodeURIComponent(q)}` : ""
            }`,
          );
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

  const selectedInspectorLabel = useMemo(() => {
    if (!inspId) return null;
    const hit = inspectorHits.find((h) => h.id === inspId);
    if (hit) return `${hit.full_name} — ${hit.phone_number ?? "?"}`;
    return `User id ${inspId}`;
  }, [inspId, inspectorHits]);

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
    setBusy(true);
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
      setBusy(false);
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
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (examId == null || deleteRow == null) return;
    setBusy(true);
    try {
      await adminDeleteInspectorPosting(examId, deleteRow.id);
      closeModals();
      await reloadPostings();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Inspector postings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign inspectors to examination centre hosts with subject scope (All, Core, or Elective) for this
          examination. Use search below to find inspectors and centres quickly. Bulk upload: CSV or Excel with
          columns <span className="font-mono text-xs">phone_number</span>,{" "}
          <span className="font-mono text-xs">full_name</span>, optional{" "}
          <span className="font-mono text-xs">password</span> (required when creating the inspector),{" "}
          <span className="font-mono text-xs">core</span>, <span className="font-mono text-xs">elective</span> (host
          centre codes; at least one of core/elective per row). Entry points:{" "}
          <Link href="/dashboard/admin/examinations" className="font-medium text-primary hover:underline">
            Examinations
          </Link>
          ,{" "}
          <Link href="/dashboard/admin/examination-centres" className="font-medium text-primary hover:underline">
            Examination centres
          </Link>
          , or{" "}
          <Link href="/dashboard/admin/inspectors" className="font-medium text-primary hover:underline">
            Inspectors
          </Link>
          .
        </p>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48">
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
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => openCreate()}
          disabled={examId == null || busy || centres == null}
        >
          Add posting
        </button>
      </div>

      {examId != null ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-card-foreground">Bulk upload postings</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Creates inspector accounts if missing. Each row can set CORE and/or ELECTIVE host centre codes. Download the
            Excel template—the phone column is formatted as text so leading zeros are preserved. For uploads, phone cells
            are read as text (CSV/Excel). Re-download the template if you still see numbers without a leading zero.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className={formLabelClass} htmlFor="ip-bulk-file">
                File (CSV, XLSX, XLS)
              </label>
              <input
                id="ip-bulk-file"
                type="file"
                accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className={formInputClass}
                onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <button
              type="button"
              className={outlineBtn}
              disabled={examId == null}
              onClick={() => {
                if (examId == null) return;
                setBulkError(null);
                void downloadInspectorPostingsBulkTemplate(examId).catch((err: unknown) => {
                  setBulkError(err instanceof Error ? err.message : "Template download failed");
                });
              }}
            >
              Download template (Excel)
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={bulkBusy || !bulkFile}
              onClick={() => {
                void (async () => {
                  if (examId == null || !bulkFile) return;
                  setBulkBusy(true);
                  setBulkError(null);
                  setBulkResult(null);
                  try {
                    const res = await adminBulkUploadInspectorPostings(examId, bulkFile);
                    setBulkResult(res);
                    await reloadPostings();
                  } catch (err) {
                    setBulkError(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setBulkBusy(false);
                  }
                })();
              }}
            >
              {bulkBusy ? "Uploading…" : "Upload"}
            </button>
          </div>
          {bulkError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {bulkError}
            </p>
          ) : null}
          {bulkResult ? (
            <div className="mt-3 text-sm">
              <p className="text-foreground">
                Rows: {bulkResult.successful} succeeded, {bulkResult.failed} failed (of {bulkResult.total_rows}{" "}
                total).
              </p>
              {bulkResult.created_inspectors.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  New inspectors: {bulkResult.created_inspectors.length}
                </p>
              ) : null}
              {bulkResult.created_postings.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Postings created: {bulkResult.created_postings.length}
                </p>
              ) : null}
              {bulkResult.errors.length ? (
                <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-xs text-destructive">
                  {bulkResult.errors.slice(0, 30).map((e) => (
                    <li key={`${e.row_number}-${e.error_message.slice(0, 24)}`}>
                      Row {e.row_number}: {e.error_message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {filterInspectorUserId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Filtered by inspector{" "}
            <span className="font-mono text-xs text-foreground">{filterInspectorUserId}</span>
          </span>
          <button
            type="button"
            className={`rounded-md border border-input-border px-2 py-1 text-xs font-medium hover:bg-muted ${inputFocusRing}`}
            onClick={clearInspectorFilter}
          >
            Clear filter
          </button>
        </div>
      ) : null}

      {busy && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading postings…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No postings for this examination yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Inspector (user id)</th>
                <th className="px-3 py-2 font-medium">Centre</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">{r.inspector_user_id}</td>
                  <td className="px-3 py-2">
                    {r.center_name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">({r.center_code})</span>
                  </td>
                  <td className="px-3 py-2">{r.subject_scope}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground" title={r.notes ?? ""}>
                    {r.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`text-sm font-medium text-primary ${inputFocusRing} rounded-md px-2 py-1 hover:underline`}
                        onClick={() => openEdit(r)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`text-sm font-medium text-destructive ${inputFocusRing} rounded-md px-2 py-1 hover:underline`}
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
        </div>
      )}

      {createOpen ? (
        <Modal title="Add inspector posting" titleId="admin-ip-create-title" onClose={closeModals}>
          <form className="space-y-3" onSubmit={onCreateSubmit}>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <div>
              <label className={formLabelClass} htmlFor="ip-insp-q">
                Find inspector
              </label>
              <input
                id="ip-insp-q"
                type="search"
                className={formInputClass}
                value={inspectorQuery}
                onChange={(e) => setInspectorQuery(e.target.value)}
                placeholder="Name, phone, school code, or centre name"
                autoComplete="off"
              />
              {inspectorHitsLoading ? (
                <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
              ) : null}
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                {inspectorHits.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setInspId(u.id)}
                    className={`flex w-full flex-col items-start border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 ${
                      u.id === inspId ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="font-medium text-foreground">{u.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.phone_number ?? "—"} · {u.full_name}
                      {u.phone_number ? ` · ${u.phone_number}` : ""}
                    </span>
                  </button>
                ))}
              </div>
              {selectedInspectorLabel ? (
                <p className="mt-2 text-xs text-foreground">
                  <span className="font-medium">Selected:</span> {selectedInspectorLabel}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Select an inspector from the list above.</p>
              )}
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ip-centre-q">
                Centre (host) — filter list
              </label>
              <input
                id="ip-centre-q"
                type="search"
                className={formInputClass}
                value={centreFilterCreate}
                onChange={(e) => setCentreFilterCreate(e.target.value)}
                placeholder="Name, code, or region"
                autoComplete="off"
              />
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                {filteredCentresCreate.map((c) => (
                  <button
                    key={c.school.id}
                    type="button"
                    onClick={() => setCenterId(c.school.id)}
                    className={`flex w-full flex-col items-start border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 ${
                      c.school.id === centerId ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="font-medium text-foreground">{c.school.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.school.code} · {c.school.region}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ip-scope">
                Subject scope
              </label>
              <select
                id="ip-scope"
                className={formInputClass}
                value={scope}
                onChange={(e) => setScope(e.target.value as ExamInspectorSubjectScopeApi)}
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
                Notes (optional)
              </label>
              <input
                id="ip-notes"
                className={formInputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={outlineBtn} onClick={closeModals}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass} disabled={busy}>
                Create
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editRow ? (
        <Modal title="Edit posting" titleId="admin-ip-edit-title" onClose={closeModals}>
          <form className="space-y-3" onSubmit={onEditSubmit}>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Inspector: <span className="font-mono">{editRow.inspector_user_id}</span> (to change inspector, delete and
              recreate)
            </p>
            <div>
              <label className={formLabelClass} htmlFor="ip-edit-centre-q">
                Centre (host) — filter list
              </label>
              <input
                id="ip-edit-centre-q"
                type="search"
                className={formInputClass}
                value={centreFilterEdit}
                onChange={(e) => setCentreFilterEdit(e.target.value)}
                placeholder="Name, code, or region"
                autoComplete="off"
              />
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border">
                {filteredCentresEdit.map((c) => (
                  <button
                    key={c.school.id}
                    type="button"
                    onClick={() => setCenterId(c.school.id)}
                    className={`flex w-full flex-col items-start border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50 ${
                      c.school.id === centerId ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="font-medium text-foreground">{c.school.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.school.code} · {c.school.region}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ip-edit-scope">
                Subject scope
              </label>
              <select
                id="ip-edit-scope"
                className={formInputClass}
                value={scope}
                onChange={(e) => setScope(e.target.value as ExamInspectorSubjectScopeApi)}
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
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={outlineBtn} onClick={closeModals}>
                Cancel
              </button>
              <button type="submit" className={primaryButtonClass} disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteRow ? (
        <Modal title="Delete posting" titleId="admin-ip-del-title" onClose={closeModals}>
          <p className="text-sm text-foreground">
            Remove this posting for centre {deleteRow.center_name} ({deleteRow.subject_scope})? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={outlineBtn} onClick={closeModals}>
              Cancel
            </button>
            <button
              type="button"
              className={`${primaryButtonClass} border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20`}
              onClick={() => void confirmDelete()}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
