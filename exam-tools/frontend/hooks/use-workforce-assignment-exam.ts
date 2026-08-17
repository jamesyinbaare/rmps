"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { listAdminWorkforceRoster, type Examination } from "@/lib/api";
import type { WorkforceKind } from "@/lib/workforce-kind";

/** Prefer ?exam= when valid, otherwise the first examination that already has roster members. */
export function useWorkforceAssignmentExam(
  kind: WorkforceKind,
  exams: Examination[],
): [number | null, (id: number | null) => void] {
  const searchParams = useSearchParams();
  const examFromUrl = Number.parseInt(searchParams.get("exam") ?? "", 10);
  const [examId, setExamId] = useState<number | null>(null);

  useEffect(() => {
    if (exams.length === 0 || examId != null) return;

    if (Number.isInteger(examFromUrl) && exams.some((exam) => exam.id === examFromUrl)) {
      setExamId(examFromUrl);
      return;
    }

    let cancelled = false;
    void (async () => {
      for (const exam of exams) {
        try {
          const rows = await listAdminWorkforceRoster(kind, exam.id);
          if (!cancelled && rows.length > 0) {
            setExamId(exam.id);
            return;
          }
        } catch {
          // try the next examination
        }
      }
      if (!cancelled) setExamId(exams[0]?.id ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, exams, kind, examFromUrl]);

  return [examId, setExamId];
}
