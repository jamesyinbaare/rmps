"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateResultModal } from "@/components/results/CandidateResultModal";
import { ResultsCandidatesDataTable } from "@/components/results/ResultsCandidatesDataTable";
import { ResultsKpiCard } from "@/components/results/ResultsKpiCard";
import { examLabel } from "@/components/results/exam-label";
import {
  getExam,
  getSchoolResultsSummary,
  listExamSchoolProgrammes,
  listSchoolResults,
} from "@/lib/api";
import type {
  CandidateResultSummary,
  Exam,
  ExamProgrammeSummary,
  SchoolResultsSummary,
} from "@/types/document";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  Users,
} from "lucide-react";

const PAGE_SIZE = 200;

type StatusFilter = "all" | "ready" | "pending";

async function loadAllCandidates(
  examId: number,
  schoolId: number
): Promise<CandidateResultSummary[]> {
  const first = await listSchoolResults(examId, schoolId, {
    page: 1,
    page_size: PAGE_SIZE,
  });
  const items = [...first.items];
  const totalPages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  for (let page = 2; page <= totalPages; page++) {
    const next = await listSchoolResults(examId, schoolId, {
      page,
      page_size: PAGE_SIZE,
    });
    items.push(...next.items);
  }
  return items;
}

export default function SchoolResultsPage() {
  const params = useParams();
  const examId = Number(params.examId);
  const schoolId = Number(params.schoolId);

  const [exam, setExam] = useState<Exam | null>(null);
  const [summary, setSummary] = useState<SchoolResultsSummary | null>(null);
  const [programmes, setProgrammes] = useState<ExamProgrammeSummary[]>([]);
  const [candidates, setCandidates] = useState<CandidateResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<number | null>(
    null
  );
  const [browseList, setBrowseList] = useState<CandidateResultSummary[]>([]);

  const load = useCallback(async () => {
    if (!examId || !schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const [examData, summaryData, progs, rows] = await Promise.all([
        getExam(examId),
        getSchoolResultsSummary(examId, schoolId),
        listExamSchoolProgrammes(examId, schoolId),
        loadAllCandidates(examId, schoolId),
      ]);
      setExam(examData);
      setSummary(summaryData);
      setProgrammes(progs);
      setCandidates(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [examId, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const title = summary
    ? `${summary.school_code} — ${summary.school_name}`
    : "School results";

  const toggleStatus = (next: StatusFilter) => {
    setStatusFilter((current) => (current === next ? "all" : next));
  };

  return (
    <DashboardLayout title="Results">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} showSearch={false} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
            <div>
              <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
                <Link href={`/results/${examId}`}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {exam ? examLabel(exam) : "Exam dashboard"}
                </Link>
              </Button>

              {loading && !summary ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-80" />
                  <Skeleton className="h-4 w-56" />
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {summary?.school_code}
                      </Badge>
                      {summary?.region && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {summary.region}
                        </span>
                      )}
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                      {summary?.school_name ?? "School results"}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {exam ? examLabel(exam) : "Examination results"}
                      {summary
                        ? ` · ${summary.candidate_count.toLocaleString()} candidates`
                        : ""}
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
                title="Candidates"
                value={(summary?.candidate_count ?? 0).toLocaleString()}
                caption="Registered at this school"
                icon={Users}
                accent="border-l-indigo-500"
                iconWell="bg-indigo-500/10 text-indigo-700"
                loading={loading && !summary}
              />
              <ResultsKpiCard
                title="Fully graded"
                value={(summary?.fully_graded_count ?? 0).toLocaleString()}
                caption="Click to show ready candidates"
                icon={CheckCircle2}
                accent="border-l-emerald-500"
                iconWell="bg-emerald-500/10 text-emerald-700"
                valueClass="text-emerald-700"
                progress={summary?.completion_percentage}
                showProgress
                loading={loading && !summary}
                active={statusFilter === "ready"}
                onClick={() => toggleStatus("ready")}
              />
              <ResultsKpiCard
                title="Pending"
                value={(summary?.pending_count ?? 0).toLocaleString()}
                caption="Click to show incomplete results"
                icon={Clock}
                accent="border-l-amber-500"
                iconWell="bg-amber-500/10 text-amber-700"
                valueClass="text-amber-700"
                loading={loading && !summary}
                active={statusFilter === "pending"}
                onClick={() => toggleStatus("pending")}
              />
              <ResultsKpiCard
                title="Programmes"
                value={(summary?.programme_count ?? 0).toLocaleString()}
                caption="Represented at this school"
                icon={GraduationCap}
                accent="border-l-sky-500"
                iconWell="bg-sky-500/10 text-sky-700"
                loading={loading && !summary}
              />
            </div>

            <ResultsCandidatesDataTable
              candidates={candidates}
              programmes={programmes}
              loading={loading}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onBrowseListChange={setBrowseList}
              onSelect={(candidate) =>
                setSelectedRegistrationId(candidate.exam_registration_id)
              }
            />
          </div>
        </div>
      </div>

      <CandidateResultModal
        examId={examId}
        registrationId={selectedRegistrationId}
        candidates={browseList.length > 0 ? browseList : candidates}
        open={selectedRegistrationId != null}
        onOpenChange={(open) => {
          if (!open) setSelectedRegistrationId(null);
        }}
        onRegistrationChange={setSelectedRegistrationId}
      />
    </DashboardLayout>
  );
}
