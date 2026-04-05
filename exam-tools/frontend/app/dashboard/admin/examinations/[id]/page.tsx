"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminTimetableDownloadsPanel } from "@/components/admin-timetable-downloads-panel";
import {
  apiFetch,
  apiJson,
  bulkUploadExaminationSchedules,
  downloadScheduleTemplate,
  type Examination,
  type ExaminationSchedule,
  type ExaminationScheduleBulkUploadResponse,
} from "@/lib/api";
import { formInputClass, formLabelClass, primaryButtonClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const outlineBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";

const DEFAULT_PAPERS_JSON = `[
  {"paper": 1, "date": "2026-06-01", "start_time": "09:00", "end_time": "11:00"}
]`;

function Modal({
  title,
  titleId,
  children,
  onClose,
  wide,
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
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
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg ${wide ? "max-w-3xl" : "max-w-lg"}`}
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

export default function ExaminationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params.id);
  const [exam, setExam] = useState<Examination | null>(null);
  const [schedules, setSchedules] = useState<ExaminationSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [examType, setExamType] = useState("");
  const [examSeries, setExamSeries] = useState("");
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [savingExam, setSavingExam] = useState(false);

  const [scheduleModal, setScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ExaminationSchedule | null>(null);
  const [originalCode, setOriginalCode] = useState("");
  const [papersJson, setPapersJson] = useState(DEFAULT_PAPERS_JSON);
  const [venue, setVenue] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [instructions, setInstructions] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkOverride, setBulkOverride] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<ExaminationScheduleBulkUploadResponse | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(examId)) return;
    setError("");
    setLoading(true);
    try {
      const [ex, sch] = await Promise.all([
        apiJson<Examination>(`/examinations/${examId}`),
        apiJson<ExaminationSchedule[]>(`/examinations/${examId}/schedules`),
      ]);
      setExam(ex);
      setExamType(ex.exam_type);
      setExamSeries(ex.exam_series ?? "");
      setYear(String(ex.year));
      setDescription(ex.description ?? "");
      setSchedules(sch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveExam(e: React.FormEvent) {
    e.preventDefault();
    setSavingExam(true);
    setError("");
    try {
      const y = parseInt(year, 10);
      if (Number.isNaN(y)) throw new Error("Invalid year");
      const updated = await apiJson<Examination>(`/examinations/${examId}`, {
        method: "PUT",
        body: JSON.stringify({
          exam_type: examType.trim(),
          exam_series: examSeries.trim() || null,
          year: y,
          description: description.trim() || null,
        }),
      });
      setExam(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingExam(false);
    }
  }

  function openNewSchedule() {
    setEditingSchedule(null);
    setOriginalCode("");
    setPapersJson(DEFAULT_PAPERS_JSON);
    setVenue("");
    setDurationMin("");
    setInstructions("");
    setScheduleModal(true);
  }

  function openEditSchedule(s: ExaminationSchedule) {
    setEditingSchedule(s);
    setOriginalCode(s.subject_code);
    setPapersJson(JSON.stringify(s.papers, null, 2));
    setVenue(s.venue ?? "");
    setDurationMin(s.duration_minutes != null ? String(s.duration_minutes) : "");
    setInstructions(s.instructions ?? "");
    setScheduleModal(true);
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    setError("");
    try {
      let papers: Record<string, unknown>[];
      try {
        papers = JSON.parse(papersJson) as Record<string, unknown>[];
        if (!Array.isArray(papers)) throw new Error("papers must be a JSON array");
      } catch {
        throw new Error("Invalid papers JSON");
      }
      const dur =
        durationMin.trim() === "" ? null : parseInt(durationMin, 10);
      if (dur != null && Number.isNaN(dur)) throw new Error("Invalid duration");

      if (editingSchedule) {
        await apiFetch(`/examinations/${examId}/schedules/${editingSchedule.id}`, {
          method: "PUT",
          body: JSON.stringify({
            papers,
            venue: venue.trim() || null,
            duration_minutes: dur,
            instructions: instructions.trim() || null,
          }),
        });
      } else {
        if (!originalCode.trim()) throw new Error("Subject code / original code required");
        await apiFetch(`/examinations/${examId}/schedules`, {
          method: "POST",
          body: JSON.stringify({
            original_code: originalCode.trim(),
            papers,
            venue: venue.trim() || null,
            duration_minutes: dur,
            instructions: instructions.trim() || null,
          }),
        });
      }
      setScheduleModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function deleteSchedule(id: number) {
    if (!confirm("Delete this schedule?")) return;
    setError("");
    try {
      await apiFetch(`/examinations/${examId}/schedules/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function deleteExam() {
    if (!confirm("Delete this examination and all schedules?")) return;
    try {
      await apiFetch(`/examinations/${examId}`, { method: "DELETE" });
      router.replace("/dashboard/admin/examinations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!Number.isFinite(examId)) {
    return <p className="text-sm text-destructive">Invalid examination id</p>;
  }

  if (loading && !exam) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!exam) {
    return <p className="text-sm text-destructive">{error || "Not found"}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/admin/examinations"
          className={`text-sm font-medium text-primary hover:underline ${inputFocusRing} rounded-md`}
        >
          ← All examinations
        </Link>
        <h2 className="mt-3 text-xl font-semibold text-card-foreground">
          {exam.year}
          {exam.exam_series ? ` ${exam.exam_series}` : ""} — {exam.exam_type}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate a national or school PDF below (school optional), or open the{" "}
          <Link
            href={`/dashboard/admin/timetable?examId=${examId}`}
            className={`font-medium text-primary hover:underline ${inputFocusRing} rounded-md`}
          >
            Examination timetable
          </Link>{" "}
          screen to work across examinations.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-card-foreground">Examination details</h3>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={saveExam}>
          <div>
            <label className={formLabelClass} htmlFor="et">
              Exam type
            </label>
            <input
              id="et"
              className={formInputClass}
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="es">
              Series
            </label>
            <input
              id="es"
              className={formInputClass}
              value={examSeries}
              onChange={(e) => setExamSeries(e.target.value)}
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="ey">
              Year
            </label>
            <input
              id="ey"
              type="number"
              className={formInputClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={formLabelClass} htmlFor="ed">
              Description
            </label>
            <textarea
              id="ed"
              rows={2}
              className={formInputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={savingExam} className={outlineBtn}>
              {savingExam ? "Saving…" : "Save details"}
            </button>
            <button type="button" className={`${outlineBtn} text-destructive`} onClick={() => void deleteExam()}>
              Delete examination
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-card-foreground">Schedules</h3>
          <button type="button" className={outlineBtn} onClick={openNewSchedule}>
            Add schedule
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4">
          <h4 className="text-sm font-semibold text-card-foreground">Timetable upload (Excel / CSV)</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Download the template (all subjects on the &quot;Schedules&quot; sheet; see &quot;Sample Data&quot;
            for examples). Fill dates and times, then upload. Same column layout as the registration portal.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={outlineBtn}
              onClick={() =>
                void downloadScheduleTemplate(examId, `exam_${examId}_timetable_template.xlsx`)
              }
            >
              Download template
            </button>
            <label className="text-sm text-muted-foreground">
              <span className="sr-only">Upload file</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block max-w-xs text-sm file:mr-2 file:rounded-lg file:border file:border-input-border file:bg-background file:px-3 file:py-2"
                onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-card-foreground">
              <input
                type="checkbox"
                checked={bulkOverride}
                onChange={(e) => setBulkOverride(e.target.checked)}
              />
              Replace existing schedules for the same subject
            </label>
            <button
              type="button"
              className={outlineBtn}
              disabled={!bulkFile || bulkUploading}
              onClick={() => {
                if (!bulkFile) return;
                setBulkUploading(true);
                setError("");
                setBulkResult(null);
                void bulkUploadExaminationSchedules(examId, bulkFile, bulkOverride)
                  .then((r) => {
                    setBulkResult(r);
                    return load();
                  })
                  .catch((e: unknown) => {
                    setError(e instanceof Error ? e.message : "Upload failed");
                  })
                  .finally(() => setBulkUploading(false));
              }}
            >
              {bulkUploading ? "Uploading…" : "Upload"}
            </button>
          </div>
          {bulkResult ? (
            <div className="mt-3 text-sm">
              <p className="text-card-foreground">
                Processed {bulkResult.total_rows} rows:{" "}
                <span className="text-primary">{bulkResult.successful} saved</span>
                {bulkResult.failed > 0 ? (
                  <span className="text-destructive"> · {bulkResult.failed} failed</span>
                ) : null}
              </p>
              {bulkResult.errors.length > 0 ? (
                <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-muted-foreground">
                  {bulkResult.errors.slice(0, 50).map((err, i) => (
                    <li key={`${err.row_number}-${i}`}>
                      Row {err.row_number}
                      {err.field ? ` (${err.field})` : ""}: {err.error_message}
                    </li>
                  ))}
                  {bulkResult.errors.length > 50 ? (
                    <li>… and {bulkResult.errors.length - 50} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        {schedules.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No subject schedules yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 font-medium">Subject</th>
                  <th className="py-2 pr-3 font-medium">Papers</th>
                  <th className="py-2 pr-3 font-medium">Venue</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-border/80">
                    <td className="py-2 pr-3 font-mono text-xs">{s.subject_code}</td>
                    <td className="py-2 pr-3">{s.subject_name}</td>
                    <td className="py-2 pr-3">{Array.isArray(s.papers) ? s.papers.length : 0}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{s.venue ?? "—"}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className={`mr-2 text-primary hover:underline ${inputFocusRing}`}
                        onClick={() => openEditSchedule(s)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`text-destructive hover:underline ${inputFocusRing}`}
                        onClick={() => void deleteSchedule(s.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminTimetableDownloadsPanel examId={examId} schoolFirst />

      {scheduleModal ? (
        <Modal
          title={editingSchedule ? "Edit schedule" : "Add schedule"}
          titleId="sch-modal"
          onClose={() => setScheduleModal(false)}
          wide
        >
          {error ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <form className="flex flex-col gap-4" onSubmit={saveSchedule}>
            {!editingSchedule ? (
              <div>
                <label className={formLabelClass} htmlFor="oc">
                  Subject original code or code
                </label>
                <input
                  id="oc"
                  className={formInputClass}
                  value={originalCode}
                  onChange={(e) => setOriginalCode(e.target.value)}
                  required={!editingSchedule}
                  placeholder="Must match a subject in the catalogue"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Subject: <span className="font-medium text-foreground">{editingSchedule.subject_name}</span> (
                {editingSchedule.subject_code})
              </p>
            )}
            <div>
              <label className={formLabelClass} htmlFor="pj">
                Papers (JSON array)
              </label>
              <textarea
                id="pj"
                required
                rows={8}
                className={`${formInputClass} font-mono text-sm`}
                value={papersJson}
                onChange={(e) => setPapersJson(e.target.value)}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ven">
                Venue (optional)
              </label>
              <input id="ven" className={formInputClass} value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="dur">
                Duration (minutes, optional)
              </label>
              <input
                id="dur"
                type="number"
                className={formInputClass}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="ins">
                Instructions (optional)
              </label>
              <textarea
                id="ins"
                rows={2}
                className={formInputClass}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
            <button type="submit" disabled={savingSchedule} className={primaryButtonClass}>
              {savingSchedule ? "Saving…" : "Save schedule"}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
