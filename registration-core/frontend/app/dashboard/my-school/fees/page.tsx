"use client";

import { useEffect, useState } from "react";
import {
  getFeesSummaryByExam,
  getSchoolDashboard,
  listAllSchoolExams,
} from "@/lib/api";
import type { SchoolDashboardData } from "@/types";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import {
  SchoolFeesExamCards,
  type FeesExamCardRow,
} from "@/components/school/SchoolFeesExamCards";
import {
  SchoolFeesExaminationsTable,
  type SchoolFeesExamTableRow,
} from "@/components/school/SchoolFeesExaminationsTable";

export default function SchoolFeesHubPage() {
  const [rows, setRows] = useState<SchoolFeesExamTableRow[]>([]);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [examsData, summary, dashboard] = await Promise.all([
          listAllSchoolExams(),
          getFeesSummaryByExam(),
          getSchoolDashboard(),
        ]);
        setSchoolData(dashboard);
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Fees & Invoices`;
        }

        const summaryByExam = new Map(
          summary.items.map((item) => [item.exam_id, item])
        );

        const sorted = [...examsData].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return (b.exam_series || "").localeCompare(a.exam_series || "");
        });

        const enriched: SchoolFeesExamTableRow[] = sorted.map((exam) => {
          const stats = summaryByExam.get(exam.id);
          return {
            ...exam,
            feesKpis: {
              amount_due: Number(stats?.amount_due ?? 0),
              unpaid_candidate_count: stats?.unpaid_candidate_count ?? 0,
            },
          };
        });

        setRows(enriched);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load fees examinations");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cardRows: FeesExamCardRow[] = rows;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Fees & Invoices"
        subtitle={
          schoolData?.school
            ? `Track amounts due and build invoices for ${schoolData.school.name}`
            : "Track amounts due and build invoices by examination"
        }
      />

      <section className="space-y-3">
        <SectionLabel>Current examinations</SectionLabel>
        <SchoolFeesExamCards exams={cardRows} loading={loading} max={3} />
      </section>

      <section className="space-y-3">
        <SectionLabel>All examinations</SectionLabel>
        <SchoolFeesExaminationsTable exams={rows} loading={loading} />
      </section>
    </div>
  );
}
