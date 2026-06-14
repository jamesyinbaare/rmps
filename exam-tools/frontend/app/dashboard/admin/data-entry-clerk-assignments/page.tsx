"use client";

import { useEffect, useMemo, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { WorkforceAssignmentPageIntro } from "@/components/workforce/workforce-assignment-page-intro";
import { WorkforceBatchAssignmentPanel } from "@/components/workforce/workforce-batch-assignment-panel";
import { useWorkforceAssignmentExam } from "@/hooks/use-workforce-assignment-exam";
import { apiJson, listAllSubjects, type Examination, type Subject } from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { DATA_ENTRY_CLERK_CONFIG } from "@/lib/workforce-kind";

export default function AdminDataEntryClerkAssignmentsPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [me, setMe] = useState<UserMe | null>(null);
  const [examId, setExamId] = useWorkforceAssignmentExam("data-entry-clerk", exams);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [examId, exams]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
    void getMe().then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      <div className="space-y-4">
        <WorkforceAssignmentPageIntro
          config={DATA_ENTRY_CLERK_CONFIG}
          description="See each clerk's progress for this exam. To assign work, open Assign and choose the subject, paper, and number of entries."
          exam={selectedExam}
          formatExamLabel={formatWorkforceExamLabel}
          showAdminLinks
          showRatesLink={me?.role === "SUPER_ADMIN"}
        />
        <WorkforceBatchAssignmentPanel
          config={DATA_ENTRY_CLERK_CONFIG}
          exams={exams}
          subjects={subjects}
          examId={examId}
          onExamChange={setExamId}
          canCancelBatch
          showRosterLinks
          formatExamLabel={formatWorkforceExamLabel}
        />
      </div>
    </RoleGuard>
  );
}
