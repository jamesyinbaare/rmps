"use client";

import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import { useSubjectOfficerExamUrl } from "@/hooks/use-subject-officer-exam-url";
import { subjectNamesSummary, withExamQuery } from "@/lib/subject-officer-exams";

export default function SubjectOfficerDashboardPage() {
  const { assignments, loading } = useSubjectOfficerAssignments();
  const examIds = assignments.map((a) => a.examination_id);
  const { examId } = useSubjectOfficerExamUrl({ examIds, requireSelection: true });

  const selected = assignments.find((a) => a.examination_id === examId);
  const subjectSummary = subjectNamesSummary(assignments, examId);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Subject officer dashboard" staffRole="subject-officer">
        <div className="space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading assignments…</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No examination assignments found for your account.
            </p>
          ) : examId == null ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">Select an examination</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose an examination using the selector above to view your assigned subjects and
                open marking tools.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">
                {selected?.examination_name ?? "Examination"}
              </h2>
              <p className="mt-2 text-sm text-foreground">
                Assigned subjects: {subjectSummary ?? "None"}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={withExamQuery("/dashboard/subject-officer/examiners", examId)}
              className={`rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 ${
                examId == null ? "pointer-events-none opacity-50" : ""
              }`}
              aria-disabled={examId == null}
            >
              <h3 className="font-semibold text-foreground">Examiners</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage roster, invitations, and cohorts for your subject(s).
              </p>
            </Link>
            <Link
              href={withExamQuery("/dashboard/subject-officer/marked-script-returns", examId)}
              className={`rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 ${
                examId == null ? "pointer-events-none opacity-50" : ""
              }`}
              aria-disabled={examId == null}
            >
              <h3 className="font-semibold text-foreground">Marked script returns</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Verify marked scripts returned by examiners, envelope by envelope.
              </p>
            </Link>
          </div>
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
