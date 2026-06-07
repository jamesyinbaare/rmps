"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  getStaffDefaultExamination,
  getSubjectOfficerMyAssignments,
  type Examination,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import { formatExamLabel } from "@/lib/official-rates-draft";

export default function SubjectOfficerDashboardPage() {
  const [exam, setExam] = useState<Examination | null>(null);
  const [assignments, setAssignments] = useState<SubjectOfficerMeExamAssignment | null>(null);

  useEffect(() => {
    void getStaffDefaultExamination()
      .then(setExam)
      .catch(() => setExam(null));
    void getSubjectOfficerMyAssignments()
      .then((data) => setAssignments(data.items[0] ?? null))
      .catch(() => setAssignments(null));
  }, []);

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title="Subject officer dashboard" staffRole="subject-officer">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">Active examination</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {exam ? formatExamLabel(exam) : "Loading examination…"}
            </p>
            {assignments ? (
              <p className="mt-3 text-sm text-foreground">
                Assigned subjects:{" "}
                {assignments.subjects.map((s) => s.subject_name).join(", ") || "None"}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/dashboard/subject-officer/examiners"
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <h3 className="font-semibold text-foreground">Examiners</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage roster and invitations for your subject(s).
              </p>
            </Link>
            <Link
              href="/dashboard/subject-officer/marked-script-returns"
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <h3 className="font-semibold text-foreground">Marked script returns</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Record and verify marked scripts returned by examiners.
              </p>
            </Link>
          </div>
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
