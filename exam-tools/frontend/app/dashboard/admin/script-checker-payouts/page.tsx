"use client";

import { useEffect, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { WorkforcePayoutsPanel } from "@/components/workforce/workforce-payouts-panel";
import { apiJson, type Examination } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { SCRIPT_CHECKER_CONFIG } from "@/lib/workforce-kind";

export default function AdminScriptCheckerPayoutsPage() {
  const [exams, setExams] = useState<Examination[]>([]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
  }, []);

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <WorkforcePayoutsPanel config={SCRIPT_CHECKER_CONFIG} exams={exams} formatExamLabel={formatWorkforceExamLabel} />
    </RoleGuard>
  );
}
