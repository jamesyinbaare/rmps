"use client";

import { useEffect, useState } from "react";
import { listAllSchoolExams, getSchoolDashboard } from "@/lib/api";
import type { RegistrationExam, SchoolDashboardData } from "@/types";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { SchoolExamBrowseCards } from "@/components/school/SchoolExamBrowseCards";
import { SchoolExaminationsBrowseTable } from "@/components/school/SchoolExaminationsBrowseTable";

const hrefForExam = (examId: number) =>
  `/dashboard/my-school/timetables/${examId}`;

export default function TimetablesHubPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [examsData, dashboard] = await Promise.all([
          listAllSchoolExams(),
          getSchoolDashboard(),
        ]);
        setSchoolData(dashboard);
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Timetables`;
        }
        const sorted = [...examsData].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return (b.exam_series || "").localeCompare(a.exam_series || "");
        });
        setExams(sorted);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load examinations");
        setExams([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Timetables"
        subtitle={
          schoolData?.school
            ? `View and download examination timetables for ${schoolData.school.name}`
            : "Select an examination to view and download its timetable"
        }
      />

      <section className="space-y-3">
        <SectionLabel>Current examinations</SectionLabel>
        <SchoolExamBrowseCards
          exams={exams}
          loading={loading}
          max={3}
          hrefForExam={hrefForExam}
          actionLabel="Open timetable"
          emptyDescription="Examinations available to your school will appear here for timetables."
        />
      </section>

      <section className="space-y-3">
        <SectionLabel>All examinations</SectionLabel>
        <SchoolExaminationsBrowseTable
          exams={exams}
          loading={loading}
          hrefForExam={hrefForExam}
        />
      </section>
    </div>
  );
}
