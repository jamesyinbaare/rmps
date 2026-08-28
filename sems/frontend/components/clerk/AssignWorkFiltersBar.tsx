"use client";

import { ChevronDown, Filter, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SubjectMultiSelectFilter,
  type SubjectTypeFilterValue,
} from "@/components/SubjectMultiSelectFilter";
import type { Subject } from "@/types/document";
import { cn } from "@/lib/utils";

type ExamOption = { value: number; label: string };
export type AssignStreamFilter = "all" | "doc" | "nod";

interface AssignWorkFiltersBarProps {
  examOptions: ExamOption[];
  selectedExamId: number | null;
  onExamChange: (value: string | number | "all" | "") => void;
  subjects: Subject[];
  subjectIds: number[];
  onSubjectIdsChange: (ids: number[]) => void;
  subjectTypeFilter: SubjectTypeFilterValue;
  onSubjectTypeFilterChange: (value: SubjectTypeFilterValue) => void;
  testType?: number | null;
  onTestTypeChange: (value: number | null) => void;
  streamFilter: AssignStreamFilter;
  onStreamFilterChange: (value: AssignStreamFilter) => void;
  loading?: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  onClear: () => void;
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export function AssignWorkFiltersBar({
  examOptions,
  selectedExamId,
  onExamChange,
  subjects,
  subjectIds,
  onSubjectIdsChange,
  subjectTypeFilter,
  onSubjectTypeFilterChange,
  testType,
  onTestTypeChange,
  streamFilter,
  onStreamFilterChange,
  loading,
  onRefresh,
  refreshing,
  onClear,
}: AssignWorkFiltersBarProps) {
  const extraFilterCount =
    (testType ? 1 : 0) + (streamFilter !== "all" ? 1 : 0);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (selectedExamId) {
    const exam = examOptions.find((e) => e.value === selectedExamId);
    chips.push({
      key: "exam",
      label: `Exam: ${exam?.label ?? selectedExamId}`,
      onRemove: () => onExamChange("all"),
    });
  }
  if (subjectTypeFilter !== "ALL") {
    chips.push({
      key: "subject-type",
      label: `Type: ${subjectTypeFilter === "CORE" ? "Core" : "Elective"}`,
      onRemove: () => onSubjectTypeFilterChange("ALL"),
    });
  }
  if (subjectIds.length === 1) {
    const subject = subjects.find((s) => s.id === subjectIds[0]);
    chips.push({
      key: "subject",
      label: `Subject: ${subject ? `${subject.code} - ${subject.name}` : subjectIds[0]}`,
      onRemove: () => onSubjectIdsChange([]),
    });
  } else if (subjectIds.length > 1) {
    chips.push({
      key: "subjects",
      label: `Subjects: ${subjectIds.length}`,
      onRemove: () => onSubjectIdsChange([]),
    });
  }
  if (testType) {
    chips.push({
      key: "paper",
      label: `Paper: ${testType === 1 ? "Objectives" : testType === 2 ? "Essay" : "Practical"}`,
      onRemove: () => onTestTypeChange(null),
    });
  }
  if (streamFilter !== "all") {
    chips.push({
      key: "stream",
      label: streamFilter === "doc" ? "DOC only" : "NOD only",
      onRemove: () => onStreamFilterChange("all"),
    });
  }

  const hasActiveFilters = chips.length > 0;

  return (
    <div className="space-y-2">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_minmax(240px,1fr)_auto] xl:items-end">
        <FilterField label="Examination" className="sm:col-span-2 xl:col-span-1">
          <SearchableSelect
            options={examOptions}
            value={selectedExamId || ""}
            onValueChange={onExamChange}
            placeholder="Select examination"
            disabled={loading}
            allowAll
            allLabel="Select examination"
            searchPlaceholder="Search examinations..."
            emptyMessage="No examinations found"
            triggerClassName="h-9 w-full bg-background"
          />
        </FilterField>

        <FilterField label="Subjects">
          <SubjectMultiSelectFilter
            subjects={subjects}
            value={subjectIds}
            onChange={onSubjectIdsChange}
            subjectType={subjectTypeFilter}
            onSubjectTypeChange={onSubjectTypeFilterChange}
            disabled={loading || !selectedExamId}
            className="w-full [&>button]:h-9 [&>button]:min-w-0 [&>button]:max-w-none [&>button]:w-full [&>button]:bg-background"
          />
        </FilterField>

        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-background">
                <Filter className="h-3.5 w-3.5" />
                More
                {extraFilterCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
                    {extraFilterCount}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Paper</p>
                <Select
                  value={testType?.toString() || "all"}
                  onValueChange={(value) =>
                    onTestTypeChange(value === "all" ? null : parseInt(value, 10))
                  }
                  disabled={loading}
                >
                  <SelectTrigger size="sm" className="h-8 w-full">
                    <SelectValue placeholder="Paper" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All papers</SelectItem>
                    <SelectItem value="1">Objectives</SelectItem>
                    <SelectItem value="2">Essay</SelectItem>
                    <SelectItem value="3">Practical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Stream</p>
                <Select
                  value={streamFilter}
                  onValueChange={(value) => onStreamFilterChange(value as AssignStreamFilter)}
                  disabled={loading}
                >
                  <SelectTrigger size="sm" className="h-8 w-full">
                    <SelectValue placeholder="Stream" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All streams</SelectItem>
                    <SelectItem value="doc">DOC only</SelectItem>
                    <SelectItem value="nod">NOD only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh batches"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>

          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={onClear} className="h-9 bg-background">
              Reset
            </Button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex max-h-16 flex-wrap items-center gap-2 overflow-y-auto rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">Active filters</span>
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="h-6 cursor-pointer gap-1 rounded-md pr-1.5 text-xs hover:bg-secondary/80"
              onClick={chip.onRemove}
            >
              {chip.label}
              <X className="h-3 w-3 opacity-60" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
