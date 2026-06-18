"use client";

import { Download, Eye, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import {
  downloadAdminExaminerMarkingAttendanceSheet,
  downloadAdminExaminerMarkingAttendanceSheetsZip,
  fetchAdminExaminerMarkingAttendanceSheetBlob,
  getAdminExaminerMarkingAttendanceSheetSummary,
  listAdminExaminerMarkingAttendanceSheets,
  listAllSubjects,
  listExaminations,
  type ExaminerMarkingAttendanceSheetAdmin,
  type Examination,
  type Subject,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

const btnSecondary =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminExaminerAttendanceSheetsPage() {
  const searchParams = useSearchParams();
  const initialExamId = searchParams.get("exam") ? Number(searchParams.get("exam")) : null;

  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(initialExamId);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [attendanceDate, setAttendanceDate] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ExaminerMarkingAttendanceSheetAdmin[]>([]);
  const [summary, setSummary] = useState<{ total_uploads: number; cohorts_with_uploads: number; cohorts_missing: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [examRows, subjectRows] = await Promise.all([listExaminations(), listAllSubjects()]);
        setExams(examRows);
        setSubjects(subjectRows);
        if (examId == null && examRows.length > 0) setExamId(examRows[0]!.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load filters.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial exam from URL only
  }, []);

  useEffect(() => {
    if (subjectId != null) return;
    if (subjects.length > 0) setSubjectId(subjects[0]!.id);
  }, [subjectId, subjects]);

  const loadData = useCallback(async () => {
    if (examId == null) return;
    setLoading(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        listAdminExaminerMarkingAttendanceSheets(examId, {
          subjectId,
          attendanceDate: attendanceDate || null,
          q: search || null,
          page: 1,
          pageSize: 200,
        }),
        getAdminExaminerMarkingAttendanceSheetSummary(examId, {
          subjectId,
          attendanceDate: attendanceDate || null,
        }),
      ]);
      setItems(list.items);
      setSummary(sum);
    } catch (e) {
      setItems([]);
      setSummary(null);
      setError(e instanceof Error ? e.message : "Failed to load sheets.");
    } finally {
      setLoading(false);
    }
  }, [attendanceDate, examId, search, subjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [examId, exams]);

  async function handlePreview(sheet: ExaminerMarkingAttendanceSheetAdmin) {
    if (examId == null) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await fetchAdminExaminerMarkingAttendanceSheetBlob(examId, sheet.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewTitle(sheet.original_filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleZipDownload() {
    if (examId == null || subjectId == null) return;
    setBusy(true);
    setError(null);
    try {
      await downloadAdminExaminerMarkingAttendanceSheetsZip({
        examId,
        subjectId,
        attendanceDate: attendanceDate || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zip download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <OfficialAccountsPageIntro
          title="Examiner marking attendance sheets"
          description="Review signed paper attendance sheets uploaded by subject officers, grouped by cohort and date."
        />

        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={formLabelClass} htmlFor="admin-em-att-exam">
                Examination
              </label>
              <select
                id="admin-em-att-exam"
                className={cn(formInputClass, "mt-1 h-10 w-full")}
                value={examId ?? ""}
                onChange={(e) => setExamId(Number(e.target.value))}
              >
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.exam_type} {exam.year}
                    {exam.exam_series ? ` (${exam.exam_series})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="admin-em-att-subject">
                Subject
              </label>
              <select
                id="admin-em-att-subject"
                className={cn(formInputClass, "mt-1 h-10 w-full")}
                value={subjectId ?? ""}
                onChange={(e) => setSubjectId(Number(e.target.value))}
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subjectDisplayLabel(subject)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="admin-em-att-date">
                Date
              </label>
              <input
                id="admin-em-att-date"
                type="date"
                className={cn(formInputClass, "mt-1 h-10 w-full")}
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="admin-em-att-search">
                Search
              </label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="admin-em-att-search"
                  className={cn(formInputClass, "h-10 w-full pl-9")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cohort, filename, uploader…"
                />
              </div>
            </div>
          </div>

          {summary ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {summary.total_uploads} upload{summary.total_uploads === 1 ? "" : "s"} · {summary.cohorts_with_uploads} cohort
              {summary.cohorts_with_uploads === 1 ? "" : "s"} with uploads
              {summary.cohorts_missing != null ? ` · ${summary.cohorts_missing} missing` : ""}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={busy || examId == null || subjectId == null} onClick={() => void handleZipDownload()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download zip
            </button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No signed sheets match the current filters{selectedExam ? ` for ${selectedExam.exam_type} ${selectedExam.year}` : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Cohort</th>
                    <th className="px-4 py-3">File</th>
                    <th className="px-4 py-3">Uploaded by</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((sheet) => (
                    <tr key={sheet.id} className="border-b border-border/70 align-middle">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateLabel(sheet.attendance_date)}</td>
                      <td className="px-4 py-3">{sheet.subject_code}</td>
                      <td className="px-4 py-3">{sheet.cohort_name}</td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs truncate font-medium">{sheet.original_filename}</div>
                        {sheet.notes ? <div className="text-xs text-muted-foreground">{sheet.notes}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sheet.uploader_full_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" className={btnSecondary} disabled={busy || examId == null} onClick={() => void handlePreview(sheet)}>
                            <Eye className="size-4" />
                            Preview
                          </button>
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={busy || examId == null}
                            onClick={() => void downloadAdminExaminerMarkingAttendanceSheet(examId!, sheet)}
                          >
                            <Download className="size-4" />
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {previewUrl ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <button type="button" aria-label="Close preview" className="absolute inset-0 bg-foreground/50" onClick={() => { setPreviewUrl(null); setPreviewTitle(null); }} />
            <div className="relative z-10 flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="truncate text-sm font-semibold">{previewTitle}</h2>
                <button type="button" className={btnSecondary} onClick={() => { setPreviewUrl(null); setPreviewTitle(null); }}>
                  Close
                </button>
              </div>
              <iframe title={previewTitle ?? "Preview"} src={previewUrl} className="min-h-0 flex-1 bg-muted/20" />
            </div>
          </div>
        ) : null}
      </div>
    </RoleGuard>
  );
}
