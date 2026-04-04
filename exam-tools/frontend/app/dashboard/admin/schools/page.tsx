"use client";

import { useCallback, useEffect, useState } from "react";

import {
  apiFetch,
  apiJson,
  type School,
  type SchoolBulkUploadResponse,
  type SchoolCreatedResponse,
  type SchoolCreatePayload,
  type SchoolListResponse,
  type SchoolUpdatePayload,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { REGION_OPTIONS, SCHOOL_TYPE_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";

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

function SchoolFormFields({
  code,
  setCode,
  name,
  setName,
  region,
  setRegion,
  zone,
  setZone,
  schoolType,
  setSchoolType,
  pec,
  setPec,
  writesAtId,
  setWritesAtId,
  showCode,
}: {
  code: string;
  setCode: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  zone: string;
  setZone: (v: string) => void;
  schoolType: string;
  setSchoolType: (v: string) => void;
  pec: boolean;
  setPec: (v: boolean) => void;
  writesAtId: string;
  setWritesAtId: (v: string) => void;
  showCode: boolean;
}) {
  return (
    <div className="space-y-4">
      {showCode ? (
        <div>
          <label htmlFor="school-code" className={formLabelClass}>
            School code (6 characters)
          </label>
          <input
            id="school-code"
            className={formInputClass}
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="school-name" className={formLabelClass}>
          Name
        </label>
        <input
          id="school-name"
          className={formInputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="school-region" className={formLabelClass}>
          Region
        </label>
        <select
          id="school-region"
          className={formInputClass}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">Select region</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="school-zone" className={formLabelClass}>
          Zone
        </label>
        <select
          id="school-zone"
          className={formInputClass}
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="">Select zone</option>
          {ZONE_OPTIONS.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="school-type" className={formLabelClass}>
          School type (optional)
        </label>
        <select
          id="school-type"
          className={formInputClass}
          value={schoolType}
          onChange={(e) => setSchoolType(e.target.value)}
        >
          <option value="">Not set</option>
          {SCHOOL_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="school-pec"
          type="checkbox"
          checked={pec}
          onChange={(e) => setPec(e.target.checked)}
          className="size-4 rounded border-input-border"
        />
        <label htmlFor="school-pec" className={`${formLabelClass} mt-0`}>
          Private examination center
        </label>
      </div>
      <div>
        <label htmlFor="writes-at" className={formLabelClass}>
          Writes at center (host school UUID, optional)
        </label>
        <input
          id="writes-at"
          className={formInputClass}
          placeholder="Leave empty if none"
          value={writesAtId}
          onChange={(e) => setWritesAtId(e.target.value.trim())}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

export default function AdminSchoolsPage() {
  const [items, setItems] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editSchool, setEditSchool] = useState<School | null>(null);
  const [deleteSchool, setDeleteSchool] = useState<School | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [pec, setPec] = useState(false);
  const [writesAtId, setWritesAtId] = useState("");

  const [createdInfo, setCreatedInfo] = useState<SchoolCreatedResponse | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<SchoolBulkUploadResponse | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const skip = (page - 1) * PAGE_SIZE;
    const q = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
    try {
      const data = await apiJson<SchoolListResponse>(
        `/schools?skip=${skip}&limit=${PAGE_SIZE}${q}`,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load schools");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setCode("");
    setName("");
    setRegion("");
    setZone("");
    setSchoolType("");
    setPec(false);
    setWritesAtId("");
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openUpload() {
    setUploadError(null);
    setUploadResult(null);
    setUploadFile(null);
    setUploadOpen(true);
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploadResult(null);
    if (!uploadFile) {
      setUploadError("Choose a CSV or Excel file.");
      return;
    }
    const body = new FormData();
    body.append("file", uploadFile);
    setUploadBusy(true);
    try {
      const res = await apiFetch("/schools/bulk-upload", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as SchoolBulkUploadResponse;
      setUploadResult(data);
      setUploadFile(null);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  function downloadSupervisorsCsv() {
    if (!uploadResult?.provisioned_supervisors.length) return;
    const header = "row_number,school_code,supervisor_full_name,supervisor_initial_password\n";
    const rows = uploadResult.provisioned_supervisors
      .map(
        (r) =>
          `${r.row_number},${escapeCsv(r.school_code)},${escapeCsv(r.supervisor_full_name)},${escapeCsv(r.supervisor_initial_password)}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "provisioned-supervisors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openEdit(s: School) {
    setEditSchool(s);
    setCode(s.code);
    setName(s.name);
    setRegion(s.region);
    setZone(s.zone);
    setSchoolType(s.school_type ?? "");
    setPec(s.is_private_examination_center);
    setWritesAtId(s.writes_at_center_id ?? "");
    setFormError(null);
  }

  async function submitCreate() {
    setFormError(null);
    if (!code.trim() || code.trim().length > 6) {
      setFormError("School code is required (max 6 characters).");
      return;
    }
    if (!name.trim() || !region || !zone) {
      setFormError("Name, region, and zone are required.");
      return;
    }
    const payload: SchoolCreatePayload = {
      code: code.trim(),
      name: name.trim(),
      region,
      zone,
      is_private_examination_center: pec,
      writes_at_center_id: writesAtId.trim() ? writesAtId.trim() : null,
    };
    if (schoolType) payload.school_type = schoolType;

    setSubmitting(true);
    try {
      const res = await apiJson<SchoolCreatedResponse>("/schools", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      resetForm();
      setCreatedInfo(res);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit() {
    if (!editSchool) return;
    setFormError(null);
    if (!name.trim() || !region || !zone) {
      setFormError("Name, region, and zone are required.");
      return;
    }
    const payload: SchoolUpdatePayload = {
      name: name.trim(),
      region,
      zone,
      is_private_examination_center: pec,
    };
    payload.school_type = schoolType ? schoolType : null;
    const w = writesAtId.trim();
    payload.writes_at_center_id = w ? w : null;

    setSubmitting(true);
    try {
      await apiJson<School>(`/schools/${editSchool.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditSchool(null);
      resetForm();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDelete() {
    if (!deleteSchool) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/schools/${deleteSchool.id}`, { method: "DELETE" });
      setDeleteSchool(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Schools</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} school{total === 1 ? "" : "s"} total
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={openCreate}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover ${inputFocusRing}`}
          >
            Add school
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

      {createdInfo ? (
        <div
          className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-foreground"
          role="status"
        >
          <p className="font-medium text-success">School created</p>
          <p className="mt-2 text-muted-foreground">
            Supervisor login uses school code as username and password (initially).
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Code: <strong>{createdInfo.school.code}</strong>
            </li>
            <li>Supervisor name: {createdInfo.supervisor_full_name}</li>
            <li>Initial password: {createdInfo.supervisor_initial_password}</li>
          </ul>
          <button
            type="button"
            className={`mt-3 text-sm font-medium text-primary underline ${inputFocusRing} rounded`}
            onClick={() => setCreatedInfo(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div>
        <label htmlFor="school-search" className={formLabelClass}>
          Search by code or name
        </label>
        <input
          id="school-search"
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
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Region</th>
              <th className="px-3 py-3 font-medium">Zone</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">PEC</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No schools match your search.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-mono text-xs">{s.code}</td>
                  <td className="max-w-[200px] truncate px-3 py-3">{s.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{s.region}</td>
                  <td className="px-3 py-3">{s.zone}</td>
                  <td className="px-3 py-3 text-muted-foreground">{s.school_type ?? "—"}</td>
                  <td className="px-3 py-3">{s.is_private_examination_center ? "Yes" : "No"}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className={`mr-2 rounded-lg px-2 py-1 text-primary hover:bg-muted ${inputFocusRing}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setDeleteSchool(s);
                      }}
                      className={`rounded-lg px-2 py-1 text-destructive hover:bg-muted ${inputFocusRing}`}
                    >
                      Delete
                    </button>
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
            Page {page} of {totalPages}
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

      {createOpen ? (
        <Modal
          title="Add school"
          titleId="add-school-modal-title"
          onClose={() => !submitting && setCreateOpen(false)}
        >
          <SchoolFormFields
            code={code}
            setCode={setCode}
            name={name}
            setName={setName}
            region={region}
            setRegion={setRegion}
            zone={zone}
            setZone={setZone}
            schoolType={schoolType}
            setSchoolType={setSchoolType}
            pec={pec}
            setPec={setPec}
            writesAtId={writesAtId}
            setWritesAtId={setWritesAtId}
            showCode
          />
          {formError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submitCreate}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Create school"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setCreateOpen(false)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm hover:bg-muted ${inputFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {editSchool ? (
        <Modal
          title={`Edit school · ${editSchool.code}`}
          titleId="edit-school-modal-title"
          onClose={() => !submitting && setEditSchool(null)}
        >
          <p className="text-sm text-muted-foreground">School code cannot be changed.</p>
          <div className="mt-4">
            <SchoolFormFields
              code={code}
              setCode={setCode}
              name={name}
              setName={setName}
              region={region}
              setRegion={setRegion}
              zone={zone}
              setZone={setZone}
              schoolType={schoolType}
              setSchoolType={setSchoolType}
              pec={pec}
              setPec={setPec}
              writesAtId={writesAtId}
              setWritesAtId={setWritesAtId}
              showCode={false}
            />
          </div>
          {formError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submitEdit}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setEditSchool(null)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm hover:bg-muted ${inputFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {deleteSchool ? (
        <Modal
          title="Delete school"
          titleId="delete-school-modal-title"
          onClose={() => !submitting && setDeleteSchool(null)}
        >
          <p className="text-sm text-foreground">
            Delete <strong>{deleteSchool.name}</strong> ({deleteSchool.code})? This cannot be
            undone. You can only delete schools that have no supervisors or inspectors linked to
            this code.
          </p>
          {formError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submitDelete}
              className="min-h-11 rounded-lg bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setDeleteSchool(null)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm hover:bg-muted ${inputFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {uploadOpen ? (
        <Modal
          title="Upload schools"
          titleId="upload-schools-modal-title"
          panelClassName="max-w-xl"
          onClose={() => !uploadBusy && setUploadOpen(false)}
        >
          <p className="text-sm text-muted-foreground">
            Required columns: <code className="rounded bg-muted px-1">code</code>,{" "}
            <code className="rounded bg-muted px-1">name</code>,{" "}
            <code className="rounded bg-muted px-1">region</code>,{" "}
            <code className="rounded bg-muted px-1">zone</code>. Optional:{" "}
            <code className="rounded bg-muted px-1">school_type</code>,{" "}
            <code className="rounded bg-muted px-1">is_private_examination_center</code>,{" "}
            <code className="rounded bg-muted px-1">writes_at_center_code</code> or{" "}
            <code className="rounded bg-muted px-1">writes_at_center_id</code>.
          </p>
          <form onSubmit={submitUpload} className="mt-4">
            <label htmlFor="school-bulk-file" className={formLabelClass}>
              File (CSV, XLSX, XLS)
            </label>
            <input
              id="school-bulk-file"
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              disabled={uploadBusy}
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
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
            <div className="mt-6 space-y-4 border-t border-border pt-6">
              <h3 className="font-semibold text-card-foreground">Results</h3>
              <ul className="flex flex-wrap gap-4 text-sm">
                <li>
                  <span className="text-muted-foreground">Rows in file:</span>{" "}
                  <strong>{uploadResult.total_rows}</strong>
                </li>
                <li>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  <strong className="text-success">{uploadResult.successful}</strong>
                </li>
                <li>
                  <span className="text-muted-foreground">Failed:</span>{" "}
                  <strong className="text-destructive">{uploadResult.failed}</strong>
                </li>
              </ul>

              {uploadResult.provisioned_supervisors.length > 0 ? (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Provisioned supervisors</p>
                    <button
                      type="button"
                      onClick={downloadSupervisorsCsv}
                      className={`text-sm font-medium text-primary underline ${inputFocusRing} rounded`}
                    >
                      Download CSV
                    </button>
                  </div>
                  <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted/80">
                        <tr>
                          <th className="px-2 py-2">Row</th>
                          <th className="px-2 py-2">Code</th>
                          <th className="px-2 py-2">Supervisor</th>
                          <th className="px-2 py-2">Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.provisioned_supervisors.map((r) => (
                          <tr
                            key={`${r.row_number}-${r.school_code}`}
                            className="border-t border-border"
                          >
                            <td className="px-2 py-1.5">{r.row_number}</td>
                            <td className="px-2 py-1.5 font-mono">{r.school_code}</td>
                            <td className="px-2 py-1.5">{r.supervisor_full_name}</td>
                            <td className="px-2 py-1.5 font-mono">{r.supervisor_initial_password}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {uploadResult.errors.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-destructive">Row errors</p>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    {uploadResult.errors.map((err, i) => (
                      <li key={`${err.row_number}-${i}`}>
                        <span className="font-mono">Row {err.row_number}:</span>{" "}
                        {err.error_message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
