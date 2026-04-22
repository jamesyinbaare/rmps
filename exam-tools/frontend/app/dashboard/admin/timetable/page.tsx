"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { AdminTimetableDownloadsPanel } from "@/components/admin-timetable-downloads-panel";
import { apiJson, type Examination } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function AdminTimetableContent() {
  const searchParams = useSearchParams();
  const qExam = searchParams.get("examId") ?? "";

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiJson<Examination[]>("/examinations");
      setExams(data);
      if (qExam && data.some((e) => String(e.id) === qExam)) {
        setExamId(qExam);
      } else if (data.length) {
        setExamId(String(data[0].id));
      } else {
        setExamId("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load examinations");
    } finally {
      setLoading(false);
    }
  }, [qExam]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedId = parseInt(examId, 10);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground">Examination timetable</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download PDF timetables and preview school-filtered rows. Schedules are edited on each
          examination&apos;s detail page.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading examinations…</p>
      ) : exams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No examinations yet. Create one under{" "}
          <Link
            href="/dashboard/admin/examinations"
            className={`font-medium text-primary hover:underline ${inputFocusRing} rounded-md`}
          >
            Examinations
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="max-w-xl">
            <label className={formLabelClass} htmlFor="tt-exam">
              Examination
            </label>
            <select
              id="tt-exam"
              className={formInputClass}
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={String(ex.id)}>
                  {ex.year}
                  {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                </option>
              ))}
            </select>
          </div>
          {Number.isFinite(selectedId) ? (
            <AdminTimetableDownloadsPanel examId={selectedId} />
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AdminExaminationTimetablePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AdminTimetableContent />
    </Suspense>
  );
}
