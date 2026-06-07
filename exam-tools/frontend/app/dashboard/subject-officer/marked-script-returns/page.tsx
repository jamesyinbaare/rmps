"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  getMarkedScriptReturns,
  getStaffDefaultExamination,
  getSubjectOfficerMyAssignments,
  upsertMarkedScriptReturn,
  verifyMarkedScriptReturn,
  type Examination,
  type MarkedScriptReturnGridResponse,
  type MarkedScriptReturnRow,
  type SubjectOfficerMeAssignmentSubject,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

export default function SubjectOfficerMarkedScriptReturnsPage() {
  const [exam, setExam] = useState<Examination | null>(null);
  const [subjects, setSubjects] = useState<SubjectOfficerMeAssignmentSubject[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [grid, setGrid] = useState<MarkedScriptReturnGridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void getStaffDefaultExamination()
      .then(setExam)
      .catch(() => setExam(null));
    void getSubjectOfficerMyAssignments()
      .then((data) => {
        const assigned = data.items[0]?.subjects ?? [];
        setSubjects(assigned);
        setSubjectId(assigned[0]?.subject_id ?? null);
      })
      .catch(() => {
        setSubjects([]);
        setSubjectId(null);
      });
  }, []);

  const loadGrid = useCallback(async () => {
    if (exam == null || subjectId == null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMarkedScriptReturns(exam.id, subjectId);
      setGrid(data);
      const nextDrafts: Record<string, string> = {};
      for (const row of data.rows) {
        const key = rowKey(row);
        nextDrafts[key] =
          row.returned_booklets != null ? String(row.returned_booklets) : "";
      }
      setDrafts(nextDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load returns");
      setGrid(null);
    } finally {
      setLoading(false);
    }
  }, [exam, subjectId]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  const summary = grid?.summary ?? {};

  const subjectOptions = useMemo(
    () =>
      subjects.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} — ${s.subject_name}`,
      })),
    [subjects],
  );

  async function saveRow(row: MarkedScriptReturnRow) {
    if (exam == null || subjectId == null) return;
    const key = rowKey(row);
    const raw = drafts[key]?.trim() ?? "";
    const returned = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(returned) || returned < 0) {
      setError("Enter a valid returned booklet count.");
      return;
    }
    setBusyKey(key);
    setError(null);
    try {
      await upsertMarkedScriptReturn(exam.id, row.examiner_id, row.paper_number, subjectId, {
        returned_booklets: returned,
        notes: row.notes,
      });
      await loadGrid();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function verifyRow(row: MarkedScriptReturnRow, allowMismatch = false) {
    if (exam == null || subjectId == null) return;
    const key = rowKey(row);
    setBusyKey(key);
    setError(null);
    try {
      await verifyMarkedScriptReturn(
        exam.id,
        row.examiner_id,
        row.paper_number,
        subjectId,
        { allow_mismatch: allowMismatch, notes: row.notes },
      );
      await loadGrid();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Marked script returns" staffRole="subject-officer">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[14rem] flex-1">
                <label className={formLabelClass} htmlFor="msr-subject">
                  Subject
                </label>
                <SearchableCombobox
                  id="msr-subject"
                  options={subjectOptions}
                  value={subjectId != null ? String(subjectId) : ""}
                  onChange={(v) => setSubjectId(v ? Number(v) : null)}
                  placeholder="Select subject…"
                  searchPlaceholder="Search subjects…"
                  widthClass="w-full"
                  showAllOption={false}
                />
              </div>
            </div>
            {grid ? (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1">
                  Pending: {summary.pending ?? 0}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1">
                  Partial: {summary.partial ?? 0}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1">
                  Complete: {summary.complete ?? 0}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-800 dark:text-emerald-300">
                  Verified: {summary.verified ?? 0}
                </span>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grid && grid.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No allocation assignments found for this subject yet.
            </p>
          ) : grid ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Examiner</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Paper</th>
                    <th className="px-3 py-2">Expected</th>
                    <th className="px-3 py-2">Returned</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => {
                    const key = rowKey(row);
                    const isBusy = busyKey === key;
                    return (
                      <tr key={key} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{row.examiner_name}</td>
                        <td className="px-3 py-2">{row.examiner_type}</td>
                        <td className="px-3 py-2">{row.paper_number}</td>
                        <td className="px-3 py-2">{row.expected_booklets}</td>
                        <td className="px-3 py-2">
                          <input
                            className={`${formInputClass} w-24`}
                            value={drafts[key] ?? ""}
                            disabled={row.status === "verified" || isBusy}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 capitalize">{row.status}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={row.status === "verified" || isBusy}
                              onClick={() => void saveRow(row)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={row.status === "verified" || isBusy}
                              onClick={() => void verifyRow(row, row.returned_booklets !== row.expected_booklets)}
                            >
                              Verify
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}

function rowKey(row: MarkedScriptReturnRow): string {
  return `${row.examiner_id}-${row.paper_number}-${row.allocation_run_id}`;
}
