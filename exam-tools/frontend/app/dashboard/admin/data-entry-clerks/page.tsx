"use client";

import { useEffect, useState } from "react";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { WorkforceRosterPanel } from "@/components/workforce/workforce-roster-panel";
import { apiJson, type Examination } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { DATA_ENTRY_CLERK_CONFIG } from "@/lib/workforce-kind";

export default function AdminDataEntryClerksPage() {
  const [exams, setExams] = useState<Examination[]>([]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
  }, []);

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "TEST_ADMIN_OFFICER"]} loginHref="/login/admin">
      <div className="space-y-4">
        <OfficialAccountsPageIntro
          description="Manage the data entry clerk roster, portal links, and SMS invites."
        />
        <WorkforceRosterPanel config={DATA_ENTRY_CLERK_CONFIG} exams={exams} formatExamLabel={formatWorkforceExamLabel} />
      </div>
    </RoleGuard>
  );
}
