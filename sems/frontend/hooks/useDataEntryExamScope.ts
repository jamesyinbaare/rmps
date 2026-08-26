"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { getAllExams, getCurrentUser, listExamSubjects } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type { Exam, ExamType, Subject, UserRole } from "@/types/document";

export const DATA_ENTRY_EXAM_STORAGE_KEY = "sems.dataEntry.examId";

type UseDataEntryExamScopeOptions = {
  /** Current ops page path used when syncing exam_id into the URL. */
  path: string;
};

export function useDataEntryExamScope({ path }: UseDataEntryExamScopeOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole | undefined>();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);

  const applyExamId = useCallback(
    (id: number | null) => {
      setExamId(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id != null) {
        try {
          localStorage.setItem(DATA_ENTRY_EXAM_STORAGE_KEY, String(id));
        } catch {
          /* ignore */
        }
        params.set("exam_id", String(id));
      } else {
        try {
          localStorage.removeItem(DATA_ENTRY_EXAM_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        params.delete("exam_id");
      }
      const qs = params.toString();
      router.replace(qs ? `${path}?${qs}` : path);
    },
    [path, router, searchParams]
  );

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        const role = normalizeRole(user.role);
        if (role !== "SUPER_ADMIN" && role !== "REGISTRAR") {
          router.replace("/");
          return;
        }
        setAuthorized(true);
        setCurrentRole(role as UserRole);

        const examsData = await getAllExams().catch(() => []);
        setExams(Array.isArray(examsData) ? examsData : []);

        const fromQuery = searchParams.get("exam_id");
        let initial: number | null = fromQuery ? Number(fromQuery) : null;
        if (initial == null || Number.isNaN(initial)) {
          try {
            const stored = localStorage.getItem(DATA_ENTRY_EXAM_STORAGE_KEY);
            if (stored) initial = Number(stored);
          } catch {
            /* ignore */
          }
        }
        if (initial != null && !Number.isNaN(initial)) {
          setExamId(initial);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      return;
    }

    let cancelled = false;
    const loadSubjects = async () => {
      try {
        const examSubjects = await listExamSubjects(examId);
        if (cancelled) return;
        const selectedExam = exams.find((e) => e.id === examId);
        const examType = (selectedExam?.exam_type ?? "Certificate II Examinations") as ExamType;
        setSubjects(
          examSubjects.map((es) => ({
            id: es.subject_id,
            code: es.subject_code,
            original_code: es.original_code,
            name: es.subject_name,
            subject_type: es.subject_type,
            exam_type: examType,
            created_at: es.created_at,
            updated_at: es.updated_at,
          }))
        );
      } catch {
        if (!cancelled) setSubjects([]);
      }
    };
    void loadSubjects();
    return () => {
      cancelled = true;
    };
  }, [examId, exams]);

  return {
    loading,
    authorized,
    currentRole,
    exams,
    subjects,
    examId,
    applyExamId,
  };
}
