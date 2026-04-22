"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  apiJson,
  downloadApiFile,
  timetableDownloadQuery,
  type Programme,
  type School,
  type TimetableDownloadFilter,
  type TimetablePreviewResponse,
} from "@/lib/api";
import {
  formInputClass,
  formLabelClass,
  timetableActionButtonClass,
  timetableActionRowClass,
} from "@/lib/form-classes";

type Props = {
  examId: number;
  /** When true, school selector is shown first and school PDF is the primary action (examination detail page). */
  schoolFirst?: boolean;
};

export function AdminTimetableDownloadsPanel({ examId, schoolFirst = false }: Props) {
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<TimetableDownloadFilter>("ALL");
  const [mergeByDate, setMergeByDate] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [preview, setPreview] = useState<TimetablePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError("");
    try {
      const [schoolRes, progRes] = await Promise.all([
        apiJson<{ items: School[] }>("/schools?skip=0&limit=200"),
        apiJson<{ items: Programme[] }>("/programmes?page=1&page_size=100"),
      ]);
      setSchools(schoolRes.items);
      setProgrammes(progRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schools/programmes");
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    setPreview(null);
  }, [examId]);

  const programmeIdNum =
    programmeId.trim() === "" ? null : parseInt(programmeId.trim(), 10);
  const qs = timetableDownloadQuery({
    subject_filter: subjectFilter,
    programme_id:
      programmeIdNum != null && !Number.isNaN(programmeIdNum) ? programmeIdNum : null,
    merge_by_date: mergeByDate,
    orientation,
  });

  async function downloadTimetablePdf() {
    setError("");
    try {
      if (schoolId) {
        const school = schools.find((s) => s.id === schoolId);
        const fn = `timetable_${school?.code ?? schoolId}.pdf`;
        await downloadApiFile(
          `/examinations/${examId}/timetable/schools/${encodeURIComponent(schoolId)}/pdf${qs}`,
          fn,
        );
      } else {
        const fn = `timetable_exam_${examId}_national.pdf`;
        await downloadApiFile(`/examinations/${examId}/timetable/pdf${qs}`, fn);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function loadPreview() {
    if (!schoolId) {
      setError("Select a school for preview");
      return;
    }
    setPreviewLoading(true);
    setError("");
    try {
      const data = await apiJson<TimetablePreviewResponse>(
        `/examinations/${examId}/timetable/schools/${encodeURIComponent(schoolId)}/preview${qs}`,
      );
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  if (!Number.isFinite(examId)) {
    return <p className="text-sm text-destructive">Invalid examination id</p>;
  }

  const manageSchedulesLink = (
    <>
      Manage schedules on the{" "}
      <Link
        href={`/dashboard/admin/examinations/${examId}`}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        examination detail
      </Link>{" "}
      page.
    </>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-card-foreground">
        {schoolFirst ? "Timetable PDFs" : "Download timetables"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {schoolFirst ? (
          <>
            Use <strong className="text-card-foreground">Generate timetable (PDF)</strong> for the full
            national timetable, or choose a school first for that school&apos;s subjects only. Open the{" "}
            <Link
              href={`/dashboard/admin/timetable?examId=${examId}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Examination timetable
            </Link>{" "}
            screen to switch exams.
          </>
        ) : (
          <>
            <strong className="text-card-foreground">Generate timetable (PDF)</strong> produces the national
            timetable when no school is selected, or the school timetable when a school is selected.{" "}
            {manageSchedulesLink}
          </>
        )}
      </p>
      {schoolFirst ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Update papers, dates, and times in the <strong className="text-card-foreground">Schedules</strong>{" "}
          section on this page.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loadingMeta ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading schools and programmes…</p>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {schoolFirst ? (
              <div>
                <label className={formLabelClass} htmlFor="tt-school">
                  School
                </label>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Leave as national to download the full timetable. Choose a school for that school&apos;s
                  subjects only (from its programmes).
                </p>
                <select
                  id="tt-school"
                  className={formInputClass}
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                >
                  <option value="">National — all subjects</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={formLabelClass} htmlFor="tt-subf">
                  Subject filter
                </label>
                <select
                  id="tt-subf"
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
                <label className={formLabelClass} htmlFor="tt-pid">
                  Programme (optional)
                </label>
                <select
                  id="tt-pid"
                  className={formInputClass}
                  value={programmeId}
                  onChange={(e) => setProgrammeId(e.target.value)}
                >
                  <option value="">All programmes for school</option>
                  {programmes.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {!schoolFirst ? (
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className={formLabelClass} htmlFor="tt-school">
                    School
                  </label>
                  <select
                    id="tt-school"
                    className={formInputClass}
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value)}
                  >
                    <option value="">National — all subjects</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
          <fieldset className="mt-4 space-y-3 border-0 p-0">
            <legend className={formLabelClass}>PDF layout</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="tt-merge-mode"
                  checked={!mergeByDate}
                  onChange={() => setMergeByDate(false)}
                  className="h-4 w-4"
                />
                One row per subject
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="tt-merge-mode"
                  checked={mergeByDate}
                  onChange={() => setMergeByDate(true)}
                  className="h-4 w-4"
                />
                Merge by date (same day shares SN and date column)
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="tt-pdf-orientation"
                  checked={orientation === "portrait"}
                  onChange={() => setOrientation("portrait")}
                  className="h-4 w-4"
                />
                Portrait
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="tt-pdf-orientation"
                  checked={orientation === "landscape"}
                  onChange={() => setOrientation("landscape")}
                  className="h-4 w-4"
                />
                Landscape
              </label>
            </div>
          </fieldset>
          <div className={timetableActionRowClass}>
            <button type="button" className={timetableActionButtonClass} onClick={() => void downloadTimetablePdf()}>
              Generate timetable (PDF)
            </button>
            <button
              type="button"
              className={timetableActionButtonClass}
              disabled={previewLoading || !schoolId}
              title={!schoolId ? "Select a school to preview filtered rows" : undefined}
              onClick={() => void loadPreview()}
            >
              {previewLoading ? "Loading preview…" : "Preview school timetable"}
            </button>
          </div>
          {preview && preview.entries.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <p className="mb-2 text-sm font-medium text-card-foreground">
                Preview ({preview.school_code}) — {preview.entries.length} entries
              </p>
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
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
        </>
      )}
    </section>
  );
}
