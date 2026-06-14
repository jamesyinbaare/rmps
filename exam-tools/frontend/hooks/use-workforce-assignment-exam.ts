"use client";

import { useEffect, useState } from "react";

import { listAdminWorkforceRoster, type Examination } from "@/lib/api";
import type { WorkforceKind } from "@/lib/workforce-kind";

/** Prefer the first examination that already has roster members. */
export function useWorkforceAssignmentExam(
  kind: WorkforceKind,
  exams: Examination[],
): [number | null, (id: number | null) => void] {
  const [examId, setExamId] = useState<number | null>(null);

  useEffect(() => {
    if (exams.length === 0 || examId != null) return;

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
  }, [examId, exams, kind]);

  return [examId, setExamId];
}
