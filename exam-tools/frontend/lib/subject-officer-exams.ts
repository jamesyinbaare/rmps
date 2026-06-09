import type { Examination, Subject } from "@/lib/api";
import type { SubjectOfficerMeAssignmentSubject, SubjectOfficerMeExamAssignment } from "@/lib/api";

export function assignmentSubjectToSubject(row: SubjectOfficerMeAssignmentSubject): Subject {
  return {
    id: row.subject_id,
    code: row.subject_code,
    original_code: row.subject_original_code ?? null,
    name: row.subject_name,
    subject_type: row.subject_type as Subject["subject_type"],
    created_at: "",
    updated_at: "",
  };
}

/** Minimal Examination rows for shells that expect `Examination[]`; label via `examination_name`. */
export function assignmentsToExaminations(
  assignments: SubjectOfficerMeExamAssignment[],
): Examination[] {
  return assignments.map((a) => ({
    id: a.examination_id,
    year: 0,
    exam_series: null,
    exam_type: a.examination_name,
    description: a.examination_name,
    created_at: "",
    updated_at: "",
  }));
}

export function examLabelFromAssignment(
  assignments: SubjectOfficerMeExamAssignment[],
  examId: number,
): string {
  return assignments.find((a) => a.examination_id === examId)?.examination_name ?? `Exam ${examId}`;
}

export function subjectsForExam(
  assignments: SubjectOfficerMeExamAssignment[],
  examId: number | null,
): Subject[] {
  if (examId == null) return [];
  const row = assignments.find((a) => a.examination_id === examId);
  if (!row) return [];
  return row.subjects.map(assignmentSubjectToSubject);
}

export function subjectIdsForExam(
  assignments: SubjectOfficerMeExamAssignment[],
  examId: number | null,
): number[] {
  if (examId == null) return [];
  const row = assignments.find((a) => a.examination_id === examId);
  if (!row) return [];
  return row.subjects.map((s) => s.subject_id);
}

export function subjectNamesSummary(
  assignments: SubjectOfficerMeExamAssignment[],
  examId: number | null,
): string | null {
  if (examId == null) return null;
  const row = assignments.find((a) => a.examination_id === examId);
  if (!row) return null;
  const names = row.subjects.map((s) => s.subject_name);
  return names.length ? names.join(", ") : "None";
}

export function withExamQuery(href: string, examId: number | null): string {
  if (examId == null) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}exam=${examId}`;
}
