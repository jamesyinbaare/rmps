"use client";

import type { ReactNode } from "react";
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
import type {
  School,
  Subject,
  ValidationIssueStatus,
  ValidationIssueType,
} from "@/types/document";
import { cn } from "@/lib/utils";

type ExamOption = { value: number; label: string };

export type BatchFilterValue = "all" | "batched" | "unbatched";

interface ValidationScopeFiltersBarProps {
  examOptions: ExamOption[];
  selectedExamId: number | undefined;
  onExamChange: (value: string | number | "all" | "") => void;
  schools: School[];
  subjects: Subject[];
  schoolId?: number;
  onSchoolChange: (value: string | number | "all" | "") => void;
  subjectIds: number[];
  onSubjectIdsChange: (ids: number[]) => void;
  subjectTypeFilter: SubjectTypeFilterValue;
  onSubjectTypeFilterChange: (value: SubjectTypeFilterValue) => void;
  testType?: number;
  onTestTypeChange: (value: number | undefined) => void;
  statusFilter: ValidationIssueStatus | null;
  onStatusFilterChange: (value: ValidationIssueStatus | null) => void;
  issueTypeFilter: ValidationIssueType | null;
  onIssueTypeFilterChange: (value: ValidationIssueType | null) => void;
  batchFilter: BatchFilterValue;
  onBatchFilterChange: (value: BatchFilterValue) => void;
  loading?: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  onClear: () => void;
  trailing?: ReactNode;
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function ValidationScopeFiltersBar({
  examOptions,
  selectedExamId,
  onExamChange,
  schools,
  subjects,
  schoolId,
  onSchoolChange,
  subjectIds,
  onSubjectIdsChange,
  subjectTypeFilter,
  onSubjectTypeFilterChange,
  testType,
  onTestTypeChange,
  statusFilter,
  onStatusFilterChange,
  issueTypeFilter,
  onIssueTypeFilterChange,
  batchFilter,
  onBatchFilterChange,
  loading,
  onRefresh,
  refreshing,
  onClear,
  trailing,
}: ValidationScopeFiltersBarProps) {
  const extraFilterCount =
    (testType ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (issueTypeFilter ? 1 : 0) +
    (batchFilter !== "all" ? 1 : 0);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (selectedExamId) {
    const exam = examOptions.find((e) => e.value === selectedExamId);
    chips.push({
      key: "exam",
      label: `Exam: ${exam?.label ?? selectedExamId}`,
      onRemove: () => onExamChange("all"),
    });
  }
  if (schoolId) {
    const school = schools.find((s) => s.id === schoolId);
    chips.push({
      key: "school",
      label: `School: ${school ? `${school.code} - ${school.name}` : schoolId}`,
      onRemove: () => onSchoolChange("all"),
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
      onRemove: () => onTestTypeChange(undefined),
    });
  }
  if (statusFilter) {
    chips.push({
      key: "status",
      label: `Status: ${statusFilter === "pending" ? "Open" : statusFilter}`,
      onRemove: () => onStatusFilterChange(null),
    });
  }
  if (issueTypeFilter) {
    chips.push({
      key: "issue-type",
      label: `Issue: ${issueTypeFilter === "missing_score" ? "Missing" : "Invalid"}`,
      onRemove: () => onIssueTypeFilterChange(null),
    });
  }
  if (batchFilter !== "all") {
    chips.push({
      key: "batch",
      label: batchFilter === "batched" ? "Batched only" : "Unbatched only",
      onRemove: () => onBatchFilterChange("all"),
    });
  }

  const hasActiveFilters = chips.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(200px,1fr)_auto] xl:items-end">
          <FilterField label="Examination" className="sm:col-span-2 xl:col-span-1">
            <SearchableSelect
              options={examOptions}
              value={selectedExamId || ""}
              onValueChange={onExamChange}
              placeholder="All examinations"
              disabled={loading}
              allowAll
              allLabel="All examinations"
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
              disabled={loading}
              className="w-full [&>button]:h-9 [&>button]:min-w-0 [&>button]:max-w-none [&>button]:w-full [&>button]:bg-background"
            />
          </FilterField>

          <FilterField label="School">
            <SearchableSelect
              options={schools.map((school) => ({
                value: school.id,
                label: `${school.code} - ${school.name}`,
              }))}
              value={schoolId || ""}
              onValueChange={onSchoolChange}
              placeholder="All schools"
              disabled={loading}
              allowAll
              allLabel="All schools"
              searchPlaceholder="Search schools..."
              emptyMessage="No schools found"
              triggerClassName="h-9 w-full bg-background"
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
              <PopoverContent align="start" className="w-80 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Paper</p>
                  <Select
                    value={testType?.toString() || "all"}
                    onValueChange={(value) =>
                      onTestTypeChange(value === "all" ? undefined : parseInt(value, 10))
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
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <Select
                    value={statusFilter ?? "all"}
                    onValueChange={(value) =>
                      onStatusFilterChange(
                        value === "all" ? null : (value as ValidationIssueStatus)
                      )
                    }
                    disabled={loading}
                  >
                    <SelectTrigger size="sm" className="h-8 w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Open</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                      <SelectItem value="skipped">Skipped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Issue type</p>
                  <Select
                    value={issueTypeFilter ?? "all"}
                    onValueChange={(value) =>
                      onIssueTypeFilterChange(
                        value === "all" ? null : (value as ValidationIssueType)
                      )
                    }
                    disabled={loading}
                  >
                    <SelectTrigger size="sm" className="h-8 w-full">
                      <SelectValue placeholder="Issue type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="missing_score">Missing score</SelectItem>
                      <SelectItem value="invalid_score">Invalid score</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Batch</p>
                  <Select
                    value={batchFilter}
                    onValueChange={(value) =>
                      onBatchFilterChange(value as BatchFilterValue)
                    }
                    disabled={loading}
                  >
                    <SelectTrigger size="sm" className="h-8 w-full">
                      <SelectValue placeholder="Batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All issues</SelectItem>
                      <SelectItem value="batched">Batched only</SelectItem>
                      <SelectItem value="unbatched">Unbatched only</SelectItem>
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
              title="Refresh list"
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

        {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div> : null}
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
