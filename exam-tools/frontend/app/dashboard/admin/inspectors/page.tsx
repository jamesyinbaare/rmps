"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  adminDeleteInspector,
  adminResetInspectorPassword,
  adminUpdateInspector,
  apiFetch,
  apiJson,
  listInspectors,
  type Examination,
  inspectorSmsStatusMessage,
  type ExamInspectorSubjectScopeApi,
  type InspectorBulkUploadResponse,
  type InspectorCreatePayload,
  type InspectorCreatedResponse,
  type InspectorPostingTargetPayload,
  type InspectorSchoolRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 20;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const btnPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${inputFocusRing}`;
const btnSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 ${inputFocusRing}`;
const btnDestructive = `inline-flex min-h-11 items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 px-4 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-60 ${inputFocusRing}`;

type SortField = "full_name" | "phone" | "school_code";
type StatusFilter = "all" | "active" | "inactive";

type ExtraInspectorPosting = { centerCode: string; scope: ExamInspectorSubjectScopeApi };

function buildInspectorPostingsFromForm(
  coreTrim: string,
  electTrim: string,
  extras: ExtraInspectorPosting[],
): InspectorPostingTargetPayload[] {
  const postings: InspectorPostingTargetPayload[] = [];
  if (coreTrim && electTrim && coreTrim === electTrim) {
    postings.push({ center_code: coreTrim, subject_scope: "ALL" });
  } else {
    if (coreTrim) postings.push({ center_code: coreTrim, subject_scope: "CORE" });
    if (electTrim) postings.push({ center_code: electTrim, subject_scope: "ELECTIVE" });
  }
  for (const ex of extras) {
    const c = ex.centerCode.trim();
    if (c) postings.push({ center_code: c, subject_scope: ex.scope });
  }
  return postings;
}

