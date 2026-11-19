"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { RegistrationExam } from "@/types";

interface ActiveExamCardsProps {
  exams: RegistrationExam[];
  loading?: boolean;
  max?: number;
}

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

function daysLeft(exam: RegistrationExam): number {
  const end = new Date(exam.registration_period.registration_end_date);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function completionPct(exam: RegistrationExam): number {
  const total = exam.candidate_count || 0;
  if (total === 0) return 0;
  const approved = exam.approved_candidates || 0;
  return Math.round((approved / total) * 1000) / 10;
}

export function ActiveExamCards({ exams, loading = false, max = 3 }: ActiveExamCardsProps) {
  const router = useRouter();
  const visible = exams.slice(0, max);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5 space-y-4">
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
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-10 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Calendar className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No active examinations</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Open a registration period to see live KPIs here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((exam) => {
        const pct = completionPct(exam);
        const left = daysLeft(exam);
        return (
          <div
            key={exam.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/dashboard/exams/${exam.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/dashboard/exams/${exam.id}`);
              }
            }}
            className="cursor-pointer rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/20"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{examTitle(exam)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ends{" "}
                  {new Date(exam.registration_period.registration_end_date).toLocaleDateString()}
                </p>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 border-success/30 bg-success/10 text-success"
              >
                Open
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Candidates</div>
                <div className="font-mono text-xl font-medium tracking-tight">
                  {(exam.candidate_count || 0).toLocaleString()}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Approved</div>
                <div className="font-mono text-xl font-medium tracking-tight">
                  {(exam.approved_candidates || 0).toLocaleString()}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Complete</div>
                <div className="font-mono text-xl font-medium tracking-tight">{pct}%</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Days left</div>
                <div className="font-mono text-xl font-medium tracking-tight">{left}</div>
              </div>
            </div>

            <div className="mt-4">
              <Link
                href={`/dashboard/exams/${exam.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-primary hover:underline"
              >
                View details
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
