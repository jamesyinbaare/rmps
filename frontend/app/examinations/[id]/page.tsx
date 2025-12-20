"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ExamSubjectCard } from "@/components/ExamSubjectCard";
import { EditExamModal } from "@/components/EditExamModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getExam, listExamSubjects, type ExamSubject } from "@/lib/api";
import type { Exam } from "@/types/document";
import { ArrowLeft, Search, X, ClipboardList, Edit, Calendar } from "lucide-react";

export default function ExaminationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id ? parseInt(params.id as string) : null;

  const [exam, setExam] = useState<Exam | null>(null);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Load examination data
  useEffect(() => {
    const loadExamination = async () => {
      if (!examId) {
        setError("Invalid examination ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const examData = await getExam(examId);
        setExam(examData);

        const subjectsData = await listExamSubjects(examId);
        setSubjects(subjectsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load examination");
        console.error("Error loading examination:", err);
      } finally {
        setLoading(false);
      }
    };

    loadExamination();
  }, [examId]);

  // Filter subjects based on search and type filter
  const filteredSubjects = useMemo(() => {
    return subjects.filter((subject) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        subject.subject_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subject.subject_name.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType =
        subjectTypeFilter === "ALL" || subject.subject_type === subjectTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [subjects, searchQuery, subjectTypeFilter]);

  const handleSubjectUpdate = (updatedSubject: ExamSubject) => {
    setSubjects((prev) =>
      prev.map((subject) =>
        subject.id === updatedSubject.id ? updatedSubject : subject
      )
    );
  };

  const handleEditSuccess = async () => {
    if (!examId) return;
    try {
      const updatedExam = await getExam(examId);
      setExam(updatedExam);
    } catch (error) {
      console.error("Error refreshing examination:", error);
    }
    setEditModalOpen(false);
  };

  if (loading) {
    return (
      <DashboardLayout title="Examination Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Loading..." />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-64 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !exam) {
    return (
      <DashboardLayout title="Examination Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Error" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error || "Examination not found"}
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/examinations")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Examinations
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Examination Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={`${exam.exam_type} - ${exam.year} ${exam.series}`}
        />
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header with back button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/examinations")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Examinations
            </Button>
          </div>

          {/* Exam Information Card */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Examination Information
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalOpen(true)}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Exam Type:</span>
                  <span className="text-sm font-medium">{exam.exam_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Year:</span>
                  <span className="text-sm font-medium">{exam.year}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Series:</span>
                  <span className="text-sm font-medium">{exam.series}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Number of Series:</span>
                  <span className="text-sm font-medium">{exam.number_of_series}</span>
                </div>
                {exam.description && (
                  <div className="flex items-start gap-2 md:col-span-2">
                    <span className="text-sm text-muted-foreground">Description:</span>
                    <span className="text-sm font-medium">{exam.description}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Created:</span>
                  <span className="text-sm font-medium">
                    {new Date(exam.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search and Filter Controls */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search subjects by code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Select value={subjectTypeFilter} onValueChange={(value: "ALL" | "CORE" | "ELECTIVE") => setSubjectTypeFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Subjects</SelectItem>
                <SelectItem value="CORE">Core Only</SelectItem>
                <SelectItem value="ELECTIVE">Elective Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subjects Count */}
          <div className="mb-4 text-sm text-muted-foreground">
            Showing {filteredSubjects.length} of {subjects.length} subject{subjects.length !== 1 ? "s" : ""}
          </div>

          {/* Subjects Grid */}
          {filteredSubjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ClipboardList className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">
                {searchQuery || subjectTypeFilter !== "ALL"
                  ? "No subjects match your filters"
                  : "No subjects found"}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || subjectTypeFilter !== "ALL"
                  ? "Try adjusting your search or filter criteria"
                  : "Subjects will appear here once added to this examination"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSubjects.map((subject) => (
                <ExamSubjectCard
                  key={subject.id}
                  examSubject={subject}
                  onUpdate={handleSubjectUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <EditExamModal
        exam={exam}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSuccess={handleEditSuccess}
      />
    </DashboardLayout>
  );
}
