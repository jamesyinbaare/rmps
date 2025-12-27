"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Candidate, ExamRegistration, SubjectRegistration } from "@/types/document";
import {
  listCandidateExamRegistrations,
  listExamRegistrationSubjects,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface CandidateDetailDrawerProps {
  candidate: Candidate | null;
  candidates: Candidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCandidateChange?: (candidate: Candidate) => void;
}

export function CandidateDetailDrawer({
  candidate,
  candidates,
  open,
  onOpenChange,
  onCandidateChange,
}: CandidateDetailDrawerProps) {
  const [examRegistrations, setExamRegistrations] = useState<
    (ExamRegistration & { subjects?: SubjectRegistration[] })[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for accordion control (one per exam registration, all subjects combined)
  const [accordionStates, setAccordionStates] = useState<Record<string, Set<string>>>({});

  // Find current candidate index
  const currentIndex = candidate ? candidates.findIndex((c) => c.id === candidate.id) : -1;
  const canNavigatePrevious = currentIndex > 0;
  const canNavigateNext = currentIndex >= 0 && currentIndex < candidates.length - 1;
  const positionText = candidate && currentIndex >= 0
    ? `${currentIndex + 1} of ${candidates.length}`
    : "";

  // Navigation handlers
  const handlePrevious = () => {
    if (canNavigatePrevious && onCandidateChange && currentIndex > 0) {
      onCandidateChange(candidates[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (canNavigateNext && onCandidateChange && currentIndex < candidates.length - 1) {
      onCandidateChange(candidates[currentIndex + 1]);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open || !onCandidateChange) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        onCandidateChange(candidates[currentIndex - 1]);
      } else if (event.key === "ArrowRight" && currentIndex >= 0 && currentIndex < candidates.length - 1) {
        event.preventDefault();
        onCandidateChange(candidates[currentIndex + 1]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, candidates, onCandidateChange]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl min-w-[80vh] min-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{candidate.name}</DialogTitle>
          <DialogDescription>
            Index Number: {candidate.index_number}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-6">
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
                        (() => {
                        // Combine and sort subjects: core first, then elective, both sorted by name
                        const coreSubjects = examReg.subjects
                          .filter((s) => s.subject_type === "CORE")
                          .sort((a, b) => (a.subject_name || "").localeCompare(b.subject_name || ""));
                        const electiveSubjects = examReg.subjects
                          .filter((s) => s.subject_type === "ELECTIVE")
                          .sort((a, b) => (a.subject_name || "").localeCompare(b.subject_name || ""));
                        const allSubjects = [...coreSubjects, ...electiveSubjects];

                        const accordionKey = examReg.id;
                        const currentValue = accordionStates[accordionKey] || new Set<string>();
                        const allSubjectIds = new Set(allSubjects.map(s => `subject-${s.id}`));
                        const isAllOpen = allSubjects.length > 0 && allSubjects.every(s => currentValue.has(`subject-${s.id}`));

                        return (
                          <div>
                            <div className="flex items-center justify-end mb-2">
                              {/* <div className="text-sm font-semibold">Subjects</div> */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setAccordionStates(prev => ({
                                    ...prev,
                                    [accordionKey]: isAllOpen ? new Set<string>() : allSubjectIds
                                  }));
                                }}
                              >
                                {isAllOpen ? (
                                  <>
                                    <ChevronsUp className="h-3 w-3 mr-1" />
                                    Collapse All
                                  </>
                                ) : (
                                  <>
                                    <ChevronsDown className="h-3 w-3 mr-1" />
                                    Expand All
                                  </>
                                )}
                              </Button>
                            </div>
                            {/* Headers */}
                            <div className="flex items-center justify-between text-sm font-semibold mb-2 pb-1  pr-4 ">
                              <div>Subject</div>
                              <div>Grade</div>
                            </div>
                            <Accordion
                              type="multiple"
                              value={currentValue}
                              onValueChange={(value) => {
                                const newSet = value instanceof Set ? value : new Set<string>();
                                setAccordionStates(prev => {
                                  const prevSet = prev[accordionKey] || new Set<string>();
                                  // Detect manual click: if adding one item when others are open, close others
                                  // If newSet has multiple items, it's from "Expand All" - allow it
                                  let finalSet = newSet;
                                  if (newSet.size === 1 && prevSet.size > 1) {
                                    // User clicked an item to switch from multiple to single - keep single
                                    finalSet = newSet;
                                  } else if (newSet.size > prevSet.size && prevSet.size > 0 && newSet.size === prevSet.size + 1) {
                                    // User clicked to add one more item when others are open - close others (single mode behavior)
                                    const addedItem = Array.from(newSet).find(item => !prevSet.has(item));
                                    finalSet = addedItem ? new Set([addedItem]) : newSet;
                                  }

                                  return {
                                    ...prev,
                                    [accordionKey]: finalSet
                                  };
                                });
                              }}
                            >
                              {allSubjects.map((subjectReg) => (
                                    <AccordionItem
                                      key={subjectReg.id}
                                      value={`subject-${subjectReg.id}`}
                                    >
                                      <AccordionTrigger className="hover:no-underline py-2">
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
                                            {subjectReg.subject_score?.total_score !== undefined && subjectReg.subject_score !== null && subjectReg.subject_score.total_score === -1 ? (
                                              <Badge variant="outline" className="text-sm">
                                                ABSENT
                                              </Badge>
                                            ) : subjectReg.subject_score?.grade ? (
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
                                        <div className="pt-2">
                                          {/* Score Details */}
                                          {(subjectReg.obj_max_score !== null ||
                                            subjectReg.essay_max_score !== null ||
                                            subjectReg.pract_max_score !== null) && (
                                            <div className="flex flex-wrap gap-4">
                                              {subjectReg.obj_max_score !== null && (
                                                <div className="text-sm flex-1 min-w-[100px]">
                                                  <div className="text-muted-foreground mb-0.5 text-xs">MCQ Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.obj_raw_score !== null && subjectReg.subject_score !== null
                                                      ? (subjectReg.subject_score.obj_raw_score === "A" || subjectReg.subject_score.obj_raw_score === "AA")
                                                        ? "A"
                                                        : (subjectReg.subject_score.obj_normalized !== null
                                                          ? subjectReg.subject_score.obj_normalized.toFixed(2)
                                                          : "—")
                                                      : "PENDING"}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max: {subjectReg.obj_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.essay_max_score !== null && (
                                                <div className="text-sm flex-1 min-w-[100px]">
                                                  <div className="text-muted-foreground mb-0.5 text-xs">Essay Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.essay_raw_score !== null && subjectReg.subject_score !== null
                                                      ? (subjectReg.subject_score.essay_raw_score === "A" || subjectReg.subject_score.essay_raw_score === "AA")
                                                        ? "A"
                                                        : (subjectReg.subject_score.essay_normalized !== null
                                                          ? subjectReg.subject_score.essay_normalized.toFixed(2)
                                                          : "—")
                                                      : "PENDING"}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max: {subjectReg.essay_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.pract_max_score !== null && (
                                                <div className="text-sm flex-1 min-w-[100px]">
                                                  <div className="text-muted-foreground mb-0.5 text-xs">Practical Score</div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_score?.pract_raw_score !== null && subjectReg.subject_score !== null
                                                      ? (subjectReg.subject_score.pract_raw_score === "A" || subjectReg.subject_score.pract_raw_score === "AA")
                                                        ? "A"
                                                        : (subjectReg.subject_score.pract_normalized !== null
                                                          ? subjectReg.subject_score.pract_normalized.toFixed(2)
                                                          : "—")
                                                      : "PENDING"}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    Max: {subjectReg.pract_max_score}
                                                  </div>
                                                </div>
                                              )}
                                              {subjectReg.subject_score?.total_score !== undefined && subjectReg.subject_score !== null && (
                                                <div className="text-sm flex-1 min-w-[100px] border-l pl-3">
                                                  <div className="text-muted-foreground mb-0.5 text-xs">Total Score</div>
                                                  <div className="font-semibold text-base">
                                                    {subjectReg.subject_score.total_score === -1
                                                      ? "ABSENT"
                                                      : subjectReg.subject_score.total_score.toFixed(2)}
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
                            );
                        })()
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
        </div>

        {candidates.length > 1 && (
          <DialogFooter className="justify-center sm:justify-center px-6 pb-6 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                disabled={!canNavigatePrevious}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                {positionText}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={!canNavigateNext}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
