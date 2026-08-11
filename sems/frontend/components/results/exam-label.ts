import type { Exam } from "@/types/document";

export function examLabel(exam: Pick<Exam, "exam_type" | "series" | "year">): string {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${typeLabel} — ${exam.series} ${exam.year}`;
}
