"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { SubjectOfficerDashboard } from "@/components/subject-officer/subject-officer-dashboard";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import { useSubjectOfficerExamUrl } from "@/hooks/use-subject-officer-exam-url";

export default function SubjectOfficerDashboardPage() {
  const { assignments, loading } = useSubjectOfficerAssignments();
  const examIds = assignments.map((a) => a.examination_id);
  const { examId, setExamId } = useSubjectOfficerExamUrl({ examIds, requireSelection: true });

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Marking overview" staffRole="subject-officer">
        <SubjectOfficerDashboard
          assignments={assignments}
          examId={examId}
          onExamChange={setExamId}
          assignmentsLoading={loading}
        />
      </DashboardShell>
    </RoleGuard>
  );
}
