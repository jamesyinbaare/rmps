"use client";

import { useEffect, useMemo } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { MarkedScriptReturnsVerificationShell } from "@/components/subject-officer/marked-script-returns-verification-shell";
import { useMarkedScriptReturnsUrl } from "@/components/subject-officer/use-marked-script-returns-url";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import { useSubjectOfficerExamUrl } from "@/hooks/use-subject-officer-exam-url";
import type { SubjectOfficerMeExamAssignment } from "@/lib/api";

export default function SubjectOfficerMarkedScriptReturnsPage() {
  const { assignments, loading: assignmentsLoading } = useSubjectOfficerAssignments();
  const examIds = useMemo(() => assignments.map((a) => a.examination_id), [assignments]);
  const { examId: barExamId } = useSubjectOfficerExamUrl({ examIds, requireSelection: true });

  const scopedAssignments = useMemo((): SubjectOfficerMeExamAssignment[] => {
    if (barExamId == null) return assignments;
    return assignments.filter((a) => a.examination_id === barExamId);
  }, [assignments, barExamId]);

  const scopedExamIds = useMemo(
    () => scopedAssignments.map((a) => a.examination_id),
    [scopedAssignments],
  );

  const { session, setSession } = useMarkedScriptReturnsUrl({ examIds: scopedExamIds });

  useEffect(() => {
    if (barExamId == null) {
      if (session.examId != null) {
        setSession({
          examId: null,
          subjectId: null,
          examinerId: null,
          paperNumber: null,
        });
      }
      return;
    }
    if (session.examId !== barExamId) {
      setSession({
        examId: barExamId,
        subjectId: null,
        examinerId: null,
        paperNumber: null,
      });
    }
  }, [barExamId, session.examId, setSession]);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Marked script returns" staffRole="subject-officer">
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subject assignments found for your account.</p>
        ) : barExamId == null ? (
          <p className="text-sm text-muted-foreground">
            Select an examination using the selector above to verify marked script returns.
          </p>
        ) : (
          <MarkedScriptReturnsVerificationShell
            examAssignments={scopedAssignments}
            session={session}
            onSessionChange={setSession}
          />
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
