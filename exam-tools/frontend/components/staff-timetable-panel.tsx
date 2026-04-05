"use client";

import { useCallback, useEffect, useState } from "react";

import {
  apiJson,
  downloadApiFile,
  timetableDownloadQuery,
  type Examination,
  type MyCenterSchoolsResponse,
  type TimetableDownloadFilter,
  type TimetablePreviewResponse,
} from "@/lib/api";
import {
  formInputClass,
  formLabelClass,
  timetableActionButtonClass,
  timetableActionRowClass,
} from "@/lib/form-classes";

export function StaffTimetablePanel() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<TimetableDownloadFilter>("ALL");
  const [mergeByDate, setMergeByDate] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [programmeId, setProgrammeId] = useState("");
  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [centerSchools, setCenterSchools] = useState<MyCenterSchoolsResponse | null>(null);
  const [preview, setPreview] = useState<TimetablePreviewResponse | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);
  const [error, setError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadExams = useCallback(async () => {
    setLoadingExams(true);
    setError("");
    try {
      const examData = await apiJson<Examination[]>("/examinations/public-list");
      setExams(examData);
      setExamId((prev) => (prev ? prev : examData.length ? String(examData[0].id) : ""));
      try {
        const scopeData = await apiJson<MyCenterSchoolsResponse>(
          "/examinations/timetable/my-center-schools",
        );
        setCenterSchools(scopeData);
      } catch {
        setCenterSchools(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load examinations");
    } finally {
      setLoadingExams(false);
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const programmeIdNum =
    programmeId.trim() === "" ? null : parseInt(programmeId.trim(), 10);
  const filterSchoolIdTrimmed = filterSchoolId.trim();
  const qs = timetableDownloadQuery({
    subject_filter: subjectFilter,
    programme_id:
      programmeIdNum != null && !Number.isNaN(programmeIdNum) ? programmeIdNum : null,
    filter_school_id: filterSchoolIdTrimmed !== "" ? filterSchoolIdTrimmed : null,
    merge_by_date: mergeByDate,
    orientation,
  });

  async function downloadPdf() {
    if (!examId) {
      setError("Select an examination");
      return;
    }
    setError("");
    try {
      await downloadApiFile(
        `/examinations/${examId}/timetable/my-school/pdf${qs}`,
        `timetable_school.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function loadPreview() {
    if (!examId) {
      setError("Select an examination");
      return;
    }
    setPreviewLoading(true);
    setError("");
    try {
      const data = await apiJson<TimetablePreviewResponse>(
        `/examinations/${examId}/timetable/my-school/preview${qs}`,
      );
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-card-foreground">Examination timetable</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Rows are built from registered candidates in your examination centre (the centre host and every school
        that writes there). Use the optional school filter to limit to one school. If no candidates are
        registered for this examination yet, the timetable is empty.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loadingExams ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading examinations…</p>
      ) : exams.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No examinations are configured yet. Contact your administrator.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <label className={formLabelClass} htmlFor="staff-exam">
              Examination
            </label>
            <select
              id="staff-exam"
              className={formInputClass}
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setPreview(null);
              }}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={String(ex.id)}>
                  {ex.year}
                  {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                </option>
              ))}
            </select>
          </div>
          {centerSchools && centerSchools.schools.length > 0 ? (
            <div>
              <label className={formLabelClass} htmlFor="staff-school-filter">
                School filter (optional)
              </label>
              <select
                id="staff-school-filter"
                className={formInputClass}
                value={filterSchoolId}
                onChange={(e) => {
                  setFilterSchoolId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">All schools at centre</option>
                {centerSchools.schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={formLabelClass} htmlFor="staff-subf">
                Subject filter
              </label>
              <select
                id="staff-subf"
                className={formInputClass}
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value as TimetableDownloadFilter)}
              >
                <option value="ALL">All subjects</option>
                <option value="CORE_ONLY">Core only</option>
                <option value="ELECTIVE_ONLY">Elective only</option>
              </select>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="staff-pid">
                Programme ID (optional)
              </label>
              <input
                id="staff-pid"
                type="number"
                className={formInputClass}
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
                placeholder="Filter to one programme"
              />
            </div>
          </div>
          <fieldset className="space-y-3 border-0 p-0">
            <legend className={formLabelClass}>PDF layout</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="staff-merge-mode"
                  checked={!mergeByDate}
                  onChange={() => setMergeByDate(false)}
                  className="h-4 w-4"
                />
                One row per subject
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="staff-merge-mode"
                  checked={mergeByDate}
                  onChange={() => setMergeByDate(true)}
                  className="h-4 w-4"
                />
                Merge by date
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="staff-pdf-orientation"
                  checked={orientation === "portrait"}
                  onChange={() => setOrientation("portrait")}
                  className="h-4 w-4"
                />
                Portrait
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="staff-pdf-orientation"
                  checked={orientation === "landscape"}
                  onChange={() => setOrientation("landscape")}
                  className="h-4 w-4"
                />
                Landscape
              </label>
            </div>
          </fieldset>
          <div className={timetableActionRowClass}>
            <button type="button" className={timetableActionButtonClass} onClick={() => void downloadPdf()}>
              Download timetable (PDF)
            </button>
            <button
              type="button"
              className={timetableActionButtonClass}
              disabled={previewLoading}
              onClick={() => void loadPreview()}
            >
              {previewLoading ? "Loading preview…" : "Preview timetable"}
            </button>
          </div>
          {preview && preview.entries.length > 0 ? (
            <div className="overflow-x-auto pt-2">
              <p className="mb-2 text-sm font-medium text-card-foreground">
                {preview.entries.length} entries
                {preview.school_code ? ` (PDF header: ${preview.school_code})` : ""}
              </p>
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Date</th>
                    <th className="py-2 pr-2 font-medium">Time</th>
                    <th className="py-2 pr-2 font-medium">Subject</th>
                    <th className="py-2 font-medium">Paper</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.entries.map((en, i) => (
                    <tr key={`${en.subject_code}-${i}`} className="border-b border-border/80">
                      <td className="py-2 pr-2">{en.examination_date}</td>
                      <td className="py-2 pr-2">
                        {en.examination_time}
                        {en.examination_end_time ? ` – ${en.examination_end_time}` : ""}
                      </td>
                      <td className="py-2 pr-2">
                        {en.subject_name}{" "}
                        <span className="text-muted-foreground">({en.subject_code})</span>
                      </td>
                      <td className="py-2">{en.paper}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {preview && preview.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No timetable rows for candidates in scope (or their subject codes do not match this
              examination&apos;s schedule).
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