function Modal({
  title,
  titleId,
  children,
  onClose,
  canClose = true,
  panelClassName = "max-w-lg",
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  canClose?: boolean;
  panelClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={() => canClose && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg ${panelClassName}`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 ${inputFocusRing}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function SortTh({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentOrder: "asc" | "desc";
  onSort: (f: SortField) => void;
}) {
  const active = currentSort === field;
  return (
    <th
      className="px-3 py-3 font-medium"
      aria-sort={
        active ? (currentOrder === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 text-left hover:text-foreground ${inputFocusRing} rounded`}
      >
        {label}
        {active ? (currentOrder === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
          : "inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function AdminInspectorsPage() {
  const [items, setItems] = useState<InspectorSchoolRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortField>("full_name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [examId, setExamId] = useState<number | "">("");
  const [coreCode, setCoreCode] = useState("");
  const [electiveCode, setElectiveCode] = useState("");
  const [extraPostings, setExtraPostings] = useState<ExtraInspectorPosting[]>([]);
  const [exams, setExams] = useState<Examination[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendSmsOnCreate, setSendSmsOnCreate] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [sendSmsOnBulk, setSendSmsOnBulk] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<InspectorBulkUploadResponse | null>(null);

  const [resetTarget, setResetTarget] = useState<InspectorSchoolRow | null>(null);
  const [resetMode, setResetMode] = useState<"auto" | "manual">("auto");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetGeneratedPassword, setResetGeneratedPassword] = useState<string | null>(null);
  const [sendSmsOnReset, setSendSmsOnReset] = useState(true);
  const [toggleTarget, setToggleTarget] = useState<InspectorSchoolRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectorSchoolRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!addOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (!cancelled) {
          setExams(list);
          setExamId((prev) => {
            if (prev !== "") return prev;
            return list.length ? list[0].id : "";
          });
        }
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addOpen]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort, order, statusFilter]);

  useEffect(() => {
    if (!openActionsId) return;
    function onDocClick(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setOpenActionsId(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openActionsId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const skip = (page - 1) * PAGE_SIZE;
    try {
      const data = await listInspectors({
        skip,
        limit: PAGE_SIZE,
        sort,
        order,
        q: debouncedSearch || null,
        is_active: statusFilter === "all" ? null : statusFilter === "active",
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load inspectors");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort, order, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSort(field: SortField) {
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("asc");
    }
  }

  function openAdd() {
    setPhone("");
    setFullName("");
    setPassword("");
    setExamId("");
    setCoreCode("");
    setElectiveCode("");
    setExtraPostings([]);
    setFormError(null);
    setAddOpen(true);
  }

  function openUpload() {
    setUploadError(null);
    setUploadResult(null);
    setFile(null);
    setUploadOpen(true);
  }

  async function submitAdd() {
    setFormError(null);
    const pn = phone.trim();
    const fn = fullName.trim();
    const pw = password;
    if (!pn || !fn || !pw) {
      setFormError("Phone number, full name, and password are required.");
      return;
    }
    const coreTrim = coreCode.trim();
    const electTrim = electiveCode.trim();
    const postings = buildInspectorPostingsFromForm(coreTrim, electTrim, extraPostings);
    if (examId !== "" && postings.length === 0) {
      setFormError(
        "When an examination is selected, add at least one centre posting (core/elective codes or additional centres).",
      );
      return;
    }
    if (postings.length > 0 && examId === "") {
      setFormError("Select an examination when adding centre postings.");
      return;
    }
    const payload: InspectorCreatePayload = {
      phone_number: pn,
      full_name: fn,
      password: pw,
      send_sms: sendSmsOnCreate,
    };
    if (examId !== "" && postings.length > 0) {
      payload.examination_id = examId;
      payload.postings = postings;
    }
    setSubmitting(true);
    try {
      const created = await apiJson<InspectorCreatedResponse>("/inspectors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAddOpen(false);
      const smsNote = inspectorSmsStatusMessage(created.sms_sent, created.sms_error);
      setActionSuccess(smsNote ? `Inspector created. ${smsNote}` : "Inspector created.");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create inspector");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploadResult(null);
    if (!file) {
      setUploadError("Choose a CSV or Excel file.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    setUploadBusy(true);
    try {
      const bulkQs = sendSmsOnBulk ? "?send_sms=true" : "";
      const res = await apiFetch(`/inspectors/bulk-upload${bulkQs}`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as InspectorBulkUploadResponse;
      setUploadResult(data);
      setFile(null);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  function closeResetModal() {
    setResetTarget(null);
    setResetGeneratedPassword(null);
    setResetMode("auto");
    setResetPassword("");
    setResetConfirm("");
    setResetError(null);
  }

  async function copyResetGeneratedPassword() {
    if (!resetGeneratedPassword) return;
    try {
      await navigator.clipboard.writeText(resetGeneratedPassword);
      setActionSuccess("Password copied to clipboard.");
    } catch {
      setActionSuccess("Copy manually — clipboard access was denied.");
    }
  }

  async function confirmReset() {
    if (!resetTarget) return;
    if (resetMode === "manual") {
      if (resetPassword.length < 8) {
        setResetError("Password must be at least 8 characters.");
        return;
      }
      if (resetPassword !== resetConfirm) {
        setResetError("Passwords do not match.");
        return;
      }
    }
    setResetError(null);
    setResetGeneratedPassword(null);
    setActionBusy(true);
    const inspectorName = resetTarget.full_name;
    try {
      const resetRes = await adminResetInspectorPassword(resetTarget.id, {
        mode: resetMode,
        new_password: resetMode === "manual" ? resetPassword : undefined,
        send_sms: sendSmsOnReset,
      });
      const smsNote = inspectorSmsStatusMessage(resetRes.sms_sent, resetRes.sms_error);
      if (resetMode === "auto" && resetRes.generated_password) {
        setResetGeneratedPassword(resetRes.generated_password);
        setActionSuccess(
          smsNote
            ? `Password reset for ${inspectorName}. ${smsNote} Copy the password below.`
            : `Password reset for ${inspectorName}. Copy the password below — shown only once.`,
        );
      } else {
        closeResetModal();
        setActionSuccess(
          smsNote
            ? `Password reset for ${inspectorName}. ${smsNote}`
            : `Password reset for ${inspectorName}.`,
        );
      }
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmToggle() {
    if (!toggleTarget) return;
    setActionBusy(true);
    setLoadError(null);
    try {
      await adminUpdateInspector(toggleTarget.id, { is_active: !toggleTarget.is_active });
      const verb = toggleTarget.is_active ? "deactivated" : "reactivated";
      setToggleTarget(null);
      setActionSuccess(`${toggleTarget.full_name} ${verb}.`);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionBusy(true);
    setLoadError(null);
    try {
      await adminDeleteInspector(deleteTarget.id);
      const name = deleteTarget.full_name;
      setDeleteTarget(null);
      setActionSuccess(`${name} deleted.`);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const colSpan = 5;

  return (
    <div className="space-y-8">
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Create inspectors together with depot keepers and test admin officers on the{" "}
        <Link href="/dashboard/admin/users#inspectors" className="font-medium text-primary hover:underline">
          Users
        </Link>{" "}
        page, or use the buttons below for this list and bulk upload.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Inspectors</h2>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={openAdd}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover ${inputFocusRing}`}
          >
            Add inspector
          </button>
          <button
            type="button"
            onClick={openUpload}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted ${inputFocusRing}`}
          >
            Upload
          </button>
          <Link
            href="/dashboard/admin/sms-deliveries"
            className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted ${inputFocusRing}`}
          >
            SMS failures
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="inspector-search" className={formLabelClass}>
              Search (name or phone)
            </label>
            <input
              id="inspector-search"
              className={formInputClass}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Type to filter…"
            />
          </div>
          <div>
            <label htmlFor="inspector-status" className={formLabelClass}>
              Status
            </label>
            <select
              id="inspector-status"
              className={formInputClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

      {actionSuccess ? (
        <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success" role="status">
          {actionSuccess}
          <button
            type="button"
            className="ml-3 text-xs font-medium underline"
            onClick={() => setActionSuccess(null)}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <SortTh
                label="Full name"
                field="full_name"
                currentSort={sort}
                currentOrder={order}
                onSort={handleSort}
              />
              <SortTh
                label="Phone"
                field="phone"
                currentSort={sort}
                currentOrder={order}
                onSort={handleSort}
              />
              <SortTh
                label="School code"
                field="school_code"
                currentSort={sort}
                currentOrder={order}
                onSort={handleSort}
              />
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
                  No inspectors match your search.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3">{row.full_name}</td>
                  <td className="px-3 py-3 font-mono text-xs">{row.phone_number ?? "—"}</td>
                  <td className="px-3 py-3 font-mono text-xs">{row.school_code ?? "—"}</td>
                  <td className="px-3 py-3">
                    <StatusBadge active={row.is_active} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/admin/inspector-postings?inspectorUserId=${encodeURIComponent(row.id)}`}
                        className={`text-sm font-medium text-primary hover:underline ${inputFocusRing} rounded px-1 py-0.5`}
                      >
                        Postings
                      </Link>
                      <div className="relative" ref={openActionsId === row.id ? actionsMenuRef : undefined}>
                        <button
                          type="button"
                          disabled={actionBusy}
                          className={`min-h-9 rounded-lg border border-input-border px-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
                          onClick={() =>
                            setOpenActionsId((cur) => (cur === row.id ? null : row.id))
                          }
                          aria-expanded={openActionsId === row.id}
                          aria-haspopup="menu"
                        >
                          More
                        </button>
                        {openActionsId === row.id ? (
                          <div
                            role="menu"
                            className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border bg-card py-1 shadow-lg"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setResetMode("auto");
                                setResetPassword("");
                                setResetConfirm("");
                                setResetError(null);
                                setResetGeneratedPassword(null);
                                setResetTarget(row);
                                setOpenActionsId(null);
                              }}
                            >
                              Reset password
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setToggleTarget(row);
                                setOpenActionsId(null);
                              }}
                            >
                              {row.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setDeleteTarget(row);
                                setOpenActionsId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} inspector{total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <Modal
          title="Add inspector"
          titleId="add-inspector-modal-title"
          panelClassName="max-w-xl"
          onClose={() => !submitting && setAddOpen(false)}
          canClose={!submitting}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="add-phone" className={formLabelClass}>
                Phone number
              </label>
              <input
                id="add-phone"
                className={formInputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="add-full-name" className={formLabelClass}>
                Full name
              </label>
              <input
                id="add-full-name"
                className={formInputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="add-password" className={formLabelClass}>
                Password
              </label>
              <input
                id="add-password"
                type="password"
                className={formInputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="add-exam" className={formLabelClass}>
                Examination (optional postings)
              </label>
              <select
                id="add-exam"
                className={formInputClass}
                value={examId === "" ? "" : String(examId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setExamId(v === "" ? "" : parseInt(v, 10));
                }}
              >
                <option value="">No postings — assign later</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.year} {ex.exam_type}
                    {ex.exam_series ? ` (${ex.exam_series})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="add-core" className={formLabelClass}>
                Core centre code
              </label>
              <input
                id="add-core"
                className={formInputClass}
                value={coreCode}
                onChange={(e) => setCoreCode(e.target.value)}
                placeholder="Host centre code (optional)"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="add-elective" className={formLabelClass}>
                Elective centre code
              </label>
              <input
                id="add-elective"
                className={formInputClass}
                value={electiveCode}
                onChange={(e) => setElectiveCode(e.target.value)}
                placeholder="Host centre code (optional)"
                autoComplete="off"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={sendSmsOnCreate}
                onChange={(e) => setSendSmsOnCreate(e.target.checked)}
                className="size-4 rounded border-input-border"
              />
              Send login details by SMS
            </label>
            {examId !== "" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Each centre can have its own scope (ALL, CORE, or ELECTIVE). The same scope may be used at multiple
                  centres. Matching core and elective codes create one ALL posting at that centre.
                </p>
                {extraPostings.map((row, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <div>
                      <label className={formLabelClass}>Centre code</label>
                      <input
                        className={formInputClass}
                        value={row.centerCode}
                        onChange={(e) => {
                          const next = [...extraPostings];
                          next[idx] = { ...row, centerCode: e.target.value };
                          setExtraPostings(next);
                        }}
                        placeholder="Host centre code"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className={formLabelClass}>Scope</label>
                      <select
                        className={formInputClass}
                        value={row.scope}
                        onChange={(e) => {
                          const next = [...extraPostings];
                          next[idx] = {
                            ...row,
                            scope: e.target.value as ExamInspectorSubjectScopeApi,
                          };
                          setExtraPostings(next);
                        }}
                      >
                        <option value="ALL">ALL</option>
                        <option value="CORE">CORE</option>
                        <option value="ELECTIVE">ELECTIVE</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className={`min-h-11 rounded-lg border border-input-border px-3 text-sm hover:bg-muted ${inputFocusRing}`}
                      onClick={() => setExtraPostings(extraPostings.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={`text-sm font-medium text-primary hover:underline ${inputFocusRing}`}
                  onClick={() =>
                    setExtraPostings([...extraPostings, { centerCode: "", scope: "CORE" }])
                  }
                >
                  Add another centre
                </button>
              </div>
            ) : null}
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={submitAdd}
                className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Create inspector"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setAddOpen(false)}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm hover:bg-muted ${inputFocusRing}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {uploadOpen ? (
        <Modal
          title="Upload inspectors"
          titleId="upload-inspectors-modal-title"
          panelClassName="max-w-xl"
          onClose={() => !uploadBusy && setUploadOpen(false)}
          canClose={!uploadBusy}
        >
          <p className="text-sm text-muted-foreground">
            Required columns:{" "}
            <code className="rounded bg-muted px-1">phone_number</code>,{" "}
            <code className="rounded bg-muted px-1">full_name</code>,{" "}
            <code className="rounded bg-muted px-1">password</code>. Phone numbers must be unique among inspectors.
          </p>
          <form onSubmit={onUpload} className="mt-4">
            <label htmlFor="inspector-bulk-file" className={formLabelClass}>
              File (CSV, XLSX, XLS)
            </label>
            <input
              id="inspector-bulk-file"
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              disabled={uploadBusy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`mt-2 block w-full text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground ${inputFocusRing}`}
            />
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={sendSmsOnBulk}
                onChange={(e) => setSendSmsOnBulk(e.target.checked)}
                className="size-4 rounded border-input-border"
              />
              Send login details by SMS for each created inspector
            </label>
            {uploadError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {uploadError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={uploadBusy}
                className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {uploadBusy ? "Uploading…" : "Upload and import"}
              </button>
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => setUploadOpen(false)}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm hover:bg-muted ${inputFocusRing}`}
              >
                Close
              </button>
            </div>
          </form>

          {uploadResult ? (
            <div className="mt-6 space-y-3 border-t border-border pt-6">
              <p className="text-sm font-medium text-card-foreground">Results</p>
              <ul className="flex flex-wrap gap-4 text-sm">
                <li>
                  Rows: <strong>{uploadResult.total_rows}</strong>
                </li>
                <li>
                  Created:{" "}
                  <strong className="text-success">{uploadResult.successful}</strong>
                </li>
                <li>
                  Failed:{" "}
                  <strong className="text-destructive">{uploadResult.failed}</strong>
                </li>
              </ul>
              {uploadResult.errors.length > 0 ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  {uploadResult.errors.map((err, i) => (
                    <li key={`${err.row_number}-${i}`}>
                      Row {err.row_number}: {err.error_message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {uploadResult.created.some((r) => r.sms_sent === false) ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  {uploadResult.created
                    .filter((r) => r.sms_sent === false)
                    .map((r) => (
                      <li key={r.row_number}>
                        Row {r.row_number} ({r.phone_number}): SMS failed
                        {r.sms_error ? ` — ${r.sms_error}` : ""}
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {resetTarget ? (
        <Modal
          title={`Reset password — ${resetTarget.full_name}`}
          titleId="reset-inspector-password-title"
          onClose={() => !actionBusy && closeResetModal()}
          canClose={!actionBusy}
        >
          <div className="space-y-4">
            {resetGeneratedPassword ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">Generated password (copy now)</p>
                <p className="mt-2 font-mono text-lg tracking-wide">{resetGeneratedPassword}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={() => void copyResetGeneratedPassword()}>
                    Copy password
                  </button>
                  <button type="button" className={btnSecondary} onClick={closeResetModal}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="reset-mode"
                    checked={resetMode === "auto"}
                    onChange={() => setResetMode("auto")}
                  />
                  Auto-generate password (8 characters: a–z, A–Z, 0–9)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="reset-mode"
                    checked={resetMode === "manual"}
                    onChange={() => setResetMode("manual")}
                  />
                  Enter password manually
                </label>
                {resetMode === "manual" ? (
                  <>
                    <div>
                      <label htmlFor="reset-password" className={formLabelClass}>
                        New password
                      </label>
                      <input
                        id="reset-password"
                        type="password"
                        className={formInputClass}
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label htmlFor="reset-confirm" className={formLabelClass}>
                        Confirm password
                      </label>
                      <input
                        id="reset-confirm"
                        type="password"
                        className={formInputClass}
                        value={resetConfirm}
                        onChange={(e) => setResetConfirm(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={sendSmsOnReset}
                    onChange={(e) => setSendSmsOnReset(e.target.checked)}
                    className="size-4 rounded border-input-border"
                  />
                  Send new password by SMS
                </label>
              </>
            )}
            {resetError ? (
              <p className="text-sm text-destructive" role="alert">
                {resetError}
              </p>
            ) : null}
            {!resetGeneratedPassword ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={actionBusy} onClick={() => void confirmReset()}>
                  {actionBusy ? "Resetting…" : "Reset password"}
                </button>
                <button type="button" className={btnSecondary} disabled={actionBusy} onClick={closeResetModal}>
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {toggleTarget ? (
        <Modal
          title={toggleTarget.is_active ? "Deactivate inspector" : "Reactivate inspector"}
          titleId="toggle-inspector-title"
          onClose={() => !actionBusy && setToggleTarget(null)}
          canClose={!actionBusy}
        >
          <p className="text-sm text-foreground">
            {toggleTarget.is_active
              ? `Deactivate ${toggleTarget.full_name}? They will not be able to sign in until reactivated.`
              : `Reactivate ${toggleTarget.full_name}? They will be able to sign in again.`}
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={btnSecondary} disabled={actionBusy} onClick={() => setToggleTarget(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} disabled={actionBusy} onClick={() => void confirmToggle()}>
              {actionBusy ? "Saving…" : toggleTarget.is_active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <Modal
          title="Delete inspector"
          titleId="delete-inspector-title"
          onClose={() => !actionBusy && setDeleteTarget(null)}
          canClose={!actionBusy}
        >
          <p className="text-sm text-foreground">
            Permanently delete <strong>{deleteTarget.full_name}</strong> and all examination postings for this
            inspector? This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={btnSecondary} disabled={actionBusy} onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button type="button" className={btnDestructive} disabled={actionBusy} onClick={() => void confirmDelete()}>
              {actionBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
