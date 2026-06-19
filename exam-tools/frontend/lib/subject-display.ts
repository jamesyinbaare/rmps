/** Prefer official original subject code when present (matches examiners admin UI). */

export function subjectOriginalCode(subject: {
  original_code?: string | null;
  subject_original_code?: string | null;
}): string | null {
  const original = subject.original_code ?? subject.subject_original_code;
  const trimmed = original?.trim();
  return trimmed || null;
}

export function subjectDisplayCode(subject: {
  code?: string;
  original_code?: string | null;
  subject_original_code?: string | null;
  subject_code?: string;
}): string {
  const original = subjectOriginalCode(subject);
  const fallback = subject.code ?? subject.subject_code ?? "";
  return (original || fallback).trim();
}

export function subjectDisplayLabel(subject: {
  code?: string;
  name?: string;
  original_code?: string | null;
  subject_original_code?: string | null;
  subject_code?: string;
  subject_name?: string;
}): string {
  const name = subject.name ?? subject.subject_name ?? "";
  return `${subjectDisplayCode(subject)} — ${name}`;
}
