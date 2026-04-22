"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  apiFetch,
  apiJson,
  type InspectorBulkUploadResponse,
  type InspectorCreatePayload,
  type InspectorListResponse,
  type InspectorSchoolRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 20;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type SortField = "center" | "full_name" | "phone" | "school_code";

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

export default function AdminInspectorsPage() {
  const [items, setItems] = useState<InspectorSchoolRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortField>("full_name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [schoolCode, setSchoolCode] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<InspectorBulkUploadResponse | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort, order]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const skip = (page - 1) * PAGE_SIZE;
    const q = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
    try {
      const data = await apiJson<InspectorListResponse>(
        `/inspectors?skip=${skip}&limit=${PAGE_SIZE}&sort=${sort}&order=${order}${q}`,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load inspectors");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort, order]);

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
    setSchoolCode("");
    setPhone("");
    setFullName("");
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
    const sc = schoolCode.trim();
    const pn = phone.trim();
    const fn = fullName.trim();
    if (!sc || !pn || !fn) {
      setFormError("School code, phone number, and full name are required.");
      return;
    }
    const payload: InspectorCreatePayload = {
      school_code: sc,
      phone_number: pn,
      full_name: fn,
    };
    setSubmitting(true);
    try {
      await apiJson("/inspectors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAddOpen(false);
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
      const res = await apiFetch("/inspectors/bulk-upload", {
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        </div>
      </div>

      <div>
        <label htmlFor="inspector-search" className={formLabelClass}>
          Search (name, phone, school code, or centre name)
        </label>
        <input
          id="inspector-search"
          className={formInputClass}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Type to filter…"
        />
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <SortTh
                label="Centre (school)"
                field="center"
                currentSort={sort}
                currentOrder={order}
                onSort={handleSort}
              />
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No inspectors match your search.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="max-w-[220px] px-3 py-3">
                    <span className="font-medium text-foreground">{row.school_name}</span>
                  </td>
                  <td className="px-3 py-3">{row.full_name}</td>
                  <td className="px-3 py-3 font-mono text-xs">{row.phone_number ?? "—"}</td>
                  <td className="px-3 py-3 font-mono text-xs">{row.school_code ?? "—"}</td>
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
          onClose={() => !submitting && setAddOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="add-school-code" className={formLabelClass}>
                School code
              </label>
              <input
                id="add-school-code"
                className={formInputClass}
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                autoComplete="off"
              />
            </div>
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
        >
          <p className="text-sm text-muted-foreground">
            Required columns:{" "}
            <code className="rounded bg-muted px-1">school_code</code>,{" "}
            <code className="rounded bg-muted px-1">phone_number</code>,{" "}
            <code className="rounded bg-muted px-1">full_name</code>. Schools must already exist.
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
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
