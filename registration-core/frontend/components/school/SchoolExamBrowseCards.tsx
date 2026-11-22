"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { RegistrationExam } from "@/types";
import { isExamRegistrationOpen } from "@/components/school/SchoolExamRegisterCard";
import { cn } from "@/lib/utils";

interface SchoolExamBrowseCardsProps {
  exams: RegistrationExam[];
  hrefForExam: (examId: number) => string;
  actionLabel?: string;
  emptyDescription?: string;
  loading?: boolean;
  max?: number;
}

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

export function pickCurrentBrowseExams(
  exams: RegistrationExam[],
  max = 3
): RegistrationExam[] {
  const open = exams.filter((e) => isExamRegistrationOpen(e));
  if (open.length >= max) return open.slice(0, max);

  const openIds = new Set(open.map((e) => e.id));
  const rest = [...exams]
    .filter((e) => !openIds.has(e.id))
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return (b.exam_series || "").localeCompare(a.exam_series || "");
    });

  return [...open, ...rest].slice(0, max);
}

export function SchoolExamBrowseCards({
  exams,
  hrefForExam,
  actionLabel = "Open",
  emptyDescription = "Examinations available to your school will appear here.",
  loading = false,
  max = 3,
}: SchoolExamBrowseCardsProps) {
  const router = useRouter();
  const visible = pickCurrentBrowseExams(exams, max);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none"
          >
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-10 text-center shadow-none">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Calendar className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No examinations</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((exam) => {
        const open = isExamRegistrationOpen(exam);
        const href = hrefForExam(exam.id);
        return (
          <div
            key={exam.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(href)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(href);
              }
            }}
            className={cn(
              "group cursor-pointer rounded-lg border border-border bg-card p-5 shadow-none transition-colors",
              "hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{examTitle(exam)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {exam.registration_period
                    ? open
                      ? `Ends ${new Date(exam.registration_period.registration_end_date).toLocaleDateString()}`
                      : `Ended ${new Date(exam.registration_period.registration_end_date).toLocaleDateString()}`
                    : "No registration period"}
                </p>
              </div>
              {open ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-success/30 bg-success/10 text-success shadow-none"
                >
                  Open
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="shrink-0 text-muted-foreground shadow-none"
                >
                  Closed
                </Badge>
              )}
            </div>

            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-primary hover:underline"
            >
              {actionLabel}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
