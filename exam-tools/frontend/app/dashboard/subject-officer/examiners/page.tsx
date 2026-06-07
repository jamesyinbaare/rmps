"use client";

import { useEffect, useState } from "react";

import { ExaminersPageShell } from "@/components/examiners/examiners-page-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  getStaffDefaultExamination,
  getSubjectOfficerMyAssignments,
  listAllSubjects,
  type Examination,
  type Subject,
} from "@/lib/api";

export default function SubjectOfficerExaminersPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lockedSubjectIds, setLockedSubjectIds] = useState<number[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  useEffect(() => {
    setLoadingExams(true);
    void getStaffDefaultExamination()
      .then((exam) => setExams([exam]))
      .catch(() => setExams([]))
      .finally(() => setLoadingExams(false));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
    void getSubjectOfficerMyAssignments()
      .then((data) => {
        const ids = data.items.flatMap((item) => item.subjects.map((s) => s.subject_id));
        setLockedSubjectIds([...new Set(ids)]);
      })
      .catch(() => setLockedSubjectIds([]));
  }, []);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Examiners" staffRole="subject-officer">
        <ExaminersPageShell
          exams={exams}
          subjects={subjects}
          isSuperAdmin={false}
          lockedSubjectIds={lockedSubjectIds}
          hideGroups
          showScriptsAllocationLink={false}
          loadingExams={loadingExams}
          singleExamMode
          showCreateExamsLink={false}
        />
      </DashboardShell>
    </RoleGuard>
  );
}
