"use client";

import { AdminIrregularCandidatesPanel } from "@/components/irregular-candidates/admin-irregular-candidates-panel";
import { MonitoringExamScopedPage } from "@/components/monitoring-exam-scoped-page";
import {
  OfficialAccountsExamMeta,
  OfficialAccountsPageIntro,
} from "@/components/official-accounts-page-intro";
import { type Examination } from "@/lib/api";

function examMetaLabel(exam: Examination | undefined): string {
  if (!exam) return "Selected examination";
  const series = exam.exam_series?.trim();
  return series ? `${exam.exam_type} · ${series} ${exam.year}` : `${exam.exam_type} · ${exam.year}`;
}

function IrregularCandidatesForExam({
  examId,
  exam,
}: {
  examId: number;
  exam: Examination | undefined;
}) {
  return (
    <div className="space-y-6">
      <OfficialAccountsPageIntro
        description="Preview inspector-recorded candidates, download Excel lists, and export detail PDFs with photographs and vouchers. Downloading all candidates across centres produces a zip with one PDF per centre."
        meta={<OfficialAccountsExamMeta>{examMetaLabel(exam)}</OfficialAccountsExamMeta>}
        footerNote={null}
      />
      <AdminIrregularCandidatesPanel
        examId={examId}
        examType={exam?.exam_type}
        examSeries={exam?.exam_series}
        examYear={exam?.year}
        showIntro={false}
      />
    </div>
  );
}

export default function AdminIrregularCandidatesPage() {
  return (
    <MonitoringExamScopedPage showExamPicker>
      {(examId, exam) => <IrregularCandidatesForExam examId={examId} exam={exam} />}
    </MonitoringExamScopedPage>
  );
}
