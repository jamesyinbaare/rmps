"use client";

import { useEffect, useState, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getAllExams, listSchools, listSubjects, findExamId } from "@/lib/api";
import type { Exam, School, Subject, DocumentFilters, ExamType, ExamSeries } from "@/types/document";
import { X } from "lucide-react";

interface CompactFiltersProps {
  filters: DocumentFilters;
  onFiltersChange: (filters: DocumentFilters) => void;
}

export function CompactFilters({ filters, onFiltersChange }: CompactFiltersProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [examType, setExamType] = useState<ExamType | undefined>();
  const [examSeries, setExamSeries] = useState<ExamSeries | undefined>();
  const [examYear, setExamYear] = useState<number | undefined>();
  const prevValuesRef = useRef<{ examType?: ExamType; examSeries?: ExamSeries; examYear?: number }>({});
  const filtersRef = useRef(filters);
  const isUpdatingFromFiltersRef = useRef(false);

  // Keep filters ref up to date
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        // Load exams
        const allExams = await getAllExams();

        // Load schools
        let allSchools: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schoolsData = await listSchools(schoolPage, 100);
          const schools = Array.isArray(schoolsData) ? schoolsData : [];
          allSchools = [...allSchools, ...schools];
          schoolHasMore = schools.length === 100;
          schoolPage++;
        }

        // Load subjects
        let allSubjects: Subject[] = [];
        let subjectPage = 1;
        let subjectHasMore = true;
        while (subjectHasMore) {
          const subjectsData = await listSubjects(subjectPage, 100);
          const subjects = Array.isArray(subjectsData) ? subjectsData : [];
          allSubjects = [...allSubjects, ...subjects];
          subjectHasMore = subjects.length === 100;
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

    loadFilterOptions();
  }, []);

  // Reverse lookup exam_id or use exam_type, series, year from filters
  useEffect(() => {
    if (exams.length > 0 && !isUpdatingFromFiltersRef.current) {
      let shouldUpdate = false;
      let newExamType = examType;
      let newExamSeries = examSeries;
      let newExamYear = examYear;

      // If exam_type, series, year are in filters, use them
      if (filters.exam_type || filters.series || filters.year) {
        if (filters.exam_type && filters.exam_type !== examType) {
          newExamType = filters.exam_type;
          shouldUpdate = true;
        }
        if (filters.series && filters.series !== examSeries) {
          newExamSeries = filters.series;
          shouldUpdate = true;
        }
        if (filters.year && filters.year !== examYear) {
          newExamYear = filters.year;
          shouldUpdate = true;
        }
      } else if (filters.exam_id && (!examType || !examSeries || !examYear)) {
        // Fallback: if exam_id is set, reverse lookup
        const exam = exams.find((e) => e.id === filters.exam_id);
        if (exam) {
          newExamType = exam.exam_type as ExamType;
          newExamSeries = exam.series as ExamSeries;
          newExamYear = exam.year;
          shouldUpdate = true;
        }
      } else if (!filters.exam_id && !filters.exam_type && !filters.series && !filters.year) {
        // Clear selections when all filters are cleared
        if (examType || examSeries || examYear) {
          newExamType = undefined;
          newExamSeries = undefined;
          newExamYear = undefined;
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        isUpdatingFromFiltersRef.current = true;
        setExamType(newExamType);
        setExamSeries(newExamSeries);
        setExamYear(newExamYear);
        // Reset flag after state updates complete
        // Use requestAnimationFrame to ensure state updates have been processed
        requestAnimationFrame(() => {
          setTimeout(() => {
            isUpdatingFromFiltersRef.current = false;
          }, 0);
        });
      }
    }
  }, [filters.exam_id, filters.exam_type, filters.series, filters.year, exams]);

  // Update filters when exam type, series, or year changes
  useEffect(() => {
    // Check if values have actually changed from previous render
    const prev = prevValuesRef.current;
    const hasChanged =
      prev.examType !== examType ||
      prev.examSeries !== examSeries ||
      prev.examYear !== examYear;

    if (!hasChanged) {
      return; // No change, skip update
    }

    // Update ref immediately to prevent duplicate updates
    prevValuesRef.current = { examType, examSeries, examYear };

    // If we're updating from filters (reverse lookup), don't update filters again
    if (isUpdatingFromFiltersRef.current) {
      return;
    }

    const newExamType = examType && examType !== "all" ? examType : undefined;
    const newSeries = examSeries && examSeries !== "all" ? examSeries : undefined;
    const newYear = examYear || undefined;

    const newFilters: DocumentFilters = { ...filtersRef.current };

    // Set or clear exam_type, series, and year based on selections
    // This allows progressive filtering: type only, type+series, or type+series+year
    if (newExamType) {
      newFilters.exam_type = newExamType;
    } else {
      delete newFilters.exam_type;
      // If exam_type is cleared, also clear series and year
      delete newFilters.series;
      delete newFilters.year;
    }

    if (newSeries && newExamType) {
      // Only set series if exam_type is also selected
      newFilters.series = newSeries;
    } else {
      delete newFilters.series;
      // If series is cleared, also clear year
      delete newFilters.year;
    }

    if (newYear && newExamType && newSeries) {
      // Only set year if both exam_type and series are selected
      newFilters.year = newYear;
    } else {
      delete newFilters.year;
    }

    // If all three are selected, also set exam_id for backward compatibility
    if (newExamType && newSeries && newYear && exams.length > 0) {
      const foundExamId = findExamId(exams, newExamType, newSeries, newYear);
      if (foundExamId) {
        newFilters.exam_id = foundExamId;
      } else {
        delete newFilters.exam_id;
      }
    } else {
      // Clear exam_id if not all three are selected
      delete newFilters.exam_id;
    }

    newFilters.page = 1;

    // Always call onFiltersChange when any selection changes
    // The backend will handle partial filters correctly
    onFiltersChange(newFilters);
  }, [examType, examSeries, examYear, exams, onFiltersChange]);

  const handleFilterChange = (key: keyof DocumentFilters, value: string | undefined) => {
    const newFilters = { ...filters };
    if (value === undefined || value === "all" || value === "") {
      delete newFilters[key];
    } else {
      newFilters[key] = parseInt(value, 10);
    }
    newFilters.page = 1;
    onFiltersChange(newFilters);
  };

  const handleClearFilters = () => {
    onFiltersChange({ page: 1 });
  };

  const hasActiveFilters = filters.exam_id || filters.school_id || filters.subject_id;

  const selectedSchool = schools.find((s) => s.id === filters.school_id);
  const selectedSubject = subjects.find((s) => s.id === filters.subject_id);

  // Get available exam types from exams (unique types)
  const availableExamTypes = Array.from(new Set(exams.map((e) => e.exam_type as ExamType)));

  // Get available series from exams
  // If examType is selected, filter by that type; otherwise show all series that exist
  const availableSeries = examType
    ? Array.from(new Set(exams.filter((e) => e.exam_type === examType).map((e) => e.series as ExamSeries)))
    : Array.from(new Set(exams.map((e) => e.series as ExamSeries)));

  // Get available years from exams
  // Filter by examType and examSeries if they're selected
  let filteredExamsForYears = exams;
  if (examType) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.exam_type === examType);
  }
  if (examSeries) {
    filteredExamsForYears = filteredExamsForYears.filter((e) => e.series === examSeries);
  }
  const availableYears = Array.from(new Set(filteredExamsForYears.map((e) => e.year)))
    .sort((a, b) => b - a);

  const handleExamTypeChange = (value: string) => {
    // Ensure we're not in "updating from filters" mode when user manually changes
    isUpdatingFromFiltersRef.current = false;

    if (value === "all" || value === "") {
      setExamType(undefined);
    } else {
      setExamType(value as ExamType);
      // Clear series and year when type changes if they're no longer valid
      const newSeries = examSeries;
      const newYear = examYear;
      const validSeries = Array.from(new Set(exams.filter((e) => e.exam_type === value).map((e) => e.series as ExamSeries)));
      if (newSeries && !validSeries.includes(newSeries)) {
        setExamSeries(undefined);
      }
      if (newYear) {
        const validYears = Array.from(new Set(
          exams
            .filter((e) => e.exam_type === value)
            .filter((e) => !newSeries || e.series === newSeries)
            .map((e) => e.year)
        ));
        if (!validYears.includes(newYear)) {
          setExamYear(undefined);
        }
      }
    }
  };

  const handleExamSeriesChange = (value: string) => {
    // Ensure we're not in "updating from filters" mode when user manually changes
    isUpdatingFromFiltersRef.current = false;

    if (value === "all" || value === "") {
      setExamSeries(undefined);
    } else {
      setExamSeries(value as ExamSeries);
      // Clear year when series changes if it's no longer valid
      if (examYear) {
        const validYears = Array.from(new Set(
          exams
            .filter((e) => !examType || e.exam_type === examType)
            .filter((e) => e.series === value)
            .map((e) => e.year)
        ));
        if (!validYears.includes(examYear)) {
          setExamYear(undefined);
        }
      }
    }
  };

  const handleExamYearChange = (value: string) => {
    // Ensure we're not in "updating from filters" mode when user manually changes
    isUpdatingFromFiltersRef.current = false;

    if (value === "all" || value === "") {
      setExamYear(undefined);
    } else {
      setExamYear(parseInt(value, 10));
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Examination Type */}
      <Select
        value={examType || ""}
        onValueChange={handleExamTypeChange}
        disabled={loading}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="Exam Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {availableExamTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {type === "Certificate II Examination" ? "Certificate II" : type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Examination Series */}
      <Select
        value={examSeries || ""}
        onValueChange={handleExamSeriesChange}
        disabled={loading || !examType}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="Series" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All series</SelectItem>
          {availableSeries.map((series) => (
            <SelectItem key={series} value={series}>
              {series}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Examination Year */}
      <Select
        value={examYear?.toString() || ""}
        onValueChange={handleExamYearChange}
        disabled={loading || !examType || !examSeries}
      >
        <SelectTrigger className="h-8 w-[120px]">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All years</SelectItem>
          {availableYears.map((year) => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.school_id?.toString() || undefined}
        onValueChange={(value) => handleFilterChange("school_id", value === "all" ? undefined : value)}
        disabled={loading}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="School" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All schools</SelectItem>
          {schools.map((school) => (
            <SelectItem key={school.id} value={school.id.toString()}>
              {school.code} - {school.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.subject_id?.toString() || undefined}
        onValueChange={(value) => handleFilterChange("subject_id", value === "all" ? undefined : value)}
        disabled={loading}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="Subject" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All subjects</SelectItem>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id.toString()}>
              {subject.code} - {subject.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          disabled={loading}
          className="h-8 gap-1"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
