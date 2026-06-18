"use client";

import { ExaminerPaperAttendancePanel } from "@/components/examiner-attendance/examiner-paper-attendance-panel";
import { RoleGuard } from "@/components/role-guard";

export default function AdminExaminerAttendanceSheetsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <ExaminerPaperAttendancePanel />
    </RoleGuard>
  );
}
