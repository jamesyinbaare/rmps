"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Candidate, ExamRegistration, SubjectRegistration } from "@/types/document";
import {
  listCandidateExamRegistrations,
  listExamRegistrationSubjects,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, GraduationCap, Award, FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CandidateDetailDrawerProps {
  candidate: Candidate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidateDetailDrawer({
  candidate,
  open,
  onOpenChange,
}: CandidateDetailDrawerProps) {
  const [examRegistrations, setExamRegistrations] = useState<
    (ExamRegistration & { subjects?: SubjectRegistration[] })[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadExamData = async () => {
      if (!candidate || !open) {
        setExamRegistrations([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Load exam registrations
        const examRegs = await listCandidateExamRegistrations(candidate.id);

        // Load subjects for each exam registration
        const examRegsWithSubjects = await Promise.all(
          examRegs.map(async (examReg) => {
            try {
              const subjects = await listExamRegistrationSubjects(
                candidate.id,
                examReg.exam_id
              );
              return { ...examReg, subjects };
            } catch (err) {
              console.error(
                `Failed to load subjects for exam ${examReg.exam_id}:`,
                err
              );
              return { ...examReg, subjects: [] };
            }
          })
        );

        setExamRegistrations(examRegsWithSubjects);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load examination records"
        );
        console.error("Failed to load exam data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadExamData();
  }, [candidate, open]);

  if (!candidate) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-6xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{candidate.name}</SheetTitle>
          <SheetDescription>
            Index Number: {candidate.index_number}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Candidate Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Candidate Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Date of Birth:</span>
                <span className="text-sm font-medium">
                  {candidate.date_of_birth
                    ? new Date(candidate.date_of_birth).toLocaleDateString()
                    : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Gender:</span>
                <span className="text-sm font-medium">
                  {candidate.gender || "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Examination Records */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Examination Records
            </h3>

            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-32 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-destructive text-sm">{error}</div>
                </CardContent>
              </Card>
            ) : examRegistrations.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground text-sm">
                    No examination records found for this candidate.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {examRegistrations.map((examReg) => (
                  <Card key={examReg.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {examReg.exam_name}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary">
                              Year {examReg.exam_year}
                            </Badge>
                            <Badge variant="outline">
                              Series {examReg.exam_series}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(examReg.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {examReg.subjects && examReg.subjects.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            Subject Scores
                          </div>
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[150px]">
                                    Subject
                                  </TableHead>
                                  <TableHead className="text-right">
                                    MCQ
                                  </TableHead>
                                  <TableHead className="text-right">
                                    Essay
                                  </TableHead>
                                  <TableHead className="text-right">
                                    Practical
                                  </TableHead>
                                  <TableHead className="text-right font-semibold">
                                    Total
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {examReg.subjects.map((subjectReg) => (
                                  <TableRow key={subjectReg.id}>
                                    <TableCell>
                                      <div>
                                        <div className="font-medium">
                                          {subjectReg.subject_name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {subjectReg.subject_code}
                                          {subjectReg.series && ` • Series ${subjectReg.series}`}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {subjectReg.subject_score
                                        ? subjectReg.subject_score.obj_raw_score !== null
                                          ? subjectReg.subject_score.obj_raw_score.toFixed(2)
                                          : "—"
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {subjectReg.subject_score
                                        ? subjectReg.subject_score.essay_raw_score.toFixed(2)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {subjectReg.subject_score
                                        ? subjectReg.subject_score.pract_raw_score !== null
                                          ? subjectReg.subject_score.pract_raw_score.toFixed(2)
                                          : "—"
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {subjectReg.subject_score
                                        ? subjectReg.subject_score.total_score.toFixed(2)
                                        : "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          No subjects registered for this exam.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
