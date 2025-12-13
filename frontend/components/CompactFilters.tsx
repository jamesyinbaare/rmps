"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { listExams, listSchools, listSubjects } from "@/lib/api";
import type { Exam, School, Subject, DocumentFilters } from "@/types/document";
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

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        // Load exams
        let allExams: Exam[] = [];
        let examPage = 1;
        let examHasMore = true;
        while (examHasMore) {
          const examsData = await listExams(examPage, 100);
          allExams = [...allExams, ...(examsData.items || [])];
          examHasMore = examPage < examsData.total_pages;
          examPage++;
        }

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

  const selectedExam = exams.find((e) => e.id === filters.exam_id);
  const selectedSchool = schools.find((s) => s.id === filters.school_id);
  const selectedSubject = subjects.find((s) => s.id === filters.subject_id);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={filters.exam_id?.toString() || undefined}
        onValueChange={(value) => handleFilterChange("exam_id", value === "all" ? undefined : value)}
        disabled={loading}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="Exam" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All examinations</SelectItem>
          {exams.map((exam) => (
            <SelectItem key={exam.id} value={exam.id.toString()}>
              {exam.name} ({exam.year})
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
