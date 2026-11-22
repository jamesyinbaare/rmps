"use client";

import { useEffect, useState } from "react";
import {
  getSchoolDashboard,
  listAllSchoolExams,
  listSchoolCandidates,
} from "@/lib/api";
import type { SchoolDashboardData } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  SchoolExaminationsTable,
  type SchoolExamTableRow,
} from "@/components/school/SchoolExaminationsTable";

export default function SchoolExaminationsHubPage() {
  const [rows, setRows] = useState<SchoolExamTableRow[]>([]);
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
          document.title = `${dashboard.school.name} - Examinations`;
        }

        const sorted = [...examsData].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return (b.exam_series || "").localeCompare(a.exam_series || "");
        });

        const enriched: SchoolExamTableRow[] = await Promise.all(
          sorted.map(async (exam) => {
            const apiTotal = exam.candidate_count;
            const apiApproved = exam.approved_candidates;
            if (
              typeof apiTotal === "number" &&
              typeof apiApproved === "number"
            ) {
              return {
                ...exam,
                kpis: {
                  total: apiTotal,
                  approved: apiApproved,
                  pending: Math.max(0, apiTotal - apiApproved),
                },
              };
            }
            try {
              const candidates = await listSchoolCandidates(exam.id);
              const approved = candidates.filter(
                (c) => c.registration_status === "COMPLETE"
              ).length;
              const pending = candidates.filter(
                (c) => c.registration_status === "INCOMPLETE"
              ).length;
              return {
                ...exam,
                kpis: {
                  total: candidates.length,
                  approved,
                  pending,
                },
              };
            } catch {
              return {
                ...exam,
                kpis: {
                  total: typeof apiTotal === "number" ? apiTotal : 0,
                  approved: typeof apiApproved === "number" ? apiApproved : 0,
                  pending: 0,
                },
              };
            }
          })
        );
        setRows(enriched);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load examinations");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Examinations"
        subtitle={
          schoolData?.school
            ? `Browse historical examinations and review registration lists for ${schoolData.school.name}.`
            : "Browse historical examinations and review registration lists for your school."
        }
      />

      <SchoolExaminationsTable exams={rows} />
    </div>
  );
}
