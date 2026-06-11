"use client";

import { useEffect, useState } from "react";

import {
  getSubjectOfficerMyAssignments,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";

export function useSubjectOfficerAssignments() {
  const [assignments, setAssignments] = useState<SubjectOfficerMeExamAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void getSubjectOfficerMyAssignments()
      .then((data) => setAssignments(data.items))
      .catch((e) => {
        setAssignments([]);
        setError(e instanceof Error ? e.message : "Failed to load assignments");
      })
      .finally(() => setLoading(false));
  }, []);

  return { assignments, loading, error };
}
