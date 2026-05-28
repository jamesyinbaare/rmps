"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SchoolSearchCombobox } from "@/components/school-search-combobox";
import {
  apiJson,
  cloneExaminationCentresFrom,
  createExaminationCentre,
  downloadExaminationCentresBulkTemplate,
  getAdminActiveExamination,
  listExaminationCentres,
  uploadExaminationCentresBulk,
  type Examination,
  type ExaminationCentreBulkUploadResponse,
  type ExaminationCentreMembershipScopeApi,
  type PerExamCentreItem,
  type PerExamCentreListResponse,
  type School,
  upgradeExaminationCentresToSplit,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { REGION_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export default function ExaminationCentresPage() {
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [examinationId, setExaminationId] = useState<number | null>(null);
  const [mode, setMode] = useState<PerExamCentreListResponse["centre_structure_mode"]>("UNIFIED");
  const [items, setItems] = useState<PerExamCentreItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createSchoolId, setCreateSchoolId] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRegion, setCreateRegion] = useState("");
  const [createZone, setCreateZone] = useState("");
  const [creating, setCreating] = useState(false);

  const [showClone, setShowClone] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<number | null>(null);
  const [cloning, setCloning] = useState(false);

  const [bulkScope, setBulkScope] = useState<ExaminationCentreMembershipScopeApi>("CORE");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<ExaminationCentreBulkUploadResponse | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void (async () => {
      try {
        const [exams, active] = await Promise.all([
          apiJson<Examination[]>("/examinations"),
          getAdminActiveExamination(),
        ]);
        setExaminations(exams);
        const defaultId = active.active_examination_id ?? exams[0]?.id ?? null;
        setExaminationId(defaultId);
      } catch {
        setLoadError("Failed to load examinations");
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (examinationId == null) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listExaminationCentres(examinationId, debouncedSearch || undefined);
      setItems(data.items);
      setMode(data.centre_structure_mode);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load examination centres");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [examinationId, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setBulkScope(mode === "UNIFIED" ? "ALL" : "CORE");
  }, [mode, examinationId]);

  const onUpgradeToSplit = async () => {
    if (examinationId == null) return;
    if (
      !confirm(
        "Upgrade this examination to SPLIT? Existing centre memberships will move to CORE. You can add ELECTIVE memberships afterward via bulk upload or each centre's detail page.",
      )
    ) {
      return;
    }
    setUpgrading(true);
    try {
      await upgradeExaminationCentresToSplit(examinationId);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  };

  const resetCreateForm = () => {
    setCreateSchoolId("");
    setCreateCode("");
    setCreateName("");
    setCreateRegion("");
    setCreateZone("");
  };

  const onCreateSchoolSelect = (school: School | null) => {
    if (!school) {
      setCreateSchoolId("");
      setCreateCode("");
      setCreateName("");
      setCreateRegion("");
      setCreateZone("");
      return;
    }
    setCreateSchoolId(school.id);
    setCreateCode(school.code);
    setCreateName(school.name);
    setCreateRegion(school.region ?? "");
    setCreateZone(school.zone ?? "");
  };

  const onCreateCentre = async () => {
    if (examinationId == null) return;
    if (!createSchoolId.trim()) {
      setLoadError("Select a school from the registry");
      return;
    }
    const code = createCode.trim();
    const name = createName.trim();
    if (!code || !name) {
      setLoadError("Code and name are required");
      return;
    }
    setCreating(true);
    setLoadError(null);
    try {
      await createExaminationCentre(examinationId, {
        code,
        name,
        region: createRegion.trim() || null,
        zone: createZone.trim() || null,
      });
      setShowCreate(false);
      resetCreateForm();
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to create centre");
    } finally {
      setCreating(false);
    }
  };

  const onCloneFromExam = async () => {
    if (examinationId == null || cloneSourceId == null) return;
    if (cloneSourceId === examinationId) {
      setLoadError("Source examination must differ from target");
      return;
    }
    if (
      !confirm(
        `Clone all centres and memberships from the selected examination into this one? This only works when the target has no centres yet.`,
      )
    ) {
      return;
    }
    setCloning(true);
    setLoadError(null);
    try {
      await cloneExaminationCentresFrom(examinationId, cloneSourceId);
      setShowClone(false);
      setCloneSourceId(null);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const cloneSourceOptions = examinations.filter((e) => e.id !== examinationId);

  const onDownloadBulkTemplate = async () => {
    if (examinationId == null) return;
    setBulkError(null);
    try {
      await downloadExaminationCentresBulkTemplate(examinationId, bulkScope);
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Download failed");
    }
  };

  const onBulkUpload = async () => {
    if (examinationId == null || !bulkFile) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await uploadExaminationCentresBulk(examinationId, bulkFile, bulkScope);
      setBulkResult(res);
      setBulkFile(null);
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Examination centres</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Centres are configured per examination. Mode:{" "}
            <span className="font-medium text-foreground">{mode}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {examinationId != null ? (
            <>
              <button
                type="button"
                onClick={() => {
                  resetCreateForm();
                  setShowCreate(true);
                }}
                className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover ${inputFocusRing}`}
              >
                Add centre
              </button>
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowClone(true)}
                  className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
                >
                  Clone from examination
                </button>
              ) : null}
            </>
          ) : null}
          {mode === "UNIFIED" && examinationId != null ? (
            <button
              type="button"
              disabled={upgrading}
              onClick={() => void onUpgradeToSplit()}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
            >
              {upgrading ? "Upgrading…" : "Upgrade to SPLIT"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="exam-select" className={formLabelClass}>
            Examination
          </label>
          <select
            id="exam-select"
            className={formInputClass}
            value={examinationId ?? ""}
            onChange={(e) => setExaminationId(e.target.value ? Number(e.target.value) : null)}
          >
            {examinations.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.year} {ex.exam_type}
                {ex.exam_series ? ` (${ex.exam_series})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="centre-search" className={formLabelClass}>
            Search by code or name
          </label>
          <input
            id="centre-search"
            className={formInputClass}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Type to filter…"
          />
        </div>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {showCreate ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold text-card-foreground">New examination centre</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Search for a school in the registry; code and name are filled from the school record.
          </p>
          <div className="mt-4 max-w-md">
            <SchoolSearchCombobox
              value={createSchoolId}
              onSelect={onCreateSchoolSelect}
              label="School (host)"
              placeholder="Select a school…"
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-centre-code" className={formLabelClass}>
                Centre code
              </label>
              <input
                id="new-centre-code"
                className={`${formInputClass} bg-muted/40`}
                value={createCode}
                readOnly
                placeholder="Select a school above"
              />
            </div>
            <div>
              <label htmlFor="new-centre-name" className={formLabelClass}>
                Centre name
              </label>
              <input
                id="new-centre-name"
                className={formInputClass}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="new-centre-region" className={formLabelClass}>
                Region
              </label>
              <select
                id="new-centre-region"
                className={formInputClass}
                value={createRegion}
                onChange={(e) => setCreateRegion(e.target.value)}
              >
                <option value="">—</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-centre-zone" className={formLabelClass}>
                Zone
              </label>
              <select
                id="new-centre-zone"
                className={formInputClass}
                value={createZone}
                onChange={(e) => setCreateZone(e.target.value)}
              >
                <option value="">—</option>
                {ZONE_OPTIONS.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCreateCentre()}
              className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${inputFocusRing}`}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {examinationId != null ? (
        <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-card-foreground">
            Bulk upload centres and memberships
          </summary>
          <div className="space-y-4 border-t border-border px-5 pb-5 pt-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Before you upload</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Add schools in{" "}
                  <Link href="/dashboard/admin/schools" className="text-primary underline-offset-2 hover:underline">
                    Schools
                  </Link>{" "}
                  first. Every <span className="font-mono text-xs">centre_code</span> must match a school code that
                  already exists.
                </li>
                <li>
                  Each row links a member school (<span className="font-mono text-xs">school_code</span>) to a centre (
                  <span className="font-mono text-xs">centre_code</span>). New centres get their name, region, and zone
                  from the host school automatically.
                </li>
                <li>
                  Re-uploading is safe: existing centres and memberships are kept; only new rows are added for the
                  scope you choose below.
                </li>
                {mode === "SPLIT" ? (
                  <li>
                    This examination uses SPLIT centres—upload CORE members in one file, then ELECTIVE members in
                    another (you can reuse the same centre codes in both).
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="bulk-scope" className={formLabelClass}>
                  Upload scope
                </label>
                <select
                  id="bulk-scope"
                  className={formInputClass}
                  value={bulkScope}
                  onChange={(e) => setBulkScope(e.target.value as ExaminationCentreMembershipScopeApi)}
                  disabled={bulkBusy}
                >
                  {mode === "UNIFIED" ? (
                    <option value="ALL">ALL</option>
                  ) : (
                    <>
                      <option value="CORE">CORE</option>
                      <option value="ELECTIVE">ELECTIVE</option>
                    </>
                  )}
                </select>
              </div>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void onDownloadBulkTemplate()}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
              >
                Download template
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-md">
                <label className={formLabelClass} htmlFor="ec-bulk-file">
                  Spreadsheet file
                </label>
                <input
                  id="ec-bulk-file"
                  type="file"
                  accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className={`${formInputClass} file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground`}
                  disabled={bulkBusy}
                  onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <button
                type="button"
                disabled={bulkBusy || !bulkFile}
                onClick={() => void onBulkUpload()}
                className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${inputFocusRing}`}
              >
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
                  {bulkResult.centres_created} centres created · {bulkResult.memberships_added} memberships added ·{" "}
                  {bulkResult.memberships_skipped} skipped · {bulkResult.failed} failed · {bulkResult.total_rows} rows
                </p>
                {bulkResult.errors.length > 0 ? (
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-destructive">
                    {bulkResult.errors.slice(0, 30).map((err) => (
                      <li key={`${err.row_number}-${err.error_message.slice(0, 24)}`}>
                        Row {err.row_number}: {err.error_message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {showClone ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold text-card-foreground">Clone centres from another examination</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Copies all centres and memberships. Target examination must have no centres yet.
          </p>
          <div className="mt-4 max-w-md">
            <label htmlFor="clone-source-exam" className={formLabelClass}>
              Source examination
            </label>
            <select
              id="clone-source-exam"
              className={formInputClass}
              value={cloneSourceId ?? ""}
              onChange={(e) => setCloneSourceId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select…</option>
              {cloneSourceOptions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.year} {ex.exam_type}
                  {ex.exam_series ? ` (${ex.exam_series})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={cloning || cloneSourceId == null}
              onClick={() => void onCloneFromExam()}
              className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${inputFocusRing}`}
            >
              {cloning ? "Cloning…" : "Clone"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowClone(false);
                setCloneSourceId(null);
              }}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Region</th>
              <th className="px-3 py-3 font-medium">Zone</th>
              <th className="px-3 py-3 font-medium">Schools</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No examination centres match your search.
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-mono text-xs">{c.code}</td>
                  <td className="max-w-[220px] truncate px-3 py-3">{c.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{c.region ?? "—"}</td>
                  <td className="px-3 py-3">{c.zone ?? "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{c.hosted_school_count}</td>
                  <td className="px-3 py-3 text-right">
                    {examinationId != null ? (
                      <Link
                        href={`/dashboard/admin/examination-centres/${c.id}?examination_id=${examinationId}`}
                        className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted ${inputFocusRing}`}
                      >
                        View
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
