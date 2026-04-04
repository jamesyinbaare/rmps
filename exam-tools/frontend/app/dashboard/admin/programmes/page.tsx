"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  apiFetch,
  apiJson,
  downloadApiFile,
  type Programme,
  type ProgrammeBulkUploadResponse,
  type ProgrammeListResponse,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 20;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function Modal({
  title,
  titleId,
  children,
  onClose,
  panelClassName = "max-w-lg",
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
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
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg ${panelClassName}`}
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

export default function AdminProgrammesPage() {
  const [data, setData] = useState<ProgrammeListResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: PAGE_SIZE,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editProgramme, setEditProgramme] = useState<Programme | null>(null);
  const [deleteProgramme, setDeleteProgramme] = useState<Programme | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<ProgrammeBulkUploadResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await apiJson<ProgrammeListResponse>(
        `/programmes?page=${page}&page_size=${PAGE_SIZE}`,
      );
      setData(result);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load programmes");
      setData({
        items: [],
        total: 0,
        page: 1,
        page_size: PAGE_SIZE,
        total_pages: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower
    ? data.items.filter(
        (p) =>
          p.code.toLowerCase().includes(searchLower) || p.name.toLowerCase().includes(searchLower),
      )
    : data.items;

  function openCreate() {
    setCode("");
    setName("");
    setFormError(null);
    setCreateOpen(true);
  }

  function openEdit(p: Programme) {
    setEditProgramme(p);
    setCode(p.code);
    setName(p.name);
    setFormError(null);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!code.trim() || !name.trim()) {
      setFormError("Code and name are required.");
      return;
    }
    setSubmitting(true);
    try {
      await apiJson("/programmes", {
        method: "POST",
        body: JSON.stringify({ code: code.trim(), name: name.trim() }),
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProgramme) return;
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: { name: string; code?: string } = { name: name.trim() };
      if (code.trim() !== editProgramme.code) body.code = code.trim();
      await apiJson(`/programmes/${editProgramme.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setEditProgramme(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteProgramme) return;
    setSubmitting(true);
    try {
      await apiJson(`/programmes/${deleteProgramme.id}`, { method: "DELETE" });
      setDeleteProgramme(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploadResult(null);
    if (!uploadFile) {
      setUploadError("Choose a file.");
      return;
    }
    const body = new FormData();
    body.append("file", uploadFile);
    setUploadBusy(true);
    try {
      const res = await apiFetch("/programmes/bulk-upload", { method: "POST", body });
      const result = (await res.json()) as ProgrammeBulkUploadResponse;
      setUploadResult(result);
      setUploadFile(null);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  const totalPages = data.total_pages || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Programmes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage programme catalogue and subject links per programme.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadApiFile("/programmes/template", "programme_upload_template.xlsx")}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium ${inputFocusRing}`}
          >
            Template
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadOpen(true);
              setUploadError(null);
              setUploadResult(null);
              setUploadFile(null);
            }}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium ${inputFocusRing}`}
          >
            Bulk upload
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Add programme
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="prog-search" className={formLabelClass}>
          Search (current page)
        </label>
        <input
          id="prog-search"
          className={formInputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Code or name"
        />
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 font-medium text-card-foreground">Code</th>
              <th className="px-4 py-3 font-medium text-card-foreground">Name</th>
              <th className="px-4 py-3 font-medium text-card-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No programmes found.
                </td>
              </tr>
            ) : (
              filteredItems.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-card-foreground">{p.code}</td>
                  <td className="px-4 py-3 text-card-foreground">{p.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/admin/programmes/${p.id}`}
                        className={`text-sm font-medium text-primary underline-offset-4 hover:underline ${inputFocusRing} rounded`}
                      >
                        Subjects
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className={`text-sm font-medium text-card-foreground underline-offset-4 hover:underline ${inputFocusRing} rounded`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteProgramme(p)}
                        className={`text-sm font-medium text-destructive underline-offset-4 hover:underline ${inputFocusRing} rounded`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Total {data.total} · Page {data.page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`rounded-lg border border-input-border px-3 py-2 text-sm disabled:opacity-50 ${inputFocusRing}`}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className={`rounded-lg border border-input-border px-3 py-2 text-sm disabled:opacity-50 ${inputFocusRing}`}
          >
            Next
          </button>
        </div>
      </div>

      {createOpen ? (
        <Modal title="New programme" titleId="create-prog-title" onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitCreate} className="space-y-4">
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div>
              <label htmlFor="np-code" className={formLabelClass}>
                Code
              </label>
              <input
                id="np-code"
                className={formInputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={50}
              />
            </div>
            <div>
              <label htmlFor="np-name" className={formLabelClass}>
                Name
              </label>
              <input
                id="np-name"
                className={formInputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Create"}
            </button>
          </form>
        </Modal>
      ) : null}

      {editProgramme ? (
        <Modal title="Edit programme" titleId="edit-prog-title" onClose={() => setEditProgramme(null)}>
          <form onSubmit={submitEdit} className="space-y-4">
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div>
              <label htmlFor="ep-code" className={formLabelClass}>
                Code
              </label>
              <input
                id="ep-code"
                className={formInputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={50}
              />
            </div>
            <div>
              <label htmlFor="ep-name" className={formLabelClass}>
                Name
              </label>
              <input
                id="ep-name"
                className={formInputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </form>
        </Modal>
      ) : null}

      {deleteProgramme ? (
        <Modal title="Delete programme" titleId="del-prog-title" onClose={() => setDeleteProgramme(null)}>
          <p className="text-sm text-card-foreground">
            Delete <strong>{deleteProgramme.code}</strong> — {deleteProgramme.name}?
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setDeleteProgramme(null)}
              className={`flex-1 rounded-lg border border-input-border py-2.5 text-sm ${inputFocusRing}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={submitting}
              className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </Modal>
      ) : null}

      {uploadOpen ? (
        <Modal title="Bulk upload programmes" titleId="up-prog-title" onClose={() => setUploadOpen(false)}>
          <form onSubmit={submitUpload} className="space-y-4">
            {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            <button
              type="submit"
              disabled={uploadBusy}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploadBusy ? "Uploading…" : "Upload"}
            </button>
            {uploadResult ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p>
                  Rows: {uploadResult.total_rows} · OK: {uploadResult.successful} · Failed:{" "}
                  {uploadResult.failed}
                </p>
                {uploadResult.errors.length > 0 ? (
                  <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-destructive">
                    {uploadResult.errors.slice(0, 20).map((er, i) => (
                      <li key={i}>
                        Row {er.row_number}: {er.error_message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
