"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  listAvailableExams,
  listSchoolCandidates,
  getSchoolDashboard,
} from "@/lib/api";
import type { RegistrationExam, SchoolDashboardData } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import {
  SchoolExamRegisterCard,
  type ExamRegisterKpis,
} from "@/components/school/SchoolExamRegisterCard";

function isRegistrationOpen(exam: RegistrationExam): boolean {
  if (!exam.registration_period?.is_active) return false;
  const now = new Date();
  const start = new Date(exam.registration_period.registration_start_date);
  const end = new Date(exam.registration_period.registration_end_date);
  return start <= now && end >= now;
}

export default function RegisterExamCardsHubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [kpisByExam, setKpisByExam] = useState<Record<number, ExamRegisterKpis>>(
    {}
  );
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const examParam = searchParams.get("exam_id");
    if (examParam) {
      router.replace(`/dashboard/my-school/register/${examParam}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (searchParams.get("exam_id")) return;

    const load = async () => {
      setLoading(true);
      try {
        const [examsData, dashboard] = await Promise.all([
          listAvailableExams(),
          getSchoolDashboard(),
        ]);
        setSchoolData(dashboard);

        const active = examsData.filter(isRegistrationOpen);
        setExams(active);

        const counts: Record<number, ExamRegisterKpis> = {};
        await Promise.all(
          active.map(async (exam) => {
            try {
              const candidates = await listSchoolCandidates(exam.id);
              counts[exam.id] = {
                total: candidates.length,
                approved: candidates.filter(
                  (c) => c.registration_status === "APPROVED"
                ).length,
                pending: candidates.filter(
                  (c) => c.registration_status === "PENDING"
                ).length,
              };
            } catch {
              counts[exam.id] = { total: 0, approved: 0, pending: 0 };
            }
          })
        );
        setKpisByExam(counts);
    } catch (error) {
      console.error(error);
        toast.error("Failed to load examinations");
    } finally {
        setLoading(false);
      }
    };

    load();
  }, [searchParams]);

  if (searchParams.get("exam_id")) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Register candidates"
        subtitle={
          schoolData?.school
            ? `${schoolData.school.code} — ${schoolData.school.name}`
            : "Choose an active examination to register candidates."
        }
      />

                        <div>
        <SectionLabel>Active examinations</SectionLabel>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="space-y-4 rounded-lg border border-border bg-card p-5"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-20" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                          </div>
                                      </div>
                                    ))}
                                </div>
        ) : exams.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-12 text-center shadow-none">
            <div className="mb-3 rounded-full bg-muted p-3">
              <Calendar className="h-6 w-6 text-muted-foreground" />
                          </div>
            <p className="text-sm font-medium">No active examinations</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              There are no open registration windows for examinations your
              school is eligible for.
            </p>
                      </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => (
              <SchoolExamRegisterCard
                key={exam.id}
                exam={exam}
                kpis={
                  kpisByExam[exam.id] || {
                    total: 0,
                    approved: 0,
                    pending: 0,
                  }
                }
              />
            ))}
                      </div>
                    )}
                  </div>
    </div>
  );
}
