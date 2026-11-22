"use client";

import { useEffect, useState } from "react";
import {
  getPhotoAlbumSummary,
  listAllSchoolExams,
  getSchoolDashboard,
} from "@/lib/api";
import type { SchoolDashboardData } from "@/types";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import {
  SchoolPhotoExamCards,
  type PhotoExamCardRow,
} from "@/components/school/SchoolPhotoExamCards";
import {
  SchoolPhotoExaminationsTable,
  type SchoolPhotoExamTableRow,
} from "@/components/school/SchoolPhotoExaminationsTable";

export default function PhotoAlbumHubPage() {
  const [rows, setRows] = useState<SchoolPhotoExamTableRow[]>([]);
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
          getPhotoAlbumSummary(),
          getSchoolDashboard(),
        ]);
        setSchoolData(dashboard);
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Photo Album`;
        }

        const summaryByExam = new Map(
          summary.items.map((item) => [item.exam_id, item])
        );

        const sorted = [...examsData].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return (b.exam_series || "").localeCompare(a.exam_series || "");
        });

        const enriched: SchoolPhotoExamTableRow[] = sorted.map((exam) => {
          const stats = summaryByExam.get(exam.id);
          return {
            ...exam,
            photoKpis: {
              total: stats?.total ?? exam.candidate_count ?? 0,
              with_photo: stats?.with_photo ?? 0,
              without_photo:
                stats?.without_photo ??
                Math.max(
                  0,
                  (stats?.total ?? exam.candidate_count ?? 0) -
                    (stats?.with_photo ?? 0)
                ),
            },
          };
        });

        setRows(enriched);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load photo album examinations");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cardRows: PhotoExamCardRow[] = rows;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Photo Album"
        subtitle={
          schoolData?.school
            ? `Manage candidate photos for ${schoolData.school.name}`
            : "Manage candidate photos by examination"
        }
      />

      <section className="space-y-3">
        <SectionLabel>Current examinations</SectionLabel>
        <SchoolPhotoExamCards exams={cardRows} loading={loading} max={3} />
      </section>

      <section className="space-y-3">
        <SectionLabel>All examinations</SectionLabel>
        <SchoolPhotoExaminationsTable exams={rows} loading={loading} />
      </section>
    </div>
  );
}
