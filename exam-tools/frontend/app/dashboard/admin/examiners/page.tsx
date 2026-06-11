"use client";

import { useEffect, useState } from "react";

import { ExaminersPageShell } from "@/components/examiners/examiners-page-shell";
import { apiJson, listAllSubjects, type Examination, type Subject } from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";

export default function AdminExaminersHubPage() {
  const [me, setMe] = useState<UserMe | null>(null);
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  useEffect(() => {
    void getMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    setLoadingExams(true);
    void apiJson<Examination[]>("/examinations")
      .then(setExams)
      .catch(() => setExams([]))
      .finally(() => setLoadingExams(false));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  return (
    <ExaminersPageShell
      exams={exams}
      subjects={subjects}
      isSuperAdmin={me?.role === "SUPER_ADMIN"}
      showSubjectCohortsTab={
        me?.role === "SUPER_ADMIN" || me?.role === "TEST_ADMIN_OFFICER"
      }
      loadingExams={loadingExams}
    />
  );
}
