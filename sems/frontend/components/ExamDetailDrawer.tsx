"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Exam } from "@/types/document";
import { getExam, listExamSubjects, type ExamSubject } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Calendar, BookOpen } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ExamDetailDrawerProps {
  exam: Exam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExamDetailDrawer({
  exam,
  open,
  onOpenChange,
}: ExamDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [examData, setExamData] = useState<Exam | null>(null);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadExam = async () => {
      if (!exam || !open) {
        setExamData(null);
        setSubjects([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getExam(exam.id);
        setExamData(data);

        // Load exam subjects
        setSubjectsLoading(true);
        try {
          const subjectsData = await listExamSubjects(exam.id);
          setSubjects(subjectsData);
        } catch (err) {
          console.error("Failed to load exam subjects:", err);
        } finally {
          setSubjectsLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load examination details"
        );
        console.error("Failed to load examination:", err);
      } finally {
        setLoading(false);
      }
    };

    loadExam();
  }, [exam, open]);

  if (!exam) return null;

  const displayExam = examData || exam;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            {displayExam.exam_type}
          </SheetTitle>
          <SheetDescription>
            {displayExam.year} - {displayExam.series}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <>
              {/* Exam Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Examination Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Name:</span>
                    <span className="text-sm font-medium">{displayExam.exam_type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Year:</span>
                    <span className="text-sm font-medium">{displayExam.year}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Series:</span>
                    <span className="text-sm font-medium">{displayExam.series}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Number of Series:</span>
                    <span className="text-sm font-medium">{displayExam.number_of_series}</span>
                  </div>
                  {displayExam.description && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Description:</span>
                      <span className="text-sm font-medium">{displayExam.description}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Created:</span>
                    <span className="text-sm font-medium">
                      {new Date(displayExam.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Subjects */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Subjects ({subjects.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {subjectsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : subjects.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No subjects associated with this examination.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subjects.map((subject) => (
                          <TableRow key={subject.id}>
                            <TableCell className="font-mono">
                              {subject.subject_code}
                            </TableCell>
                            <TableCell>{subject.subject_name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
