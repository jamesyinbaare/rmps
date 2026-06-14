"use client";

import { useEffect, useMemo, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { SubjectOfficerExamSelector } from "@/components/subject-officer/subject-officer-exam-bar";
import { WorkforceAssignmentPageIntro } from "@/components/workforce/workforce-assignment-page-intro";
import { WorkforceBatchAssignmentPanel } from "@/components/workforce/workforce-batch-assignment-panel";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import { useSubjectOfficerExamUrl } from "@/hooks/use-subject-officer-exam-url";
import { apiJson, listAllSubjects, type Examination, type Subject } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { SCRIPT_CHECKER_CONFIG } from "@/lib/workforce-kind";

export default function SubjectOfficerScriptCheckerAssignmentsPage() {
  const { assignments, loading: assignmentsLoading } = useSubjectOfficerAssignments();
  const examIds = useMemo(() => assignments.map((a) => a.examination_id), [assignments]);
  const { examId, setExamId } = useSubjectOfficerExamUrl({ examIds, requireSelection: true });
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const lockedSubjectIds = useMemo(() => {
    if (examId == null) return [];
    return assignments
      .filter((a) => a.examination_id === examId)
      .flatMap((a) => a.subjects.map((s) => s.subject_id));
  }, [assignments, examId]);

  const filteredExams = useMemo(
    () => exams.filter((e) => examIds.includes(e.id)),
    [examIds, exams],
  );

  const selectedExam = useMemo(() => filteredExams.find((e) => e.id === examId) ?? null, [examId, filteredExams]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <div className="space-y-4">
        <WorkforceAssignmentPageIntro
          config={SCRIPT_CHECKER_CONFIG}
          description="See checker progress for your exam. Use Assign to choose the subject, paper, and number of scripts for your subjects."
          exam={selectedExam}
          formatExamLabel={formatWorkforceExamLabel}
        />
        {assignmentsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subject assignments found for your account.</p>
        ) : (
          <>
            <SubjectOfficerExamSelector
              assignments={assignments}
              examId={examId}
              onExamChange={setExamId}
              loading={assignmentsLoading}
            />
            <WorkforceBatchAssignmentPanel
              config={SCRIPT_CHECKER_CONFIG}
              exams={filteredExams}
              subjects={subjects}
              examId={examId}
              onExamChange={setExamId}
              lockedSubjectIds={lockedSubjectIds}
              hideExamFilter
              formatExamLabel={formatWorkforceExamLabel}
            />
          </>
        )}
      </div>
    </RoleGuard>
  );
}
