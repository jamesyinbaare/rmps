"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listExams, listSchools, listSubjects } from "@/lib/api";
import type { Exam, School, Subject, DocumentFilters } from "@/types/document";

interface DocumentFiltersProps {
  filters: DocumentFilters;
  onFiltersChange: (filters: DocumentFilters) => void;
}

export function DocumentFilters({ filters, onFiltersChange }: DocumentFiltersProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        // Fetch all items by paginating through results
        // Backend has max page_size of 100, so we need to paginate

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

        // Load schools (may return array or need pagination)
        let allSchools: School[] = [];
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schoolsData = await listSchools(schoolPage, 100);
          const schools = Array.isArray(schoolsData) ? schoolsData : [];
          allSchools = [...allSchools, ...schools];
          // If we got fewer than requested, we're done
          schoolHasMore = schools.length === 100;
          schoolPage++;
        }

        // Load subjects (may return array or need pagination)
        let allSubjects: Subject[] = [];
        let subjectPage = 1;
        let subjectHasMore = true;
        while (subjectHasMore) {
          const subjectsData = await listSubjects(subjectPage, 100);
          const subjects = Array.isArray(subjectsData) ? subjectsData : [];
          allSubjects = [...allSubjects, ...subjects];
          // If we got fewer than requested, we're done
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
    // Reset to page 1 when filters change
    newFilters.page = 1;
    onFiltersChange(newFilters);
  };

  const handleClearFilters = () => {
    onFiltersChange({ page: 1 });
  };

  const hasActiveFilters = filters.exam_id || filters.school_id || filters.subject_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4">
          <Select
            value={filters.exam_id?.toString() || undefined}
            onValueChange={(value) => handleFilterChange("exam_id", value === "all" ? undefined : value)}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select examination" />
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
            <SelectTrigger>
              <SelectValue placeholder="Select school" />
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
            <SelectTrigger>
              <SelectValue placeholder="Select subject" />
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

          <Button
            variant="outline"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters || loading}
            className="w-full md:w-auto"
          >
            Clear Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
