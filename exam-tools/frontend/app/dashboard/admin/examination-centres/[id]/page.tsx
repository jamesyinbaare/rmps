"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SchoolSearchCombobox } from "@/components/school-search-combobox";
import { SubjectScopeBadge, SubjectScopeLegend } from "@/components/subject-scope-badge";
import {
  apiJson,
  deleteCentreLocationByCode,
  deleteExaminationCentre,
  getExaminationCentreDetail,
  listExaminationCentres,
  setExaminationCentreMemberships,
  updateExaminationCentre,
  upsertCentreLocationByCode,
  type Examination,
  type PerExamCentreDetailResponse,
  type PerExamCentreMembershipAssign,
  type PerExamCentreMembership,
  type School,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { REGION_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";
import {
  inspectorPostingCountLabel,
  mergeAndSortPostedInspectors,
} from "@/lib/subject-scope-display";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type CentreStructureMode = "UNIFIED" | "SPLIT";

type DraftMembershipRow = PerExamCentreMembershipAssign & {
  school_name?: string;
};

function membershipsToDraft(rows: PerExamCentreMembership[]): DraftMembershipRow[] {
  return rows.map((m) => ({
    school_code: m.school_code,
    school_name: m.school_name,
    subject_scope: m.subject_scope,
  }));
}

function draftToAssignments(rows: DraftMembershipRow[]): PerExamCentreMembershipAssign[] {
  return rows.map(({ school_code, subject_scope }) => ({ school_code, subject_scope }));
}

export default function ExaminationCentreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";

  const initialExamId = useMemo(() => {
    const raw = searchParams.get("examination_id");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const [exams, setExams] = useState<Examination[]>([]);
  const [examFilterId, setExamFilterId] = useState<number | null>(initialExamId);
  const [structureMode, setStructureMode] = useState<CentreStructureMode>("UNIFIED");
  const [data, setData] = useState<PerExamCentreDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingCentre, setEditingCentre] = useState(false);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editZone, setEditZone] = useState("");
  const [savingCentre, setSavingCentre] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editingMemberships, setEditingMemberships] = useState(false);
  const [draftAssignments, setDraftAssignments] = useState<DraftMembershipRow[]>([]);
  const [memberSchoolId, setMemberSchoolId] = useState("");
  const [memberSchool, setMemberSchool] = useState<School | null>(null);
  const [newScope, setNewScope] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [savingMemberships, setSavingMemberships] = useState(false);

  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [clearingLocation, setClearingLocation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
        setExamFilterId((prev) => {
          if (prev != null && list.some((e) => e.id === prev)) return prev;
          return list.length ? list[0].id : null;
        });
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMode = useCallback(async (examId: number) => {
    try {
      const list = await listExaminationCentres(examId);
      setStructureMode(list.centre_structure_mode);
    } catch {
      /* keep previous */
    }
  }, []);

  const load = useCallback(async () => {
    if (!id || examFilterId == null) {
      setLoading(false);
      setData(null);
      if (!id) setError("Invalid centre id");
      else if (examFilterId == null) setError("Select an examination");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [res] = await Promise.all([
        getExaminationCentreDetail(examFilterId, id),
        loadMode(examFilterId),
      ]);
      setData(res);
      if (!editingCentre) {
        setEditCode(res.centre.code);
        setEditName(res.centre.name);
        setEditRegion(res.centre.region ?? "");
        setEditZone(res.centre.zone ?? "");
      }
      if (!editingMemberships) {
        setDraftAssignments(membershipsToDraft(res.memberships));
      }
      const loc = res.centre.location;
      if (loc) {
        setEditLat(String(loc.latitude));
        setEditLng(String(loc.longitude));
      } else {
        setEditLat("");
        setEditLng("");
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load centre");
    } finally {
      setLoading(false);
    }
  }, [id, examFilterId, loadMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const centre = data?.centre;
  const sortedPostedInspectors = useMemo(
    () => (data?.posted_inspectors ? mergeAndSortPostedInspectors(data.posted_inspectors) : []),
    [data?.posted_inspectors],
  );
  const rawInspectorPostingCount = data?.posted_inspector_posting_count ?? data?.posted_inspectors.length ?? 0;

  const onSaveCentre = async () => {
    if (examFilterId == null || !id) return;
    setSavingCentre(true);
    setError(null);
    try {
      await updateExaminationCentre(examFilterId, id, {
        code: editCode.trim(),
        name: editName.trim(),
        region: editRegion.trim() || null,
        zone: editZone.trim() || null,
      });
      setEditingCentre(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update centre");
    } finally {
      setSavingCentre(false);
    }
  };

  const onDeleteCentre = async () => {
    if (examFilterId == null || !id) return;
    if (!confirm("Delete this examination centre and all its memberships? This cannot be undone.")) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteExaminationCentre(examFilterId, id);
      router.push("/dashboard/admin/examination-centres");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete centre");
      setDeleting(false);
    }
  };

  const addSchoolToDraft = () => {
    if (!memberSchool) {
      setError("Select a school to add");
      return;
    }
    const scope = structureMode === "UNIFIED" ? "ALL" : newScope;
    const exists = draftAssignments.some(
      (a) => a.school_code === memberSchool.code && a.subject_scope === scope,
    );
    if (exists) {
      setError("This school and scope is already in the list");
      return;
    }
    setDraftAssignments((prev) => [
      ...prev,
      {
        school_code: memberSchool.code,
        school_name: memberSchool.name,
        subject_scope: scope,
      },
    ]);
    setMemberSchoolId("");
    setMemberSchool(null);
    setError(null);
  };

  const removeDraftRow = (index: number) => {
    setDraftAssignments((prev) => prev.filter((_, i) => i !== index));
  };

  const onSaveMemberships = async () => {
    if (examFilterId == null || !id) return;
    setSavingMemberships(true);
    setError(null);
    try {
      const res = await setExaminationCentreMemberships(
        examFilterId,
        id,
        draftToAssignments(draftAssignments),
      );
      setData(res);
      setDraftAssignments(membershipsToDraft(res.memberships));
      setEditingMemberships(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save memberships");
    } finally {
      setSavingMemberships(false);
    }
  };

  const displayMemberships = editingMemberships ? draftAssignments : data?.memberships ?? [];

  const onSaveLocation = async () => {
    if (!centre) return;
    const lat = Number(editLat);
    const lng = Number(editLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError("Enter valid latitude and longitude");
      return;
    }
    setSavingLocation(true);
    setError(null);
    try {
      await upsertCentreLocationByCode(centre.code, {
        latitude: lat,
        longitude: lng,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save location");
    } finally {
      setSavingLocation(false);
    }
  };

  const onClearLocation = async () => {
    if (!centre) return;
    if (!confirm(`Remove GPS for centre code ${centre.code}? This affects all examinations using this code.`)) {
      return;
    }
    setClearingLocation(true);
    setError(null);
    try {
      await deleteCentreLocationByCode(centre.code);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear location");
    } finally {
      setClearingLocation(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/admin/examination-centres"
          className={`inline-flex min-h-11 items-center rounded-lg border border-input-border px-4 text-sm font-medium text-foreground hover:bg-muted ${inputFocusRing}`}
        >
          Back to list
        </Link>
      </div>

      <div className="max-w-md">
        <label htmlFor="centre-detail-exam" className={formLabelClass}>
          Examination
        </label>
        <select
          id="centre-detail-exam"
          className={formInputClass}
          value={examFilterId ?? ""}
          onChange={(e) => setExamFilterId(e.target.value ? Number(e.target.value) : null)}
        >
          {exams.length === 0 ? <option value="">No examinations</option> : null}
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.year}
              {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Structure mode: <span className="font-medium">{structureMode}</span>
        </p>
        {examFilterId != null && id ? (
          <Link
            href={`/dashboard/admin/inspector-postings?examinationId=${examFilterId}&centerId=${encodeURIComponent(id)}&openCreate=1`}
            className={`mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover ${inputFocusRing}`}
          >
            Assign inspector posting at this centre
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : centre && data ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Examination centre</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {centre.code} — {centre.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!editingCentre ? (
                <button
                  type="button"
                  onClick={() => setEditingCentre(true)}
                  className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
                >
                  Edit centre
                </button>
              ) : null}
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDeleteCentre()}
                className={`min-h-11 rounded-lg border border-destructive/50 px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 ${inputFocusRing}`}
              >
                {deleting ? "Deleting…" : "Delete centre"}
              </button>
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Centre details
            </h3>
            {editingCentre ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-centre-code" className={formLabelClass}>
                    Code
                  </label>
                  <input
                    id="edit-centre-code"
                    className={formInputClass}
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-centre-name" className={formLabelClass}>
                    Name
                  </label>
                  <input
                    id="edit-centre-name"
                    className={formInputClass}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-centre-region" className={formLabelClass}>
                    Region
                  </label>
                  <select
                    id="edit-centre-region"
                    className={formInputClass}
                    value={editRegion}
                    onChange={(e) => setEditRegion(e.target.value)}
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
                  <label htmlFor="edit-centre-zone" className={formLabelClass}>
                    Zone
                  </label>
                  <select
                    id="edit-centre-zone"
                    className={formInputClass}
                    value={editZone}
                    onChange={(e) => setEditZone(e.target.value)}
                  >
                    <option value="">—</option>
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z.value} value={z.value}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button
                    type="button"
                    disabled={savingCentre}
                    onClick={() => void onSaveCentre()}
                    className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${inputFocusRing}`}
                  >
                    {savingCentre ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCentre(false);
                      setEditCode(centre.code);
                      setEditName(centre.name);
                      setEditRegion(centre.region ?? "");
                      setEditZone(centre.zone ?? "");
                    }}
                    className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Code</dt>
                  <dd className="mt-0.5 font-mono text-xs font-medium text-foreground">{centre.code}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="mt-0.5 text-foreground">{centre.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Region</dt>
                  <dd className="mt-0.5 text-foreground">{centre.region ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Zone</dt>
                  <dd className="mt-0.5 text-foreground">{centre.zone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Schools in scope</dt>
                  <dd className="mt-0.5 tabular-nums text-foreground">{centre.hosted_school_count}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              GPS location
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Stored by centre code <span className="font-mono">{centre.code}</span> — applies across all
              examinations using this code.
            </p>
            {centre.location ? (
              <p className="mt-2 text-sm text-foreground">
                Last recorded:{" "}
                {new Date(centre.location.captured_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                ({centre.location.source === "ADMIN_MANUAL" ? "admin" : "inspector GPS"})
              </p>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-lat" className={formLabelClass}>
                  Latitude
                </label>
                <input
                  id="edit-lat"
                  type="number"
                  step="any"
                  className={formInputClass}
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="edit-lng" className={formLabelClass}>
                  Longitude
                </label>
                <input
                  id="edit-lng"
                  type="number"
                  step="any"
                  className={formInputClass}
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingLocation}
                onClick={() => void onSaveLocation()}
                className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${inputFocusRing}`}
              >
                {savingLocation ? "Saving…" : centre.has_location ? "Update location" : "Save location"}
              </button>
              {centre.has_location ? (
                <button
                  type="button"
                  disabled={clearingLocation}
                  onClick={() => void onClearLocation()}
                  className={`min-h-11 rounded-lg border border-destructive/50 px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 ${inputFocusRing}`}
                >
                  {clearingLocation ? "Clearing…" : "Clear GPS"}
                </button>
              ) : null}
              {centre.location ? (
                <a
                  href={`https://www.google.com/maps?q=${centre.location.latitude},${centre.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex min-h-11 items-center rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
                >
                  Open in maps
                </a>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-card-foreground">Centre memberships</h3>
              {!editingMemberships ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftAssignments(membershipsToDraft(data.memberships));
                    setEditingMemberships(true);
                  }}
                  className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
                >
                  Edit memberships
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {structureMode === "UNIFIED"
                ? "UNIFIED mode: each school uses scope ALL."
                : "SPLIT mode: assign CORE and/or ELECTIVE per school."}
            </p>

            {editingMemberships ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-[min(100%,20rem)] flex-1">
                  <SchoolSearchCombobox
                    value={memberSchoolId}
                    onSelect={(school) => {
                      setMemberSchoolId(school?.id ?? "");
                      setMemberSchool(school);
                    }}
                    label="School"
                    placeholder="Search and select a school…"
                  />
                </div>
                {structureMode === "SPLIT" ? (
                  <div>
                    <label htmlFor="mem-scope" className={formLabelClass}>
                      Scope
                    </label>
                    <select
                      id="mem-scope"
                      className={formInputClass}
                      value={newScope}
                      onChange={(e) => setNewScope(e.target.value as "CORE" | "ELECTIVE")}
                    >
                      <option value="CORE">CORE</option>
                      <option value="ELECTIVE">ELECTIVE</option>
                    </select>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!memberSchool}
                  onClick={() => addSchoolToDraft()}
                  className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
                >
                  Add school
                </button>
              </div>
            ) : null}

            {displayMemberships.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Scope</th>
                      {editingMemberships ? (
                        <th className="px-3 py-2 font-medium text-right">Remove</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {editingMemberships
                      ? draftAssignments.map((m, idx) => (
                          <tr key={`${m.school_code}-${m.subject_scope}-${idx}`} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{m.school_code}</td>
                            <td className="max-w-[200px] truncate px-3 py-2">{m.school_name ?? "—"}</td>
                            <td className="px-3 py-2">
                              <SubjectScopeBadge scope={m.subject_scope} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeDraftRow(idx)}
                                className="text-sm text-destructive hover:underline"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      : data.memberships.map((m) => (
                          <tr
                            key={`${m.school_id}-${m.subject_scope}`}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-3 py-2 font-mono text-xs">{m.school_code}</td>
                            <td className="max-w-[200px] truncate px-3 py-2">{m.school_name}</td>
                            <td className="px-3 py-2">
                              <SubjectScopeBadge scope={m.subject_scope} />
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No schools assigned yet.</p>
            )}

            {editingMemberships ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingMemberships}
                  onClick={() => void onSaveMemberships()}
                  className={`min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${inputFocusRing}`}
                >
                  {savingMemberships ? "Saving…" : "Save memberships"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMemberships(false);
                    setDraftAssignments(membershipsToDraft(data.memberships));
                  }}
                  className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted ${inputFocusRing}`}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-card-foreground">Inspectors at this centre</h3>
            {sortedPostedInspectors.length > 0 ? <SubjectScopeLegend className="mt-2" /> : null}
            <p className="mt-1 text-sm text-muted-foreground">
              Posted for this examination (
              {inspectorPostingCountLabel(sortedPostedInspectors.length, rawInspectorPostingCount)}).
            </p>
            {sortedPostedInspectors.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Inspector</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPostedInspectors.map((row) => (
                      <tr key={row.posting_id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{row.inspector_full_name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.inspector_phone ?? "—"}</td>
                        <td className="px-3 py-2">
                          <SubjectScopeBadge scope={row.subject_scope} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No inspector postings target this centre for this examination.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
