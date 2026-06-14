"use client";

import { useEffect, useState } from "react";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { WorkforcePayoutsPanel } from "@/components/workforce/workforce-payouts-panel";
import { apiJson, type Examination } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { DATA_ENTRY_CLERK_CONFIG } from "@/lib/workforce-kind";

export default function AdminDataEntryClerkPayoutsPage() {
  const [exams, setExams] = useState<Examination[]>([]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
  }, []);

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <div className="space-y-3">
        <OfficialAccountsPageIntro
          description="Preview completed work and export BoG payment file for data entry clerks."
        />
        <WorkforcePayoutsPanel config={DATA_ENTRY_CLERK_CONFIG} exams={exams} formatExamLabel={formatWorkforceExamLabel} />
      </div>
    </RoleGuard>
  );
}
