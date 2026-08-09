"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { Exam } from "@/types/document";

type DataEntryOpsHeaderProps = {
  title: string;
  description: string;
  exams: Exam[];
  examId: number | null;
  onExamIdChange: (examId: number | null) => void;
  actions?: ReactNode;
  showExamSelect?: boolean;
  examAllLabel?: string;
  examPlaceholder?: string;
};

export function DataEntryOpsHeader({
  title,
  description,
  exams,
  examId,
  onExamIdChange,
  actions,
  showExamSelect = true,
  examAllLabel = "Select examination",
  examPlaceholder = "Select examination",
}: DataEntryOpsHeaderProps) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3 min-w-0 flex-1">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        {showExamSelect ? (
          <div className="max-w-md">
            <Label className="text-xs text-muted-foreground">Examination</Label>
            <SearchableSelect
              options={exams.map((e) => ({
                value: e.id,
                label: `${e.exam_type} · ${e.series} ${e.year}`,
              }))}
              value={examId ?? "all"}
              onValueChange={(v) =>
                onExamIdChange(v === "all" || v === "" ? null : Number(v))
              }
              placeholder={examPlaceholder}
              allowAll
              allLabel={examAllLabel}
            />
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
