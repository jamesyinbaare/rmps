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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
                        <div className="space-y-4">
                          {/* Core Subjects */}
                          {examReg.subjects.filter((s) => s.subject_type === "CORE").length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                                <GraduationCap className="h-4 w-4" />
                                Core Subjects
                              </div>
                              {/* Headers */}
                              <div className="grid grid-cols-2 gap-4 text-sm font-semibold mb-2 pb-2 border-b">
                                <div>Subject</div>
                                <div>Grade</div>
                              </div>
                              <Accordion>
                                {examReg.subjects
                                  .filter((s) => s.subject_type === "CORE")
                                  .map((subjectReg) => (
                                    <AccordionItem
                                      key={subjectReg.id}
                                      value={`subject-${subjectReg.id}`}
                                    >
                                      <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-4">
                                          <div className="flex items-center gap-3">
                                            <div>
                                              <div className="font-medium text-left">
                                                {subjectReg.subject_name}
                                              </div>
                                              <div className="text-xs text-muted-foreground text-left">
                                                {subjectReg.subject_code}
                                                {subjectReg.series && ` • Series ${subjectReg.series}`}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            {subjectReg.subject_score?.grade ? (
                                              <Badge variant="secondary" className="text-sm">
                                                {subjectReg.subject_score.grade}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-sm">
                                                PENDING
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <div className="space-y-4 pt-2">
                                          {/* Score Details */}
                                          {(subjectReg.obj_max_score !== null ||
                                            subjectReg.essay_max_score !== null ||
                                            subjectReg.pract_max_score !== null) && (
                                            <div className="space-y-3">
                                              {subjectReg.obj_max_score !== null && (
                                                <div className="text-sm">
                                                  <div className="text-muted-foreground mb-1">MCQ Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.obj_raw_score !== null && subjectReg.subject_score !== null
                                                      ? subjectReg.subject_score.obj_raw_score === "A" ||
                                                        subjectReg.subject_score.obj_raw_score === "AA"
                                                        ? subjectReg.subject_score.obj_raw_score
                                                        : !isNaN(parseFloat(subjectReg.subject_score.obj_raw_score))
                                                          ? parseFloat(subjectReg.subject_score.obj_raw_score).toFixed(2)
                                                          : subjectReg.subject_score.obj_raw_score
                                                      : "—"}
                                                    {subjectReg.subject_score?.obj_normalized !== null && subjectReg.subject_score !== null && (
                                                      <span className="text-xs text-muted-foreground ml-2">
                                                        (Normalized: {subjectReg.subject_score.obj_normalized.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max Score: {subjectReg.obj_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.essay_max_score !== null && (
                                                <div className="text-sm">
                                                  <div className="text-muted-foreground mb-1">Essay Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.essay_raw_score !== null && subjectReg.subject_score !== null
                                                      ? subjectReg.subject_score.essay_raw_score === "A" ||
                                                        subjectReg.subject_score.essay_raw_score === "AA"
                                                        ? subjectReg.subject_score.essay_raw_score
                                                        : !isNaN(parseFloat(subjectReg.subject_score.essay_raw_score))
                                                          ? parseFloat(subjectReg.subject_score.essay_raw_score).toFixed(2)
                                                          : subjectReg.subject_score.essay_raw_score
                                                      : "—"}
                                                    {subjectReg.subject_score?.essay_normalized !== null && subjectReg.subject_score !== null && (
                                                      <span className="text-xs text-muted-foreground ml-2">
                                                        (Normalized: {subjectReg.subject_score.essay_normalized.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max Score: {subjectReg.essay_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.pract_max_score !== null && (
                                                <div className="text-sm">
                                                  <div className="text-muted-foreground mb-1">Practical Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.pract_raw_score !== null && subjectReg.subject_score !== null
                                                      ? subjectReg.subject_score.pract_raw_score === "A" ||
                                                        subjectReg.subject_score.pract_raw_score === "AA"
                                                        ? subjectReg.subject_score.pract_raw_score
                                                        : !isNaN(parseFloat(subjectReg.subject_score.pract_raw_score))
                                                          ? parseFloat(subjectReg.subject_score.pract_raw_score).toFixed(2)
                                                          : subjectReg.subject_score.pract_raw_score
                                                      : "—"}
                                                    {subjectReg.subject_score?.pract_normalized !== null && subjectReg.subject_score !== null && (
                                                      <span className="text-xs text-muted-foreground ml-2">
                                                        (Normalized: {subjectReg.subject_score.pract_normalized.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max Score: {subjectReg.pract_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.subject_score?.total_score !== undefined && subjectReg.subject_score !== null && (
                                                <div className="text-sm pt-2 border-t">
                                                  <div className="text-muted-foreground mb-1">Total Score</div>
                                                  <div className="font-semibold text-lg">
                                                    {subjectReg.subject_score.total_score.toFixed(2)}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  ))}
                              </Accordion>
                            </div>
                          )}

                          {/* Elective Subjects */}
                          {examReg.subjects.filter((s) => s.subject_type === "ELECTIVE").length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                                <Award className="h-4 w-4" />
                                Elective Subjects
                              </div>
                              {/* Headers */}
                              <div className="grid grid-cols-2 gap-4 text-sm font-semibold mb-2 pb-2 border-b">
                                <div>Subject</div>
                                <div>Grade</div>
                              </div>
                              <Accordion>
                                {examReg.subjects
                                  .filter((s) => s.subject_type === "ELECTIVE")
                                  .map((subjectReg) => (
                                    <AccordionItem
                                      key={subjectReg.id}
                                      value={`subject-${subjectReg.id}`}
                                    >
                                      <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-4">
                                          <div className="flex items-center gap-3">
                                            <div>
                                              <div className="font-medium text-left">
                                                {subjectReg.subject_name}
                                              </div>
                                              <div className="text-xs text-muted-foreground text-left">
                                                {subjectReg.subject_code}
                                                {subjectReg.series && ` • Series ${subjectReg.series}`}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            {subjectReg.subject_score?.grade ? (
                                              <Badge variant="secondary" className="text-sm">
                                                {subjectReg.subject_score.grade}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-sm">
                                                PENDING
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <div className="space-y-4 pt-2">
                                          {/* Score Details */}
                                          {(subjectReg.obj_max_score !== null ||
                                            subjectReg.essay_max_score !== null ||
                                            subjectReg.pract_max_score !== null) && (
                                            <div className="space-y-3">
                                              {subjectReg.obj_max_score !== null && (
                                                <div className="text-sm">
                                                  <div className="text-muted-foreground mb-1">MCQ Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.obj_raw_score !== null && subjectReg.subject_score !== null
                                                      ? subjectReg.subject_score.obj_raw_score === "A" ||
                                                        subjectReg.subject_score.obj_raw_score === "AA"
                                                        ? subjectReg.subject_score.obj_raw_score
                                                        : !isNaN(parseFloat(subjectReg.subject_score.obj_raw_score))
                                                          ? parseFloat(subjectReg.subject_score.obj_raw_score).toFixed(2)
                                                          : subjectReg.subject_score.obj_raw_score
                                                      : "—"}
                                                    {subjectReg.subject_score?.obj_normalized !== null && subjectReg.subject_score !== null && (
                                                      <span className="text-xs text-muted-foreground ml-2">
                                                        (Normalized: {subjectReg.subject_score.obj_normalized.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max Score: {subjectReg.obj_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.essay_max_score !== null && (
                                                <div className="text-sm">
                                                  <div className="text-muted-foreground mb-1">Essay Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.essay_raw_score !== null && subjectReg.subject_score !== null
                                                      ? subjectReg.subject_score.essay_raw_score === "A" ||
                                                        subjectReg.subject_score.essay_raw_score === "AA"
                                                        ? subjectReg.subject_score.essay_raw_score
                                                        : !isNaN(parseFloat(subjectReg.subject_score.essay_raw_score))
                                                          ? parseFloat(subjectReg.subject_score.essay_raw_score).toFixed(2)
                                                          : subjectReg.subject_score.essay_raw_score
                                                      : "—"}
                                                    {subjectReg.subject_score?.essay_normalized !== null && subjectReg.subject_score !== null && (
                                                      <span className="text-xs text-muted-foreground ml-2">
                                                        (Normalized: {subjectReg.subject_score.essay_normalized.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max Score: {subjectReg.essay_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.pract_max_score !== null && (
                                                <div className="text-sm">
                                                  <div className="text-muted-foreground mb-1">Practical Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.pract_raw_score !== null && subjectReg.subject_score !== null
                                                      ? subjectReg.subject_score.pract_raw_score === "A" ||
                                                        subjectReg.subject_score.pract_raw_score === "AA"
                                                        ? subjectReg.subject_score.pract_raw_score
                                                        : !isNaN(parseFloat(subjectReg.subject_score.pract_raw_score))
                                                          ? parseFloat(subjectReg.subject_score.pract_raw_score).toFixed(2)
                                                          : subjectReg.subject_score.pract_raw_score
                                                      : "—"}
                                                    {subjectReg.subject_score?.pract_normalized !== null && subjectReg.subject_score !== null && (
                                                      <span className="text-xs text-muted-foreground ml-2">
                                                        (Normalized: {subjectReg.subject_score.pract_normalized.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max Score: {subjectReg.pract_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.subject_score?.total_score !== undefined && subjectReg.subject_score !== null && (
                                                <div className="text-sm pt-2 border-t">
                                                  <div className="text-muted-foreground mb-1">Total Score</div>
                                                  <div className="font-semibold text-lg">
                                                    {subjectReg.subject_score.total_score.toFixed(2)}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  ))}
                              </Accordion>
                            </div>
                          )}
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
