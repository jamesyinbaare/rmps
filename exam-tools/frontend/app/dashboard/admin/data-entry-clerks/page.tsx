"use client";

import { useEffect, useState } from "react";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { WorkforceAdminHub } from "@/components/workforce/workforce-admin-hub";
import { apiJson, type Examination } from "@/lib/api";
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
          description="Invite and manage data entry clerks for an examination — roster, exercise cohorts, and appointment letters."
          footerNote={false}
        />
        <WorkforceAdminHub config={DATA_ENTRY_CLERK_CONFIG} exams={exams} />
      </div>
    </RoleGuard>
  );
}
