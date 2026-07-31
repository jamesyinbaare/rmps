"use client";

import { useEffect, useState } from "react";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { WorkforceAdminHub } from "@/components/workforce/workforce-admin-hub";
import { apiJson, type Examination } from "@/lib/api";
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
          description="Invite and manage script checkers for an examination — roster, exercise cohorts, and appointment letters."
          footerNote={false}
        />
        <WorkforceAdminHub config={SCRIPT_CHECKER_CONFIG} exams={exams} />
      </div>
    </RoleGuard>
  );
}
