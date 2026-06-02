"use client";

import { ExecutiveCentresSection } from "@/components/executive-centres-section";
import { MonitoringExamScopedPage } from "@/components/monitoring-exam-scoped-page";

export default function ExecutiveMonitoringCentresPage() {
  return (
    <MonitoringExamScopedPage>
      {(examId) => <ExecutiveCentresSection examId={examId} standalone />}
    </MonitoringExamScopedPage>
  );
}
