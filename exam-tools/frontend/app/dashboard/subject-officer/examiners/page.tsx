"use client";

import { useEffect, useState } from "react";

import { ExaminersPageShell } from "@/components/examiners/examiners-page-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  getStaffDefaultExamination,
  getSubjectOfficerMyAssignments,
  type Examination,
  type Subject,
  type SubjectOfficerMeAssignmentSubject,
} from "@/lib/api";

function assignmentSubjectToSubject(row: SubjectOfficerMeAssignmentSubject): Subject {
  return {
    id: row.subject_id,
    code: row.subject_code,
    original_code: row.subject_original_code ?? null,
    name: row.subject_name,
    subject_type: row.subject_type as Subject["subject_type"],
    created_at: "",
    updated_at: "",
  };
}

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

    void getSubjectOfficerMyAssignments()
      .then((data) => {
        const byId = new Map<number, Subject>();
        const ids: number[] = [];
        for (const exam of data.items) {
          for (const s of exam.subjects) {
            if (!byId.has(s.subject_id)) {
              byId.set(s.subject_id, assignmentSubjectToSubject(s));
            }
            ids.push(s.subject_id);
          }
        }
        setSubjects([...byId.values()]);
        setLockedSubjectIds([...new Set(ids)]);
      })
      .catch(() => {
        setSubjects([]);
        setLockedSubjectIds([]);
      });
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
