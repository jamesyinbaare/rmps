"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import type { Examination, Subject, SubjectOfficerAssignmentRow } from "@/lib/api";
import {
  adminDeleteSubjectOfficerAssignments,
  adminGetSubjectOfficerUserAssignments,
  adminListSubjectOfficerAssignments,
  adminUpsertSubjectOfficerAssignments,
  apiJson,
  listAllSubjects,
  listAllSubjectOfficers,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { formatExamLabel } from "@/lib/official-rates-draft";
import { subjectDisplayCode, subjectDisplayLabel } from "@/lib/subject-display";

type SubjectOfficerAssignmentsPanelProps = {
  active: boolean;
  refreshKey?: number;
  onAccountsChanged?: () => void;
};

function subjectTypeLabel(type: string): string {
  return type === "CORE" ? "Core" : type === "ELECTIVE" ? "Elective" : type;
}

export function SubjectOfficerAssignmentsPanel({
  active,
  refreshKey = 0,
  onAccountsChanged,
}: SubjectOfficerAssignmentsPanelProps) {
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [officers, setOfficers] = useState<{ id: string; full_name: string; email: string | null }[]>(
    [],
  );
  const [assignExamId, setAssignExamId] = useState<number | "">("");
  const [assignOfficerId, setAssignOfficerId] = useState("");
  const [assignSubjectIds, setAssignSubjectIds] = useState<number[]>([]);
  const [assignments, setAssignments] = useState<SubjectOfficerAssignmentRow[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<"all" | "CORE" | "ELECTIVE">("all");
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [officerExamAssignments, setOfficerExamAssignments] = useState<
    SubjectOfficerMeExamAssignment[]
  >([]);
  const [officerAssignmentsLoading, setOfficerAssignmentsLoading] = useState(false);
  const [officersLoading, setOfficersLoading] = useState(false);
  const [officersLoadError, setOfficersLoadError] = useState<string | null>(null);

  const sortedSubjects = useMemo(
    () =>
      [...subjects].sort((a, b) =>
        subjectDisplayCode(a).localeCompare(subjectDisplayCode(b), undefined, { sensitivity: "base" }),
      ),
    [subjects],
  );

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return sortedSubjects.filter((s) => {
      if (subjectTypeFilter !== "all" && s.subject_type !== subjectTypeFilter) return false;
      if (!q) return true;
      const code = subjectDisplayCode(s).toLowerCase();
      return code.includes(q) || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
    });
  }, [sortedSubjects, subjectSearch, subjectTypeFilter]);

  const loadAssignments = useCallback(async (examId: number) => {
    setAssignmentsLoading(true);
    try {
      const data = await adminListSubjectOfficerAssignments(examId);
      setAssignments(data.items);
    } catch {
      setAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
    setOfficersLoading(true);
    setOfficersLoadError(null);
    void listAllSubjectOfficers()
      .then((items) => {
        setOfficers(
          items.map((row) => ({
            id: row.id,
            full_name: row.full_name,
            email: row.email,
          })),
        );
      })
      .catch((e) => {
        setOfficers([]);
        setOfficersLoadError(e instanceof Error ? e.message : "Could not load subject officers");
      })
      .finally(() => setOfficersLoading(false));
  }, [active, refreshKey]);

  useEffect(() => {
    if (!active || assignExamId === "") {
      setAssignments([]);
      return;
    }
    setAssignments([]);
    void loadAssignments(assignExamId);
  }, [active, assignExamId, refreshKey, loadAssignments]);

  useEffect(() => {
    if (!active || !assignOfficerId) {
      setOfficerExamAssignments([]);
      return;
    }
    setOfficerAssignmentsLoading(true);
    void adminGetSubjectOfficerUserAssignments(assignOfficerId)
      .then((data) => setOfficerExamAssignments(data.items))
      .catch(() => setOfficerExamAssignments([]))
      .finally(() => setOfficerAssignmentsLoading(false));
  }, [active, assignOfficerId, refreshKey]);

  useEffect(() => {
    if (!assignOfficerId || assignmentsLoading) return;
    const row = assignments.find((a) => a.user_id === assignOfficerId);
    setAssignSubjectIds(row?.subject_ids ?? []);
  }, [assignOfficerId, assignments, assignmentsLoading]);

  function clearForm() {
    setAssignOfficerId("");
    setAssignSubjectIds([]);
    setSubjectSearch("");
    setOfficerExamAssignments([]);
    setAssignError(null);
  }

  function handleExamChange(nextExamId: number | "") {
    setAssignExamId(nextExamId);
    setAssignSubjectIds([]);
    setAssignError(null);
    setAssignMessage(null);
  }

  function loadAssignmentIntoForm(row: SubjectOfficerAssignmentRow) {
    setAssignOfficerId(row.user_id);
    setAssignSubjectIds([...row.subject_ids]);
    setAssignError(null);
    setAssignMessage(null);
  }

  async function handleSaveAssignments() {
    if (assignExamId === "" || !assignOfficerId || assignSubjectIds.length === 0) {
      setAssignError("Select an officer and at least one subject.");
      return;
    }
    setAssignBusy(true);
    setAssignError(null);
    setAssignMessage(null);
    try {
      await adminUpsertSubjectOfficerAssignments(assignExamId, {
        user_id: assignOfficerId,
        subject_ids: assignSubjectIds,
      });
      setAssignMessage("Assignments saved.");
      await loadAssignments(assignExamId);
      if (assignOfficerId) {
        const data = await adminGetSubjectOfficerUserAssignments(assignOfficerId);
        setOfficerExamAssignments(data.items);
      }
      onAccountsChanged?.();
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleDeleteAssignments(userId: string) {
    if (assignExamId === "") return;
    setAssignBusy(true);
    setAssignError(null);
    setAssignMessage(null);
    try {
      await adminDeleteSubjectOfficerAssignments(assignExamId, userId);
      setAssignMessage("Assignments removed.");
      if (assignOfficerId === userId) clearForm();
      await loadAssignments(assignExamId);
      onAccountsChanged?.();
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setAssignBusy(false);
    }
  }

  const selectedOfficer = officers.find((o) => o.id === assignOfficerId);
  const otherExamAssignments = officerExamAssignments.filter(
    (row) => row.examination_id !== assignExamId,
  );
  const selectedExam = exams.find((ex) => ex.id === assignExamId);

  return (
    <div className="space-y-5">
      <div>
        <label className={formLabelClass} htmlFor="so-assign-exam">
          Examination
        </label>
        <select
          id="so-assign-exam"
          className={formInputClass}
          value={assignExamId}
          onChange={(e) => {
            handleExamChange(e.target.value ? Number(e.target.value) : "");
          }}
        >
          <option value="">Select examination…</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {formatExamLabel(ex)}
            </option>
          ))}
        </select>
      </div>

      {assignExamId === "" ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Choose an examination to view and manage subject officer assignments.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Current assignments</h3>
              <span className="text-xs text-muted-foreground">
                {assignmentsLoading
                  ? "Loading…"
                  : `${assignments.length} officer${assignments.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Officer</th>
                    <th className="px-3 py-2.5 font-medium">Subjects</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentsLoading ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        Loading assignments…
                      </td>
                    </tr>
                  ) : assignments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        No assignments for this examination yet.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((row) => (
                      <tr key={row.user_id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-medium text-foreground">{row.full_name}</p>
                          <p className="text-xs text-muted-foreground">{row.email ?? "—"}</p>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {row.subjects.map((s) => (
                              <span
                                key={s.subject_id}
                                className="inline-flex max-w-full rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                              >
                                <span className="font-mono font-medium">{subjectDisplayCode(s)}</span>
                                <span className="mx-1 text-muted-foreground">·</span>
                                <span className="truncate">{s.subject_name}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-sm text-primary hover:underline"
                              onClick={() => loadAssignmentIntoForm(row)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-sm text-destructive hover:underline"
                              disabled={assignBusy}
                              onClick={() => void handleDeleteAssignments(row.user_id)}
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
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-muted/15 p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Assign subjects</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Assignments are saved per examination. The same officer can hold different subjects on
                different examinations — choose the examination above, then pick subjects here.
                Subject codes shown are the official original codes used across examiner tools.
              </p>
              {selectedExam ? (
                <p className="mt-2 text-xs font-medium text-foreground">
                  Assigning for {formatExamLabel(selectedExam)}
                </p>
              ) : null}
            </div>

            <div>
              <label className={formLabelClass} htmlFor="so-assign-officer">
                Subject officer
              </label>
              <select
                id="so-assign-officer"
                className={formInputClass}
                value={assignOfficerId}
                disabled={officersLoading}
                onChange={(e) => {
                  setAssignOfficerId(e.target.value);
                  setAssignError(null);
                }}
              >
                <option value="">
                  {officersLoading
                    ? "Loading officers…"
                    : officers.length === 0
                      ? "No subject officers found"
                      : "Select officer…"}
                </option>
                {officers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.full_name}
                    {row.email ? ` (${row.email})` : ""}
                  </option>
                ))}
              </select>
              {officersLoadError ? (
                <p className="mt-1.5 text-xs text-destructive" role="alert">
                  {officersLoadError}
                </p>
              ) : !officersLoading && officers.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Create a subject officer account on the Accounts tab first.
                </p>
              ) : null}
            </div>

            {assignOfficerId ? (
              <>
                {officerAssignmentsLoading ? (
                  <p className="text-xs text-muted-foreground">Loading officer assignments…</p>
                ) : otherExamAssignments.length > 0 ? (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Also assigned on {otherExamAssignments.length} other examination
                      {otherExamAssignments.length === 1 ? "" : "s"}:
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {otherExamAssignments.map((row) => (
                        <li key={row.examination_id}>
                          <span className="font-medium text-foreground">{row.examination_name}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            — {row.subjects.length} subject{row.subjects.length === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      Change the examination above to assign this officer on another exam.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <input
                    type="search"
                    placeholder="Search subject code or name…"
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    className={`${formInputClass} min-w-[200px] flex-1`}
                    aria-label="Search subjects"
                  />
                  <select
                    className={`${formInputClass} w-auto min-w-32`}
                    value={subjectTypeFilter}
                    onChange={(e) =>
                      setSubjectTypeFilter(e.target.value as "all" | "CORE" | "ELECTIVE")
                    }
                    aria-label="Filter by subject type"
                  >
                    <option value="all">All types</option>
                    <option value="CORE">Core only</option>
                    <option value="ELECTIVE">Elective only</option>
                  </select>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 border-b border-border bg-muted/80 text-xs text-muted-foreground">
                      <tr>
                        <th className="w-10 px-2 py-2" aria-label="Select" />
                        <th className="px-2 py-2 font-medium">Code</th>
                        <th className="px-2 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubjects.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                            No subjects match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredSubjects.map((s) => {
                          const checked = assignSubjectIds.includes(s.id);
                          return (
                            <tr
                              key={s.id}
                              className={`border-b border-border last:border-0 ${checked ? "bg-primary/5" : ""}`}
                            >
                              <td className="px-2 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  aria-label={subjectDisplayLabel(s)}
                                  onChange={(e) => {
                                    setAssignSubjectIds((prev) =>
                                      e.target.checked
                                        ? [...prev, s.id]
                                        : prev.filter((id) => id !== s.id),
                                    );
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2 font-mono text-xs font-medium text-foreground">
                                {subjectDisplayCode(s)}
                              </td>
                              <td className="px-2 py-2 text-foreground">{s.name}</td>
                              <td className="px-2 py-2 text-xs text-muted-foreground">
                                {subjectTypeLabel(s.subject_type)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {assignSubjectIds.length > 0 ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      {assignSubjectIds.length} subject{assignSubjectIds.length === 1 ? "" : "s"}{" "}
                      selected
                      {selectedOfficer ? ` for ${selectedOfficer.full_name}` : ""}:
                    </p>
                    <p className="text-foreground">
                      {assignSubjectIds
                        .map((id) => {
                          const s = subjects.find((sub) => sub.id === id);
                          return s ? subjectDisplayLabel(s) : String(id);
                        })
                        .join("; ")}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select an officer to choose subjects.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={adminUserBtnPrimary}
                disabled={assignBusy || !assignOfficerId || assignSubjectIds.length === 0}
                onClick={() => void handleSaveAssignments()}
              >
                {assignBusy ? "Saving…" : "Save assignments"}
              </button>
              <button
                type="button"
                className={adminUserBtnSecondary}
                disabled={assignBusy}
                onClick={clearForm}
              >
                Clear form
              </button>
              {assignOfficerId ? (
                <button
                  type="button"
                  className={adminUserBtnSecondary}
                  disabled={assignBusy}
                  onClick={() => void handleDeleteAssignments(assignOfficerId)}
                >
                  Remove all for officer
                </button>
              ) : null}
            </div>
          </section>
        </>
      )}

      {assignMessage ? (
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground" role="status">
          {assignMessage}
        </p>
      ) : null}
      {assignError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {assignError}
        </p>
      ) : null}
    </div>
  );
}
