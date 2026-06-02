"use client";

import { ExecutiveCentresSection } from "@/components/executive-centres-section";
import { MonitoringExamScopedPage } from "@/components/monitoring-exam-scoped-page";

export default function TestAdminMonitoringInspectorsPage() {
  return (
    <MonitoringExamScopedPage showExamPicker>
      {(examId) => (
        <ExecutiveCentresSection
          examId={examId}
          standalone
          standaloneHint="Browse posted inspectors by examination centre. Tap a centre for schools and inspector contacts."
        />
      )}
    </MonitoringExamScopedPage>
  );
}
