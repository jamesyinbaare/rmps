"use client";

import { useEffect, useState } from "react";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { WorkforceRosterPanel } from "@/components/workforce/workforce-roster-panel";
import { apiJson, type Examination } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { SCRIPT_CHECKER_CONFIG } from "@/lib/workforce-kind";

export default function AdminScriptCheckersPage() {
  const [exams, setExams] = useState<Examination[]>([]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
  }, []);

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      <div className="space-y-4">
        <OfficialAccountsPageIntro
          description="Manage the script checker roster, portal links, and SMS invites."
        />
        <WorkforceRosterPanel config={SCRIPT_CHECKER_CONFIG} exams={exams} formatExamLabel={formatWorkforceExamLabel} />
      </div>
    </RoleGuard>
  );
}
