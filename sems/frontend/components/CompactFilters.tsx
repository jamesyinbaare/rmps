"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getAllExams, listSchools, listSubjects } from "@/lib/api";
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
        const allExams = await getAllExams();

        let allSchools: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schoolsData = await listSchools(schoolPage, 100);
          const pageSchools = Array.isArray(schoolsData) ? schoolsData : [];
          allSchools = [...allSchools, ...pageSchools];
          schoolHasMore = pageSchools.length === 100;
          schoolPage++;
        }

        let allSubjects: Subject[] = [];
        let subjectPage = 1;
        let subjectHasMore = true;
        while (subjectHasMore) {
          const subjectsData = await listSubjects(subjectPage, 100);
          const pageSubjects = Array.isArray(subjectsData) ? subjectsData : [];
          allSubjects = [...allSubjects, ...pageSubjects];
          subjectHasMore = pageSubjects.length === 100;
          subjectPage++;
        }

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

  const handleFilterChange = (key: "school_id" | "subject_id", value: string | number | "all" | "") => {
    if (value === "all" || value === "") {
      patchFilters({}, [key]);
      return;
    }
    const numValue = typeof value === "number" ? value : parseInt(String(value), 10);
    if (Number.isNaN(numValue)) {
      patchFilters({}, [key]);
      return;
    }
    patchFilters({ [key]: numValue });
  };

  const handleClearFilters = () => {
    if (hideExam) {
      const next: DocumentFilters = {
        page: 1,
        page_size: filters.page_size,
        exam_id: filters.exam_id,
        exam_type: filters.exam_type,
        series: filters.series,
        year: filters.year,
      };
      onFiltersChange(next);
      return;
    }
    onFiltersChange({ page: 1, page_size: filters.page_size });
  };

  const hasActiveFilters = hideExam
    ? !!filters.school_id || !!filters.subject_id
    : !!filters.exam_id || !!filters.school_id || !!filters.subject_id;

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
          onValueChange={(value) => handleFilterChange("school_id", value)}
          placeholder="School"
          disabled={loading}
          allowAll
          allLabel="All schools"
          searchPlaceholder="Search schools..."
          emptyMessage="No schools found"
          triggerClassName={hideExam ? "h-8" : undefined}
        />
      </div>

      <div className={hideExam ? "w-[160px] sm:w-[200px]" : "w-full sm:w-[280px]"}>
        <SearchableSelect
          options={subjects.map((subject) => ({
            value: subject.id,
            label: `${subject.code} - ${subject.name}`,
          }))}
          value={filters.subject_id || "all"}
          onValueChange={(value) => handleFilterChange("subject_id", value)}
          placeholder="Subject"
          disabled={loading}
          allowAll
          allLabel="All subjects"
          searchPlaceholder="Search subjects..."
          emptyMessage="No subjects found"
          triggerClassName={hideExam ? "h-8" : undefined}
        />
      </div>

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
          aria-label="Clear filters"
        >
          <X className="h-3 w-3" />
          {!hideExam ? "Clear" : null}
        </Button>
      ) : null}
    </div>
  );
}
