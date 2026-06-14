"use client";

import { useEffect, useState } from "react";

import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { WorkforceRatesPanel } from "@/components/workforce/workforce-rates-panel";
import { apiJson, type Examination } from "@/lib/api";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import { DATA_ENTRY_CLERK_CONFIG } from "@/lib/workforce-kind";

export default function AdminDataEntryClerkRatesPage() {
  const [exams, setExams] = useState<Examination[]>([]);

  useEffect(() => {
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
  }, []);

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <div className="space-y-3">
        <OfficialAccountsPageIntro
          description="Configure per-entry rate, daily commute and lunch allowances, and withholding tax for BoG payout."
        />
        <WorkforceRatesPanel config={DATA_ENTRY_CLERK_CONFIG} exams={exams} formatExamLabel={formatWorkforceExamLabel} />
      </div>
    </RoleGuard>
  );
}
