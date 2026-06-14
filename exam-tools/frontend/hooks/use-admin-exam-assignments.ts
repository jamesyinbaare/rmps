"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { listExaminations, type Examination, type SubjectOfficerMeExamAssignment } from "@/lib/api";

export function useAdminExamAssignments() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listExaminations();
      setExams(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const assignments = useMemo<SubjectOfficerMeExamAssignment[]>(
    () =>
      exams.map((ex) => ({
        examination_id: ex.id,
        examination_name: `${ex.exam_type} ${ex.year}${ex.exam_series ? ` (${ex.exam_series})` : ""}`,
        subjects: [],
      })),
    [exams],
  );

  return { assignments, loading, reload: loadExams };
}
