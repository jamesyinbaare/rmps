"use client";

import { useEffect, useMemo } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { SubjectOfficerAllocationsShell } from "@/components/subject-officer/subject-officer-allocations-shell";
import { useSubjectOfficerAllocationsUrl } from "@/components/subject-officer/use-subject-officer-allocations-url";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import { useSubjectOfficerExamUrl } from "@/hooks/use-subject-officer-exam-url";

export default function SubjectOfficerAllocationsPage() {
  const { assignments, loading: assignmentsLoading } = useSubjectOfficerAssignments();
  const examIds = useMemo(() => assignments.map((a) => a.examination_id), [assignments]);
  const { examId, setExamId } = useSubjectOfficerExamUrl({ examIds, requireSelection: true });

  const { session, setSession } = useSubjectOfficerAllocationsUrl({ examIds });

  useEffect(() => {
    if (session.examId !== examId) {
      setSession({
        examId,
        subjectId: null,
        examinerId: null,
      });
    }
  }, [examId, session.examId, setSession]);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Allocations" staffRole="subject-officer">
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subject assignments found for your account.</p>
        ) : (
          <SubjectOfficerAllocationsShell
            assignments={assignments}
            examId={examId}
            onExamChange={setExamId}
            assignmentsLoading={assignmentsLoading}
            session={session}
            onSessionChange={setSession}
          />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
