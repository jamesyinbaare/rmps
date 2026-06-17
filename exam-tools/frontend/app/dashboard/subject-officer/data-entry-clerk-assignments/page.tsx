"use client";

import { useEffect, useMemo, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";
import { WorkforceAssignmentPageIntro } from "@/components/workforce/workforce-assignment-page-intro";
import { WorkforceBatchAssignmentPanel } from "@/components/workforce/workforce-batch-assignment-panel";
import { apiJson, listAllSubjects, type Examination, type Subject } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { DATA_ENTRY_CLERK_CONFIG } from "@/lib/workforce-kind";

export default function SubjectOfficerDataEntryClerkAssignmentsPage() {
  const { examId, subjectId, loading, mustPickWorkspace } = useSubjectOfficerWorkspace();
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const filteredExams = useMemo(
    () => (examId != null ? exams.filter((e) => e.id === examId) : []),
    [examId, exams],
  );

  const selectedExam = useMemo(() => filteredExams.find((e) => e.id === examId) ?? null, [examId, filteredExams]);
  const lockedSubjectIds = useMemo(() => (subjectId != null ? [subjectId] : []), [subjectId]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <div className="space-y-4">
        <WorkforceAssignmentPageIntro
          config={DATA_ENTRY_CLERK_CONFIG}
          description="See data-entry progress for your exam. Use Assign to choose the subject, paper, and number of scripts for your subjects."
          exam={selectedExam}
          formatExamLabel={formatWorkforceExamLabel}
        />
        {loading || mustPickWorkspace ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : examId == null || subjectId == null ? (
          <p className="text-sm text-muted-foreground">Choose a workspace to manage data entry clerk assignments.</p>
        ) : (
          <WorkforceBatchAssignmentPanel
            config={DATA_ENTRY_CLERK_CONFIG}
            exams={filteredExams}
            subjects={subjects}
            examId={examId}
            onExamChange={() => {}}
            lockedSubjectIds={lockedSubjectIds}
            hideExamFilter
            formatExamLabel={formatWorkforceExamLabel}
          />
        )}
      </div>
    </RoleGuard>
  );
}
