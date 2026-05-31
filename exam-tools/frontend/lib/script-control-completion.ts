/** Worked-scripts completion helpers (admin edit + depot verify). */

import type { ScriptPaperSlotResponse, ScriptSubjectRowResponse } from "@/lib/api";

export type SubjectCompletion = {
  totalSeries: number;
  recordedSeries: number;
  verifiedSeries: number;
  notRecordedSeries: number;
};

export type SubjectEditStatus = "needs_work" | "verified" | "empty";

export type SubjectEditStatusFilter = "all" | "needs_work" | "verified";

export function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isPaperWritten(examinationDate: string | null | undefined, todayIso: string): boolean {
  return examinationDate != null && examinationDate <= todayIso;
}

/** Count series slots on timetable papers that have been written (exam date passed or today). */
export function buildSubjectCompletion(
  subject: ScriptSubjectRowResponse,
  todayIso: string,
): SubjectCompletion {
  let totalSeries = 0;
  let recordedSeries = 0;
  let verifiedSeries = 0;
  let notRecordedSeries = 0;

  for (const paper of subject.papers) {
    if (!isPaperWritten(paper.examination_date ?? null, todayIso)) continue;
    for (const series of paper.series) {
      totalSeries += 1;
      if (series.packing == null) {
        notRecordedSeries += 1;
      } else {
        recordedSeries += 1;
        if (series.verified || series.packing.no_scripts) {
          verifiedSeries += 1;
        }
      }
    }
  }

  return { totalSeries, recordedSeries, verifiedSeries, notRecordedSeries };
}

export function subjectEditStatus(completion: SubjectCompletion): SubjectEditStatus {
  if (completion.totalSeries === 0) return "empty";
  if (completion.notRecordedSeries > 0) return "needs_work";
  if (completion.verifiedSeries >= completion.totalSeries) return "verified";
  return "needs_work";
}

export function filterSubjectsByEditStatus(
  subjects: ScriptSubjectRowResponse[],
  filter: SubjectEditStatusFilter,
  todayIso: string,
): ScriptSubjectRowResponse[] {
  if (filter === "all") return subjects;
  return subjects.filter((sub) => {
    const completion = buildSubjectCompletion(sub, todayIso);
    const st = subjectEditStatus(completion);
    if (filter === "needs_work") return st === "needs_work";
    return st === "verified";
  });
}

export function schoolSubjectsSummary(subjects: ScriptSubjectRowResponse[], todayIso: string) {
  let needsWork = 0;
  let verified = 0;
  let empty = 0;
  for (const sub of subjects) {
    const c = buildSubjectCompletion(sub, todayIso);
    const st = subjectEditStatus(c);
    if (st === "needs_work") needsWork += 1;
    else if (st === "verified") verified += 1;
    else empty += 1;
  }
  return { total: subjects.length, needsWork, verified, empty };
}

export function displaySubjectCode(subject: Pick<ScriptSubjectRowResponse, "subject_code" | "subject_original_code">): string {
  const orig = subject.subject_original_code?.trim();
  return orig ? orig : subject.subject_code;
}
