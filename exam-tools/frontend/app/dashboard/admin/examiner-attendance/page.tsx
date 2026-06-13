"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceExaminerAttendancePanel } from "@/components/examiner-attendance/finance-examiner-attendance-panel";
import { ExaminerAttendanceShell } from "@/components/subject-officer/examiner-attendance-shell";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { getMe, type UserMe } from "@/lib/auth";
import { listExaminations, type Examination } from "@/lib/api";

export default function AdminExaminerAttendancePage() {
  const [me, setMe] = useState<UserMe | null>(null);
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
    void getMe().then(setMe).catch(() => setMe(null));
    void loadExams();
  }, [loadExams]);

  const assignments = useMemo(
    () =>
      exams.map((ex) => ({
        examination_id: ex.id,
        examination_name: `${ex.exam_type} ${ex.year}${ex.exam_series ? ` (${ex.exam_series})` : ""}`,
        subjects: [],
      })),
    [exams],
  );

  const readOnly = me?.role === "FINANCE_OFFICER";

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      {readOnly ? (
        <FinanceExaminerAttendancePanel />
      ) : (
        <div className="space-y-4">
          <OfficialAccountsPageIntro description="Scan or enter reference codes to mark examiner attendance for today." />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ExaminerAttendanceShell assignments={assignments} adminMode />
          )}
        </div>
      )}
    </RoleGuard>
  );
}
