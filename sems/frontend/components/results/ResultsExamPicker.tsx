"use client";

import { useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import type { Exam } from "@/types/document";
import { ChevronRight } from "lucide-react";
import { examLabel } from "./exam-label";

interface ResultsExamPickerProps {
  exams: Exam[];
  loading?: boolean;
  disabled?: boolean;
  initialExamId?: number;
  confirmLabel?: string;
  onConfirm: (examId: number) => void;
}

export function ResultsExamPicker({
  exams,
  loading,
  disabled,
  initialExamId,
  confirmLabel = "View exam dashboard",
  onConfirm,
}: ResultsExamPickerProps) {
  const [examId, setExamId] = useState<number | "">(initialExamId ?? "");

  const options = useMemo(
    () =>
      [...exams]
        .sort((a, b) => b.year - a.year || a.exam_type.localeCompare(b.exam_type))
        .map((exam) => ({
          value: exam.id,
          label: examLabel(exam),
        })),
    [exams]
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Examination
        </label>
        <SearchableSelect
          options={options}
          value={examId}
          onValueChange={(value) => {
            if (value === "all" || value === "") setExamId("");
            else setExamId(Number(value));
          }}
          placeholder="Search examinations..."
          searchPlaceholder="Type to search..."
          emptyMessage="No examinations match"
          disabled={loading || disabled}
        />
      </div>
      <Button
        className="h-11 shrink-0"
        disabled={examId === "" || loading || disabled}
        onClick={() => {
          if (examId === "") return;
          onConfirm(examId);
        }}
      >
        {confirmLabel}
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
