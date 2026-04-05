"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiJson,
  type Programme,
  type ProgrammeSubjectRequirements,
  type ProgrammeSubjectRow,
  type Subject,
  type SubjectListResponse,
  type SubjectTypeEnum,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

/** Backend `/subjects` enforces page_size ≤ 100; fetch every page for the full catalogue. */
const SUBJECTS_LIST_PAGE_SIZE = 100;

async function fetchAllSubjectsCatalog(): Promise<Subject[]> {
  const items: Subject[] = [];
  let page = 1;
  let total = 0;
  do {
    const res = await apiJson<SubjectListResponse>(
      `/subjects?page=${page}&page_size=${SUBJECTS_LIST_PAGE_SIZE}`,
    );
    total = res.total;
    items.push(...res.items);
    page += 1;
  } while (items.length < total);
  return items;
}

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

export default function ProgrammeDetailPage() {
  const params = useParams();
  const programmeId = Number(params.id);
  const idValid = Number.isFinite(programmeId) && programmeId > 0;

  const [programme, setProgramme] = useState<Programme | null>(null);
  const [rows, setRows] = useState<ProgrammeSubjectRow[]>([]);
  const [requirements, setRequirements] = useState<ProgrammeSubjectRequirements | null>(null);
  const [catalog, setCatalog] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupedView, setGroupedView] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<ProgrammeSubjectRow | null>(null);
  const [addSubjectId, setAddSubjectId] = useState("");
  const [coreVariant, setCoreVariant] = useState<"compulsory" | "optional">("compulsory");
  const [choiceGroupId, setChoiceGroupId] = useState("");
  const [editCompulsory, setEditCompulsory] = useState<"compulsory" | "optional">("compulsory");
  const [editChoiceGroup, setEditChoiceGroup] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!idValid) return;
    setLoading(true);
    setError(null);
    try {
      const [p, list, req, catItems] = await Promise.all([
        apiJson<Programme>(`/programmes/${programmeId}`),
        apiJson<ProgrammeSubjectRow[]>(`/programmes/${programmeId}/subjects`),
        apiJson<ProgrammeSubjectRequirements>(`/programmes/${programmeId}/subject-requirements`),
        fetchAllSubjectsCatalog(),
      ]);
      setProgramme(p);
      setRows(list);
      setRequirements(req);
      setCatalog(catItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load programme");
      setProgramme(null);
      setRows([]);
      setRequirements(null);
    } finally {
      setLoading(false);
    }
  }, [idValid, programmeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const linkedIds = useMemo(() => new Set(rows.map((r) => r.subject_id)), [rows]);

  const availableSubjects = useMemo(
    () => catalog.filter((s) => !linkedIds.has(s.id)),
    [catalog, linkedIds],
  );

  const selectedAddSubject = useMemo(
    () => catalog.find((s) => String(s.id) === addSubjectId),
    [catalog, addSubjectId],
  );

  function openAdd() {
    setAddSubjectId(availableSubjects[0] ? String(availableSubjects[0].id) : "");
    setCoreVariant("compulsory");
    setChoiceGroupId("");
    setFormError(null);
    setAddOpen(true);
  }

  function associationBodyForCreate(subjectType: SubjectTypeEnum): {
    is_compulsory: boolean | null;
    choice_group_id: number | null;
  } {
    if (subjectType === "ELECTIVE") {
      return { is_compulsory: null, choice_group_id: null };
    }
    if (coreVariant === "compulsory") {
      return { is_compulsory: true, choice_group_id: null };
    }
    const n = parseInt(choiceGroupId, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("Optional core requires a positive choice group ID.");
    }
    return { is_compulsory: false, choice_group_id: n };
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAddSubject) {
      setFormError("Select a subject.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const body = associationBodyForCreate(selectedAddSubject.subject_type);
      await apiJson(`/programmes/${programmeId}/subjects/${selectedAddSubject.id}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAddOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(row: ProgrammeSubjectRow) {
    setEditRow(row);
    if (row.subject_type === "CORE") {
      if (row.is_compulsory === false && row.choice_group_id != null) {
        setEditCompulsory("optional");
        setEditChoiceGroup(String(row.choice_group_id));
      } else {
        setEditCompulsory("compulsory");
        setEditChoiceGroup("");
      }
    } else {
      setEditCompulsory("compulsory");
      setEditChoiceGroup("");
    }
    setFormError(null);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setFormError(null);
    setSubmitting(true);
    try {
      let body: { is_compulsory: boolean | null; choice_group_id: number | null };
      if (editRow.subject_type === "ELECTIVE") {
        body = { is_compulsory: null, choice_group_id: null };
      } else if (editCompulsory === "compulsory") {
        body = { is_compulsory: true, choice_group_id: null };
      } else {
        const n = parseInt(editChoiceGroup, 10);
        if (!Number.isFinite(n) || n <= 0) {
          setFormError("Optional core requires a positive choice group ID.");
          setSubmitting(false);
          return;
        }
        body = { is_compulsory: false, choice_group_id: n };
      }
      await apiJson(`/programmes/${programmeId}/subjects/${editRow.subject_id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setEditRow(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRow(row: ProgrammeSubjectRow) {
    if (!window.confirm(`Remove ${row.subject_code} from this programme?`)) return;
    setSubmitting(true);
    try {
      await apiJson(`/programmes/${programmeId}/subjects/${row.subject_id}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setSubmitting(false);
    }
  }

  if (!idValid) {
    return (
      <p className="text-sm text-destructive">
        Invalid programme id. <Link href="/dashboard/admin/programmes">Back to list</Link>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/programmes"
          className={`text-sm font-medium text-primary underline-offset-4 hover:underline ${inputFocusRing} inline-block rounded`}
        >
          ← Programmes
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          {loading ? "Loading…" : programme ? `${programme.code} — ${programme.name}` : "Programme"}
        </h1>
        {programme ? (
          <p className="mt-1 text-sm text-muted-foreground">Programme id {programme.id}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={openAdd}
          disabled={loading || availableSubjects.length === 0}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Add subject
        </button>
        <label className="flex items-center gap-2 text-sm text-card-foreground">
          <input
            type="checkbox"
            checked={groupedView}
            onChange={(e) => setGroupedView(e.target.checked)}
            className="size-4 rounded border-input-border"
          />
          Grouped view (requirements)
        </label>
      </div>

      {availableSubjects.length === 0 && !loading && catalog.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          All catalogue subjects are already linked, or the catalogue is empty.
        </p>
      ) : null}

      {groupedView && requirements ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <section>
            <h2 className="text-sm font-semibold text-card-foreground">Compulsory core</h2>
            <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
              {requirements.compulsory_core.length === 0 ? (
                <li>None</li>
              ) : (
                requirements.compulsory_core.map((r) => (
                  <li key={r.subject_id}>
                    {r.subject_code} — {r.subject_name}
                  </li>
                ))
              )}
            </ul>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-card-foreground">Optional core groups</h2>
            {requirements.optional_core_groups.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None</p>
            ) : (
              requirements.optional_core_groups.map((g) => (
                <div key={g.choice_group_id} className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Group {g.choice_group_id}</p>
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {g.subjects.map((r) => (
                      <li key={r.subject_id}>
                        {r.subject_code} — {r.subject_name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
          <section>
            <h2 className="text-sm font-semibold text-card-foreground">Electives</h2>
            <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
              {requirements.electives.length === 0 ? (
                <li>None</li>
              ) : (
                requirements.electives.map((r) => (
                  <li key={r.subject_id}>
                    {r.subject_code} — {r.subject_name}
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      ) : null}

      {!groupedView ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Compulsory</th>
                <th className="px-4 py-3 font-medium">Choice group</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No subjects linked yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.subject_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono">{r.subject_code}</td>
                    <td className="px-4 py-3">{r.subject_name}</td>
                    <td className="px-4 py-3">{r.subject_type}</td>
                    <td className="px-4 py-3">
                      {r.is_compulsory === null ? "—" : r.is_compulsory ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">{r.choice_group_id ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className={`text-sm text-primary underline-offset-4 hover:underline ${inputFocusRing} rounded`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRow(r)}
                          disabled={submitting}
                          className={`text-sm text-destructive underline-offset-4 hover:underline ${inputFocusRing} rounded disabled:opacity-50`}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {addOpen ? (
        <Modal title="Add subject to programme" titleId="add-ps-title" onClose={() => setAddOpen(false)}>
          <form onSubmit={submitAdd} className="space-y-4">
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div>
              <label htmlFor="sub-pick" className={formLabelClass}>
                Subject
              </label>
              <select
                id="sub-pick"
                className={formInputClass}
                value={addSubjectId}
                onChange={(e) => setAddSubjectId(e.target.value)}
              >
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name} ({s.subject_type})
                  </option>
                ))}
              </select>
            </div>
            {selectedAddSubject?.subject_type === "CORE" ? (
              <>
                <fieldset className="space-y-2">
                  <legend className={formLabelClass}>Core rules</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="coreVar"
                      checked={coreVariant === "compulsory"}
                      onChange={() => setCoreVariant("compulsory")}
                    />
                    Compulsory core
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="coreVar"
                      checked={coreVariant === "optional"}
                      onChange={() => setCoreVariant("optional")}
                    />
                    Optional core (choice group)
                  </label>
                </fieldset>
                {coreVariant === "optional" ? (
                  <div>
                    <label htmlFor="cg" className={formLabelClass}>
                      Choice group ID
                    </label>
                    <input
                      id="cg"
                      type="number"
                      min={1}
                      className={formInputClass}
                      value={choiceGroupId}
                      onChange={(e) => setChoiceGroupId(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Electives are linked without compulsory / choice group flags.
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !selectedAddSubject}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Add"}
            </button>
          </form>
        </Modal>
      ) : null}

      {editRow ? (
        <Modal title="Edit association" titleId="edit-ps-title" onClose={() => setEditRow(null)}>
          <form onSubmit={submitEdit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {editRow.subject_code} — {editRow.subject_name} ({editRow.subject_type})
            </p>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            {editRow.subject_type === "CORE" ? (
              <>
                <fieldset className="space-y-2">
                  <legend className={formLabelClass}>Core rules</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="editCore"
                      checked={editCompulsory === "compulsory"}
                      onChange={() => setEditCompulsory("compulsory")}
                    />
                    Compulsory core
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="editCore"
                      checked={editCompulsory === "optional"}
                      onChange={() => setEditCompulsory("optional")}
                    />
                    Optional core (choice group)
                  </label>
                </fieldset>
                {editCompulsory === "optional" ? (
                  <div>
                    <label htmlFor="ecg" className={formLabelClass}>
                      Choice group ID
                    </label>
                    <input
                      id="ecg"
                      type="number"
                      min={1}
                      className={formInputClass}
                      value={editChoiceGroup}
                      onChange={(e) => setEditChoiceGroup(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No association flags for electives.</p>
            )}
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
    </div>
  );
}
