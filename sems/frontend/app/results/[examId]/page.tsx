"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResultsKpiCard } from "@/components/results/ResultsKpiCard";
import { ResultsSchoolsPanel } from "@/components/results/ResultsSchoolsPanel";
import { examLabel } from "@/components/results/exam-label";
import { getExam, getExamResultsSummary } from "@/lib/api";
import type { Exam, ExamResultsSummary } from "@/types/document";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Users,
} from "lucide-react";

export default function ResultsExamDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params.examId);

  const [exam, setExam] = useState<Exam | null>(null);
  const [summary, setSummary] = useState<ExamResultsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!examId) return;
      setLoading(true);
      setError(null);
      try {
        const [examData, summaryData] = await Promise.all([
          getExam(examId),
          getExamResultsSummary(examId),
        ]);
        setExam(examData);
        setSummary(summaryData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load exam dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  const title = exam ? examLabel(exam) : "Exam dashboard";

  return (
    <DashboardLayout title="Results">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} showSearch={false} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
            <div>
              <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
                <Link href="/results">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Examinations
                </Link>
              </Button>

              {loading && !exam ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-80" />
                  <Skeleton className="h-4 w-56" />
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {exam && (
                        <>
                          <Badge variant="outline">{exam.exam_type}</Badge>
                          <Badge variant="secondary">
                            {exam.series} {exam.year}
                          </Badge>
                        </>
                      )}
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {summary
                        ? `${summary.school_count.toLocaleString()} schools · ${summary.candidate_count.toLocaleString()} candidates`
                        : "Examination results dashboard"}
                    </p>
                  </div>
                  {summary && (
                    <div className="rounded-xl border bg-muted/30 px-4 py-3 text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Graded
                      </p>
                      <p className="text-2xl font-semibold tabular-nums">
                        {summary.completion_percentage}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ResultsKpiCard
                title="Schools"
                value={(summary?.school_count ?? 0).toLocaleString()}
                caption="With registered candidates"
                icon={Building2}
                accent="border-l-sky-500"
                iconWell="bg-sky-500/10 text-sky-700"
                loading={loading && !summary}
              />
              <ResultsKpiCard
                title="Candidates"
                value={(summary?.candidate_count ?? 0).toLocaleString()}
                caption="Registered for this exam"
                icon={Users}
                accent="border-l-indigo-500"
                iconWell="bg-indigo-500/10 text-indigo-700"
                loading={loading && !summary}
              />
              <ResultsKpiCard
                title="Fully graded"
                value={(summary?.fully_graded_count ?? 0).toLocaleString()}
                caption="All subjects have a grade"
                icon={CheckCircle2}
                accent="border-l-emerald-500"
                iconWell="bg-emerald-500/10 text-emerald-700"
                valueClass="text-emerald-700"
                progress={summary?.completion_percentage}
                showProgress
                loading={loading && !summary}
              />
              <ResultsKpiCard
                title="Pending"
                value={(summary?.pending_count ?? 0).toLocaleString()}
                caption="Missing one or more grades"
                icon={Clock}
                accent="border-l-amber-500"
                iconWell="bg-amber-500/10 text-amber-700"
                valueClass="text-amber-700"
                loading={loading && !summary}
              />
            </div>

            <ResultsSchoolsPanel
              examId={examId}
              onSelect={(school) =>
                router.push(`/results/${examId}/schools/${school.school_id}`)
              }
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
