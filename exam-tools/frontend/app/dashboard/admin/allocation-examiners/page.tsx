"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  apiJson,
  createExaminationExaminer,
  deleteExaminationExaminer,
  listAllSubjects,
  listExaminationExaminers,
  updateExaminationExaminer,
  type ExaminerRow,
  type ExaminerTypeApi,
  type Examination,
  type Subject,
} from "@/lib/api";
import {
  bulkUploadExaminationExaminers,
  type ExaminerBulkImportResponse,
} from "@/lib/allocation-examiners-upload";
import { getMe, type UserMe } from "@/lib/auth";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { REGION_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";

const EXAMINER_TYPE_OPTIONS: { value: ExaminerTypeApi; label: string }[] = [
  { value: "chief_examiner", label: "Chief examiner" },
  { value: "assistant_examiner", label: "Assistant examiner" },
  { value: "team_leader", label: "Team leader" },
];

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export default function AdminExaminersPage() {
  const searchParams = useSearchParams();
  const [me, setMe] = useState<UserMe | null>(null);
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [examiners, setExaminers] = useState<ExaminerRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ExaminerBulkImportResponse | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ExaminerTypeApi>("assistant_examiner");
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newRestrictZone, setNewRestrictZone] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<ExaminerTypeApi>("assistant_examiner");
  const [editSubjectIds, setEditSubjectIds] = useState<number[]>([]);
  const [editRegion, setEditRegion] = useState("");
  const [editRestrictZone, setEditRestrictZone] = useState("");

  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  useEffect(() => {
    void getMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<Examination[]>("/examinations");
        if (!cancelled) setExams(data);
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await listAllSubjects();
        if (!cancelled) setSubjects(items);
      } catch {
        if (!cancelled) setSubjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const raw = searchParams.get("exam");
    if (raw == null || raw === "") return;
    const n = Number(raw);
    if (Number.isFinite(n)) setExamId(n);
  }, [searchParams]);

  const loadExaminers = useCallback(async (eid: number) => {
    setLoadError(null);
    try {
      const list = await listExaminationExaminers(eid);
      setExaminers(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load examiners");
      setExaminers([]);
    }
  }, []);

  useEffect(() => {
    if (examId == null) {
      setExaminers([]);
      return;
    }
    void loadExaminers(examId);
  }, [examId, loadExaminers]);

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` })),
    [subjects],
  );

  const editSubjectAddOptions = useMemo(
    () => subjectOptions.filter((o) => !editSubjectIds.includes(Number(o.value))),
    [subjectOptions, editSubjectIds],
  );

  const regionOptions = useMemo(
    () => REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
    [],
  );

  const zoneLetterOptions = useMemo(
    () => ZONE_OPTIONS.map((z) => ({ value: z.value, label: z.label })),
    [],
  );

  const subjectLabel = (id: number) => {
    const s = subjects.find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : String(id);
  };

  function resetAddForm() {
    setNewName("");
    setNewSubjectId("");
    setNewRegion("");
    setNewRestrictZone("");
    setNewType("assistant_examiner");
  }

  async function handleAdd() {
    if (examId == null || !newName.trim() || !newSubjectId) {
      setAddError("Name and subject are required.");
      return;
    }
    if (!newRegion.trim()) {
      setAddError("Region is required.");
      return;
    }
    const sid = Number(newSubjectId);
    if (!Number.isFinite(sid)) {
      setAddError("Pick a valid subject.");
      return;
    }
    setBusy(true);
    setAddError(null);
    try {
      await createExaminationExaminer(examId, {
        name: newName.trim(),
        examiner_type: newType,
        subject_ids: [sid],
        allowed_zones: [],
        allowed_region: newRegion.trim(),
        restrict_zone: newRestrictZone.trim() || undefined,
      });
      resetAddForm();
      setAddModalOpen(false);
      await loadExaminers(examId);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(e: ExaminerRow) {
    setEditId(e.id);
    setEditName(e.name);
    setEditType(e.examiner_type);
    setEditSubjectIds([...e.subject_ids]);
    const pr = e.prefill_region?.trim() ?? "";
    const pz =
      e.prefill_zone?.trim() ??
      (e.allowed_zones.length === 1 ? e.allowed_zones[0]! : "");
    setEditRegion(pr);
    setEditRestrictZone(pz);
    setLoadError(null);
  }

  function cancelEdit() {
    setEditId(null);
  }

  function toggleEditSubject(id: number) {
    setEditSubjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveEdit() {
    if (examId == null || !editId || !editName.trim()) return;
    if (!editRegion.trim()) {
      setLoadError("Region is required before saving.");
      return;
    }
    setBusy(true);
    setLoadError(null);
    try {
      await updateExaminationExaminer(examId, editId, {
        name: editName.trim(),
        examiner_type: editType,
        subject_ids: editSubjectIds,
        allowed_region: editRegion.trim(),
        restrict_zone: editRestrictZone.trim() || undefined,
      });
      setEditId(null);
      await loadExaminers(examId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (examId == null) return;
    if (!window.confirm("Remove this examiner from this examination?")) return;
    setBusy(true);
    setLoadError(null);
    try {
      await deleteExaminationExaminer(examId, id);
      if (editId === id) setEditId(null);
      await loadExaminers(examId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onBulkFile(file: File | null) {
    if (examId == null || !file) return;
    setBusy(true);
    setUploadError(null);
    setImportResult(null);
    try {
      const res = await bulkUploadExaminationExaminers(examId, file);
      setImportResult(res);
      await loadExaminers(examId);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function closeUploadModal() {
    setUploadModalOpen(false);
    setUploadError(null);
    setImportResult(null);
  }

  useEffect(() => {
    if (!addModalOpen && !uploadModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (addModalOpen) {
        setAddModalOpen(false);
        setAddError(null);
      }
      if (uploadModalOpen) {
        setUploadModalOpen(false);
        setUploadError(null);
        setImportResult(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addModalOpen, uploadModalOpen, busy]);

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Examiners</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Maintain the examiner roster per examination (subjects and source school zones used by the solver for every
          allocation on that exam). Quotas and solves stay on the{" "}
          <Link
            href="/dashboard/admin/scripts-allocation"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            scripts allocation
          </Link>{" "}
          page.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">Examination</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={formLabelClass} htmlFor="ae-exam">
              Examination
            </label>
            <select
              id="ae-exam"
              className={`mt-1 min-w-[220px] rounded-lg border border-input bg-background px-3 py-2 text-sm ${inputFocusRing}`}
              value={examId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setExamId(v ? Number(v) : null);
              }}
            >
              <option value="">Select…</option>
              {exams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.exam_type} {x.year}
                  {x.exam_series ? ` (${x.exam_series})` : ""} — #{x.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {examId != null ? (
        <>
          {addModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) {
                  setAddModalOpen(false);
                  setAddError(null);
                }
              }}
            >
              <div
                className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ae-add-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id="ae-add-modal-title" className="text-base font-semibold text-card-foreground">
                  Add examiner
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  One subject per add. Every examiner belongs to a region; optionally narrow marking to one zone within
                  that region.
                </p>
                {addError ? (
                  <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {addError}
                  </p>
                ) : null}
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 border-b border-border pb-4 md:grid-cols-2">
                    <div>
                      <label className={formLabelClass} htmlFor="ae-name">
                        Name
                      </label>
                      <input
                        id="ae-name"
                        className={`${formInputClass} mt-1`}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={formLabelClass} htmlFor="ae-type">
                        Examiner type
                      </label>
                      <select
                        id="ae-type"
                        className={`${formInputClass} mt-1`}
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as ExaminerTypeApi)}
                      >
                        {EXAMINER_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className={formLabelClass}>Subject</p>
                      <div className="mt-1">
                        <SearchableCombobox
                          options={subjectOptions}
                          value={newSubjectId}
                          onChange={setNewSubjectId}
                          placeholder="Select subject"
                          searchPlaceholder="Search subject…"
                          widthClass="w-full min-w-0 max-w-[360px]"
                          showAllOption={false}
                          emptyText={subjects.length ? "No match." : "No subjects loaded."}
                        />
                      </div>
                    </div>
                    <div>
                      <p className={formLabelClass}>Region</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Required — examiner&apos;s home region.</p>
                      <div className="mt-1">
                        <SearchableCombobox
                          options={regionOptions}
                          value={newRegion}
                          onChange={setNewRegion}
                          placeholder="Select region…"
                          searchPlaceholder="Search region…"
                          widthClass="w-full min-w-0 max-w-[360px]"
                          showAllOption={false}
                          emptyText="No match."
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className={formLabelClass}>Zone within region (optional)</p>
                    <div className="mt-1">
                      <SearchableCombobox
                        options={zoneLetterOptions}
                        value={newRestrictZone}
                        onChange={setNewRestrictZone}
                        placeholder="All zones in region"
                        searchPlaceholder="Search zone…"
                        widthClass="w-full min-w-0 sm:w-[220px]"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setAddModalOpen(false);
                      setAddError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || !newName.trim() || !newSubjectId || !newRegion.trim()}
                    onClick={() => void handleAdd()}
                  >
                    Add examiner
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {uploadModalOpen && isSuperAdmin ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) closeUploadModal();
              }}
            >
              <div
                className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ae-upload-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id="ae-upload-modal-title" className="text-base font-semibold text-card-foreground">
                  Bulk upload
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  CSV or XLSX. Columns (header row): <span className="font-mono text-[11px]">name</span>,{" "}
                  <span className="font-mono text-[11px]">subject_code</span>,{" "}
                  <span className="font-mono text-[11px]">examiner_type</span>,{" "}
                  <span className="font-mono text-[11px]">region</span> (required), optional{" "}
                  <span className="font-mono text-[11px]">zone</span>. Types: chief_examiner, assistant_examiner,
                  team_leader (aliases such as CE, AE, TL accepted). Row numbers in errors refer to spreadsheet rows (row
                  1 is the header).
                </p>
                {uploadError ? (
                  <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {uploadError}
                  </p>
                ) : null}
                <div className="mt-4">
                  <input
                    type="file"
                    accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    disabled={busy}
                    className={`text-sm ${inputFocusRing}`}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      void onBulkFile(f ?? null);
                    }}
                  />
                </div>
                {importResult ? (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <p className="font-medium text-foreground">Created {importResult.created_count} examiner(s).</p>
                    {importResult.errors.length ? (
                      <ul className="mt-2 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs text-destructive">
                        {importResult.errors.map((err, i) => (
                          <li key={`${err.row_number}-${i}`}>
                            Row {err.row_number}: {err.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  <Button type="button" variant="outline" disabled={busy} onClick={closeUploadModal}>
                    {importResult ? "Close" : "Cancel"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-card-foreground">Roster</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAddError(null);
                    setAddModalOpen(true);
                  }}
                >
                  Add examiner
                </Button>
                {isSuperAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUploadError(null);
                      setImportResult(null);
                      setUploadModalOpen(true);
                    }}
                  >
                    Bulk upload
                  </Button>
                ) : null}
              </div>
            </div>
            {!isSuperAdmin ? (
              <p className="text-xs text-muted-foreground">
                Bulk file upload is available to system administrators only.
              </p>
            ) : null}
            {examiners.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-2">Name</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Subjects</th>
                      <th className="py-2 pr-2">Zones</th>
                      <th className="py-2 pr-2">Home zone</th>
                      <th className="py-2"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {examiners.map((e) => (
                      <tr key={e.id} className="border-b border-border/80 align-top">
                        <td className="py-2 pr-2 font-medium">{e.name}</td>
                        <td className="py-2 pr-2">{e.examiner_type}</td>
                        <td className="py-2 pr-2">
                          {e.subject_ids.length
                            ? e.subject_ids.map((id) => subjectLabel(id)).join("; ")
                            : "—"}
                        </td>
                        <td className="py-2 pr-2">{e.allowed_zones.length ? e.allowed_zones.join(", ") : "—"}</td>
                        <td className="py-2 pr-2">{e.zone ?? "—"}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={`text-sm text-primary underline-offset-2 hover:underline ${inputFocusRing}`}
                              onClick={() => beginEdit(e)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`text-sm text-destructive underline-offset-2 hover:underline ${inputFocusRing}`}
                              onClick={() => void handleDelete(e.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No examiners for this examination yet.</p>
            )}
          </section>

          {editId ? (
            <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4">
              <h2 className="text-sm font-semibold text-card-foreground">Edit examiner</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className={formLabelClass} htmlFor="ae-edit-name">
                    Name
                  </label>
                  <input
                    id="ae-edit-name"
                    className={`${formInputClass} mt-1`}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="ae-edit-type">
                    Type
                  </label>
                  <select
                    id="ae-edit-type"
                    className={`${formInputClass} mt-1`}
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as ExaminerTypeApi)}
                  >
                    {EXAMINER_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <p className={formLabelClass}>Subjects</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Search to add a subject; remove with × on a chip.
                </p>
                <div className="mt-1">
                  <SearchableCombobox
                    options={editSubjectAddOptions}
                    value=""
                    onChange={(v) => {
                      const sid = Number(v);
                      if (Number.isFinite(sid) && !editSubjectIds.includes(sid)) {
                        setEditSubjectIds((prev) => [...prev, sid]);
                      }
                    }}
                    placeholder="Add subject…"
                    searchPlaceholder="Search subjects…"
                    widthClass="w-full min-w-0 max-w-[360px]"
                    showAllOption={false}
                    emptyText={
                      subjects.length === 0
                        ? "No subjects loaded."
                        : editSubjectAddOptions.length === 0
                          ? "All listed subjects are already selected."
                          : "No match."
                    }
                  />
                </div>
                {editSubjectIds.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {editSubjectIds.map((id) => (
                      <li
                        key={id}
                        className="flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                      >
                        <span className="truncate">{subjectLabel(id)}</span>
                        <button
                          type="button"
                          className={`shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground ${inputFocusRing}`}
                          aria-label={`Remove ${subjectLabel(id)}`}
                          onClick={() => toggleEditSubject(id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No subjects selected yet.</p>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className={formLabelClass}>Region</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Required.</p>
                  <div className="mt-1">
                    <SearchableCombobox
                      options={regionOptions}
                      value={editRegion}
                      onChange={setEditRegion}
                      placeholder="Select region…"
                      searchPlaceholder="Search region…"
                      widthClass="w-full min-w-0 max-w-[360px]"
                      showAllOption={false}
                      emptyText="No match."
                    />
                  </div>
                </div>
                <div>
                  <p className={formLabelClass}>Zone within region (optional)</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Leave unset for all zones in the region; pick one letter to narrow.
                  </p>
                  <div className="mt-1">
                    <SearchableCombobox
                      options={zoneLetterOptions}
                      value={editRestrictZone}
                      onChange={setEditRestrictZone}
                      placeholder="Optional zone letter"
                      searchPlaceholder="Search zone…"
                      widthClass="w-full min-w-0 max-w-[280px]"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !editName.trim() || !editRegion.trim()}
                  onClick={() => void saveEdit()}
                >
                  Save changes
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
