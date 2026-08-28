"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SubjectMultiSelectFilter,
  type SubjectTypeFilterValue,
} from "@/components/SubjectMultiSelectFilter";
import { getAllExams, getAllSchools, getAllSubjects } from "@/lib/api";
import type { DocumentFilters, Exam, ExamSeries, ExamType, School, Subject } from "@/types/document";
import { X } from "lucide-react";

interface CompactFiltersProps {
  filters: DocumentFilters;
  onFiltersChange: (filters: DocumentFilters) => void;
  /** When true, exam is controlled elsewhere — only school/subject show. */
  hideExam?: boolean;
}

export function CompactFilters({
  filters,
  onFiltersChange,
  hideExam = false,
}: CompactFiltersProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const [allExams, allSchools, allSubjects] = await Promise.all([
          getAllExams(),
          getAllSchools(),
          getAllSubjects(),
        ]);
        setExams(allExams);
        setSchools(allSchools);
        setSubjects(allSubjects);
      } catch (error) {
        console.error("Failed to load filter options:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadFilterOptions();
  }, []);

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return (a.exam_type || "").localeCompare(b.exam_type || "");
        })
        .map((exam) => {
          const typeLabel =
            exam.exam_type === "Certificate II Examinations" ||
            exam.exam_type === "Certificate II Examination"
              ? "Certificate II"
              : exam.exam_type;
          return {
            value: exam.id,
            label: `${exam.year} ${exam.series} ${typeLabel}`,
          };
        }),
    [exams]
  );

  const subjectTypeFilter: SubjectTypeFilterValue = filters.subject_type ?? "ALL";
  const subjectIds = filters.subject_ids?.length
    ? filters.subject_ids
    : filters.subject_id
      ? [filters.subject_id]
      : [];

  const patchFilters = (patch: Partial<DocumentFilters>, clearKeys: (keyof DocumentFilters)[] = []) => {
    const next: DocumentFilters = { ...filters, ...patch, page: 1 };
    for (const key of clearKeys) {
      delete next[key];
    }
    onFiltersChange(next);
  };

  const handleExamChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      patchFilters({}, ["exam_id", "exam_type", "series", "year"]);
      return;
    }
    const examId = typeof value === "number" ? value : parseInt(String(value), 10);
    const exam = exams.find((e) => e.id === examId);
    if (!exam) {
      patchFilters({ exam_id: examId }, ["exam_type", "series", "year"]);
      return;
    }
    patchFilters({
      exam_id: exam.id,
      exam_type: exam.exam_type as ExamType,
      series: exam.series as ExamSeries,
      year: exam.year,
    });
  };

  const handleSchoolChange = (value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      patchFilters({}, ["school_id"]);
      return;
    }
    const numValue = typeof value === "number" ? value : parseInt(String(value), 10);
    if (Number.isNaN(numValue)) {
      patchFilters({}, ["school_id"]);
      return;
    }
    patchFilters({ school_id: numValue });
  };

  const handleSubjectIdsChange = (ids: number[]) => {
    const next: DocumentFilters = { ...filters, page: 1 };
    if (ids.length > 0) {
      next.subject_ids = ids;
      if (ids.length === 1) {
        next.subject_id = ids[0];
      } else {
        delete next.subject_id;
      }
    } else {
      delete next.subject_ids;
      delete next.subject_id;
    }
    onFiltersChange(next);
  };

  const handleSubjectTypeFilterChange = (value: SubjectTypeFilterValue) => {
    const next: DocumentFilters = { ...filters, page: 1 };
    if (value === "ALL") {
      delete next.subject_type;
    } else {
      next.subject_type = value;
      if (next.subject_ids?.length) {
        const allowed = new Set(
          subjects.filter((s) => s.subject_type === value).map((s) => s.id)
        );
        const pruned = next.subject_ids.filter((id) => allowed.has(id));
        if (pruned.length > 0) {
          next.subject_ids = pruned;
          if (pruned.length === 1) {
            next.subject_id = pruned[0];
          } else {
            delete next.subject_id;
          }
        } else {
          delete next.subject_ids;
          delete next.subject_id;
        }
      } else if (next.subject_id != null) {
        const subject = subjects.find((s) => s.id === next.subject_id);
        if (!subject || subject.subject_type !== value) {
          delete next.subject_id;
        }
      }
    }
    onFiltersChange(next);
  };

  const handleClearFilters = () => {
    if (hideExam) {
      const next: DocumentFilters = { ...filters, page: 1 };
      delete next.school_id;
      delete next.subject_id;
      delete next.subject_ids;
      delete next.subject_type;
      onFiltersChange(next);
      return;
    }
    onFiltersChange({ page: 1, page_size: filters.page_size });
  };

  const hasActiveFilters = hideExam
    ? !!filters.school_id ||
      !!filters.subject_id ||
      !!filters.subject_ids?.length ||
      !!filters.subject_type
    : !!filters.exam_id ||
      !!filters.school_id ||
      !!filters.subject_id ||
      !!filters.subject_ids?.length ||
      !!filters.subject_type;

  return (
    <div
      className={
        hideExam
          ? "flex flex-wrap items-center gap-1.5"
          : "flex flex-col flex-wrap items-stretch gap-2 sm:flex-row sm:items-center"
      }
    >
      {!hideExam ? (
        <div className="w-full sm:min-w-[260px] sm:flex-1 sm:max-w-md">
          <SearchableSelect
            options={examOptions}
            value={filters.exam_id || "all"}
            onValueChange={handleExamChange}
            placeholder="Examination"
            disabled={loading}
            allowAll
            allLabel="All examinations"
            searchPlaceholder="Search examinations..."
            emptyMessage="No examinations found"
          />
        </div>
      ) : null}

      <div className={hideExam ? "w-[160px] sm:w-[200px]" : "w-full sm:w-[280px]"}>
        <SearchableSelect
          options={schools.map((school) => ({
            value: school.id,
            label: `${school.code} - ${school.name}`,
          }))}
          value={filters.school_id || "all"}
          onValueChange={handleSchoolChange}
          placeholder="School"
          disabled={loading}
          allowAll
          allLabel="All schools"
          searchPlaceholder="Search schools..."
          emptyMessage="No schools found"
          triggerClassName={hideExam ? "h-8" : undefined}
        />
      </div>

      <SubjectMultiSelectFilter
        subjects={subjects}
        value={subjectIds}
        onChange={handleSubjectIdsChange}
        subjectType={subjectTypeFilter}
        onSubjectTypeChange={handleSubjectTypeFilterChange}
        disabled={loading}
        className={hideExam ? "min-w-[220px]" : "w-full sm:min-w-[280px]"}
      />

      {hasActiveFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          disabled={loading}
          className={
            hideExam
              ? "h-8 w-8 shrink-0 p-0"
              : "h-8 w-full gap-1 sm:w-auto"
          }
          aria-label="Clear school and subject filters"
        >
          <X className="h-3 w-3" />
          {!hideExam ? "Clear" : null}
        </Button>
      ) : null}
    </div>
  );
}
