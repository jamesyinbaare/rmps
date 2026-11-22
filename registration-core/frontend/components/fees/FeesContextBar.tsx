"use client";

import Link from "next/link";
import { ArrowLeft, Building2, GraduationCap } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RegistrationExam, School } from "@/types";

interface FeesContextBarProps {
  mode: "school" | "admin";
  exams: RegistrationExam[];
  schools: School[];
  examId: number | null;
  schoolId: number | null;
  onExamChange: (id: number | null) => void;
  onSchoolChange: (id: number | null) => void;
  /** When set, hide the exam select and show a fixed exam label + optional back link. */
  examLocked?: boolean;
  backHref?: string;
  backLabel?: string;
}

function examLabel(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

export function FeesContextBar({
  mode,
  exams,
  schools,
  examId,
  schoolId,
  onExamChange,
  onSchoolChange,
  examLocked = false,
  backHref,
  backLabel = "All examinations",
}: FeesContextBarProps) {
  const selectedExam = exams.find((e) => e.id === examId) || null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 md:p-6">
      {examLocked && backHref ? (
        <div className="mb-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        {mode === "admin" ? (
          <div className="w-full space-y-2 lg:max-w-xs">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              School
            </Label>
            <Select
              value={schoolId?.toString() || "all"}
              onValueChange={(v) =>
                onSchoolChange(v === "all" ? null : parseInt(v, 10))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select school" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {examLocked ? (
          <div className="w-full space-y-1 lg:max-w-md">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" />
              Examination
            </p>
            <p className="text-sm font-medium">
              {selectedExam ? examLabel(selectedExam) : "Examination"}
            </p>
            <p className="text-xs text-muted-foreground">
              Scope locked to this examination.
            </p>
          </div>
        ) : (
          <div className="w-full space-y-2 lg:max-w-md">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" />
              Examination
            </Label>
            <Select
              value={examId?.toString() || ""}
              onValueChange={(v) => onExamChange(v ? parseInt(v, 10) : null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select examination to manage fees" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} {exam.exam_series || ""} {exam.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!examLocked ? (
          <p className="text-xs text-muted-foreground lg:pb-2 lg:pl-2">
            {mode === "admin" && !schoolId
              ? "Pick a school and exam to browse candidates and build invoices."
              : !examId
                ? "Choose an examination to see amounts due and unpaid candidates."
                : "Scope locked to this examination."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
