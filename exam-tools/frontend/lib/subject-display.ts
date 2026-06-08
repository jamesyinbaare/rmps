/** Prefer official original subject code when present (matches examiners admin UI). */

export function subjectDisplayCode(subject: {
  code: string;
  original_code?: string | null;
  subject_original_code?: string | null;
  subject_code?: string;
}): string {
  const original = subject.original_code ?? subject.subject_original_code;
  const fallback = subject.code ?? subject.subject_code ?? "";
  return (original?.trim() || fallback).trim();
}

export function subjectDisplayLabel(subject: {
  code: string;
  name: string;
  original_code?: string | null;
  subject_original_code?: string | null;
  subject_code?: string;
  subject_name?: string;
}): string {
  const name = subject.name ?? subject.subject_name ?? "";
  return `${subjectDisplayCode(subject)} — ${name}`;
}
