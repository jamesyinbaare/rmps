"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { RegistrationExam } from "@/types";
import {
  primaryRegistrationType,
  registrationTypeLabel,
} from "@/lib/school-registration";
import { cn } from "@/lib/utils";

export interface ExamRegisterKpis {
  total: number;
  approved: number; // complete count (legacy field name kept for callers)
  pending: number; // incomplete count (legacy field name kept for callers)
  complete?: number;
  incomplete?: number;
}

interface SchoolExamRegisterCardProps {
  exam: RegistrationExam;
  kpis: ExamRegisterKpis;
  /** Defaults to register workspace path */
  href?: string;
  className?: string;
}

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

function daysLeft(exam: RegistrationExam): number {
  if (!exam.registration_period) return 0;
  const end = new Date(exam.registration_period.registration_end_date);
  const now = new Date();
  const diff = Math.ceil(
    (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, diff);
}

export function isExamRegistrationOpen(exam: RegistrationExam): boolean {
  if (!exam.registration_period?.is_active) return false;
  const now = new Date();
  const start = new Date(exam.registration_period.registration_start_date);
  const end = new Date(exam.registration_period.registration_end_date);
  return start <= now && end >= now;
}

export function SchoolExamRegisterCard({
  exam,
  kpis,
  href,
  className,
}: SchoolExamRegisterCardProps) {
  const router = useRouter();
  const targetHref =
    href ?? `/dashboard/my-school/register/${exam.id}`;
  const open = isExamRegistrationOpen(exam);
  const left = daysLeft(exam);
  const completeCount = kpis.complete ?? kpis.approved;
  const incompleteCount = kpis.incomplete ?? kpis.pending;
  const completion =
    kpis.total === 0
      ? 0
      : Math.round((completeCount / kpis.total) * 1000) / 10;
  const period = exam.registration_period;
  const defaultType =
    exam.exam_kind === "private"
      ? "Private"
      : registrationTypeLabel(primaryRegistrationType(exam));

  const go = () => router.push(targetHref);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      className={cn(
        "group cursor-pointer rounded-lg border border-border bg-card p-5 shadow-none transition-colors",
        "hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{examTitle(exam)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {period
              ? open
                ? `Ends ${new Date(period.registration_end_date).toLocaleDateString()}`
                : `Ended ${new Date(period.registration_end_date).toLocaleDateString()}`
              : "No registration period"}
          </p>
        </div>
        {open ? (
          <Badge
            variant="outline"
            className="shrink-0 border-success/30 bg-success/10 text-success"
          >
            Open
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 text-muted-foreground"
          >
            Closed
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">
            {exam.expected_total != null ? "Registered / expected" : "Candidates"}
          </div>
          <div className="font-mono text-xl font-medium tracking-tight">
            {exam.expected_total != null
              ? `${kpis.total.toLocaleString()} / ${exam.expected_total.toLocaleString()}`
              : kpis.total.toLocaleString()}
          </div>
          {exam.expected_total != null && kpis.total > exam.expected_total && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Over expected
            </p>
          )}
        </div>
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">Complete</div>
          <div className="font-mono text-xl font-medium tracking-tight">
            {completeCount.toLocaleString()}
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">Incomplete</div>
          <div className="font-mono text-xl font-medium tracking-tight">
            {incompleteCount.toLocaleString()}
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">
            {open ? "Days left" : "Complete"}
          </div>
          <div
            className={cn(
              "font-mono text-xl font-medium tracking-tight",
              open && left <= 7 && "text-warning"
            )}
          >
            {open ? left : `${completion}%`}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid max-h-0 overflow-hidden opacity-0 transition-all duration-200",
          "group-hover:mt-4 group-hover:max-h-40 group-hover:opacity-100",
          "group-focus-within:mt-4 group-focus-within:max-h-40 group-focus-within:opacity-100"
        )}
      >
        <div className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {period && (
            <p>
              Window:{" "}
              {new Date(period.registration_start_date).toLocaleDateString()} –{" "}
              {new Date(period.registration_end_date).toLocaleDateString()}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs font-normal">
              Default: {defaultType}
            </Badge>
            {exam.exam_kind === "private" ? (
              <Badge variant="outline" className="text-xs font-normal">
                Private exam
              </Badge>
            ) : exam.allows_referral_registration !== false ? (
              <Badge variant="outline" className="text-xs font-normal">
                Referral allowed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs font-normal">
                No referral
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-normal">
              {completion}% complete
            </Badge>
          </div>
          <p className="font-medium text-primary">
            {open ? "Open registration →" : "View examination →"}
          </p>
        </div>
      </div>
    </div>
  );
}
