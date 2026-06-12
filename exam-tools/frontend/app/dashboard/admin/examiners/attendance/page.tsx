"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminDashboardShell } from "@/components/admin-dashboard-shell";
import { ExaminerAttendanceShell } from "@/components/subject-officer/examiner-attendance-shell";
import { RoleGuard } from "@/components/role-guard";
import { listExaminations, type Examination } from "@/lib/api";

export default function AdminExaminersAttendancePage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listExaminations();
      setExams(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const assignments = useMemo(
    () =>
      exams.map((ex) => ({
        examination_id: ex.id,
        examination_name: `${ex.exam_type} ${ex.year}`,
        subjects: [],
      })),
    [exams],
  );

  return (
    <RoleGuard expectedRole={["SUPER_ADMIN", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      <AdminDashboardShell title="Examiners attendance">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ExaminerAttendanceShell assignments={assignments} adminMode />
        )}
      </AdminDashboardShell>
    </RoleGuard>
  );
}
