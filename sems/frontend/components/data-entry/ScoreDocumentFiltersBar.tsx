"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
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
import type { ExtractionProviderFilter, School, Subject } from "@/types/document";
import { DEFAULT_EXTRACTION_PROVIDER, extractionProviderFilterLabel } from "@/types/document";
import { cn } from "@/lib/utils";

type ExamOption = { value: number; label: string };

interface ScoreDocumentFiltersBarProps {
  examOptions: ExamOption[];
  selectedExamId: number | undefined;
  onExamChange: (value: string | number | "all" | "") => void;
  schools: School[];
  subjects: Subject[];
  schoolId?: number;
  subjectId?: number;
  testType?: string;
  extractionProvider?: ExtractionProviderFilter;
  onSchoolChange: (value: string | number | "all" | "") => void;
  onSubjectChange: (value: string | number | "all" | "") => void;
  onTestTypeChange: (value: string | undefined) => void;
  onExtractionProviderChange?: (value: ExtractionProviderFilter | undefined) => void;
  showProviderFilter?: boolean;
  /** Apply Scores: provider is a required write target, not an optional More filter. */
  requireProvider?: boolean;
  /** Extraction: exam must be chosen before documents load. */
  requireExam?: boolean;
  /** Extraction: subject must be chosen before documents load. */
  requireSubject?: boolean;
  /** Disable subject select until an exam is chosen (used with requireSubject). */
  subjectDisabled?: boolean;
  /** Show prev/next subject buttons (extraction workflow). */
  showSubjectNav?: boolean;
  onPrevSubject?: () => void;
  onNextSubject?: () => void;
  canPrevSubject?: boolean;
  canNextSubject?: boolean;
  /** Hide exam/subject selects when shown elsewhere (e.g. empty state or context strip). */
  hideExamSubject?: boolean;
  loading?: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  onClear: () => void;
  trailing?: ReactNode;
}

export function ScoreDocumentFiltersBar({
  examOptions,
  selectedExamId,
  onExamChange,
  schools,
  subjects,
  schoolId,
  subjectId,
  testType,
  extractionProvider,
  onSchoolChange,
  onSubjectChange,
  onTestTypeChange,
  onExtractionProviderChange,
  showProviderFilter = false,
  requireProvider = false,
  requireExam = false,
  requireSubject = false,
  subjectDisabled = false,
  showSubjectNav = false,
  onPrevSubject,
  onNextSubject,
  canPrevSubject = false,
  canNextSubject = false,
  hideExamSubject = false,
  loading,
  onRefresh,
  refreshing,
  onClear,
  trailing,
}: ScoreDocumentFiltersBarProps) {
  const extraFilterCount =
    (testType ? 1 : 0) +
    (!requireProvider && showProviderFilter && extractionProvider ? 1 : 0);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (!hideExamSubject && selectedExamId) {
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
  if (!hideExamSubject && subjectId) {
    const subject = subjects.find((s) => s.id === subjectId);
    chips.push({
      key: "subject",
      label: `Subject: ${subject ? `${subject.code} - ${subject.name}` : subjectId}`,
      onRemove: () => onSubjectChange("all"),
    });
  }
  if (testType) {
    chips.push({
      key: "paper",
      label: `Paper: ${testType === "1" ? "Objectives" : testType === "2" ? "Essay" : testType === "3" ? "Practicals" : testType}`,
      onRemove: () => onTestTypeChange(undefined),
    });
  }
  if (!requireProvider && showProviderFilter && extractionProvider) {
    chips.push({
      key: "provider",
      label: `Has extraction from: ${extractionProviderFilterLabel(extractionProvider)}`,
      onRemove: () => onExtractionProviderChange?.(undefined),
    });
  }

  const hasActiveFilters =
    chips.length > 0 ||
    (requireProvider &&
      !!extractionProvider &&
      extractionProvider !== DEFAULT_EXTRACTION_PROVIDER);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hideExamSubject && (
          <>
            <div className="w-[280px]">
              <SearchableSelect
                options={examOptions}
                value={selectedExamId || ""}
                onValueChange={onExamChange}
                placeholder={requireExam ? "Select examination…" : "Examination"}
                disabled={loading}
                allowAll={!requireExam}
                allLabel="All examinations"
                searchPlaceholder="Search examinations..."
                emptyMessage="No examinations found"
                triggerClassName="h-8"
              />
            </div>

            <div className="flex items-center gap-1">
              <div className="w-[240px]">
                <SearchableSelect
                  options={subjects.map((subject) => ({
                    value: subject.id,
                    label: `${subject.code} - ${subject.name}`,
                  }))}
                  value={subjectId || ""}
                  onValueChange={onSubjectChange}
                  placeholder={
                    requireSubject
                      ? selectedExamId
                        ? "Select subject…"
                        : "Select examination first"
                      : "Subject"
                  }
                  disabled={loading || subjectDisabled || (requireSubject && !selectedExamId)}
                  allowAll={!requireSubject}
                  allLabel="All subjects"
                  searchPlaceholder="Search subject code or name..."
                  emptyMessage={
                    requireSubject && !selectedExamId
                      ? "Select an examination first"
                      : "No subjects found"
                  }
                  triggerClassName="h-8"
                />
              </div>
              {showSubjectNav && (
                <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={!canPrevSubject || loading || subjectDisabled}
                    onClick={onPrevSubject}
                    aria-label="Previous subject"
                    title="Previous subject"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={!canNextSubject || loading || subjectDisabled}
                    onClick={onNextSubject}
                    aria-label="Next subject"
                    title="Next subject"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="w-[240px]">
          <SearchableSelect
            options={schools.map((school) => ({
              value: school.id,
              label: `${school.code} - ${school.name}`,
            }))}
            value={schoolId || ""}
            onValueChange={onSchoolChange}
            placeholder="School"
            disabled={loading}
            allowAll
            allLabel="All schools"
            searchPlaceholder="Search schools..."
            emptyMessage="No schools found"
            triggerClassName="h-8"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1">
              More
              {extraFilterCount > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums">
                  {extraFilterCount}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Paper</p>
              <Select
                value={testType || "all"}
                onValueChange={(value) => onTestTypeChange(value === "all" ? undefined : value)}
                disabled={loading}
              >
                <SelectTrigger size="sm" className="h-8 w-full">
                  <SelectValue placeholder="Paper" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All papers</SelectItem>
                  <SelectItem value="1">Objectives</SelectItem>
                  <SelectItem value="2">Essay</SelectItem>
                  <SelectItem value="3">Practicals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!requireProvider && showProviderFilter && onExtractionProviderChange && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Has extraction from</p>
                <Select
                  value={extractionProvider || "all"}
                  onValueChange={(value) =>
                    onExtractionProviderChange(
                      value === "all" ? undefined : (value as ExtractionProviderFilter)
                    )
                  }
                  disabled={loading}
                >
                  <SelectTrigger size="sm" className="h-8 w-full">
                    <SelectValue placeholder="Has extraction from" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    <SelectItem value="llama_only">Llama Extract only</SelectItem>
                    <SelectItem value="reducto_only">Reducto only</SelectItem>
                    <SelectItem value="both">Both providers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh list"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>

        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={onClear} className="h-8">
            Reset
          </Button>
        )}

        {trailing ? <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div> : null}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active:</span>
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="h-5 cursor-pointer gap-1 pr-1 text-xs hover:bg-secondary/80"
              onClick={chip.onRemove}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
