"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Candidate, ExamRegistration, SubjectRegistration, CandidatePhoto, School, Programme } from "@/types/document";
import {
  listCandidateExamRegistrations,
  listExamRegistrationSubjects,
  getActiveCandidatePhoto,
  getPhotoFile,
  getSchoolById,
  getProgramme,
} from "@/lib/api";
import { CandidatePhotoUpload } from "@/components/CandidatePhotoUpload";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Image as ImageIcon,
  User,
  Loader2,
  Edit,
  Upload,
  Download,
  Copy,
  X,
  ZoomIn,
  Building2,
  GraduationCap,
  Clock,
  AlertCircle,
  Keyboard,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

interface CandidateDetailDrawerProps {
  candidate: Candidate | null;
  candidates: Candidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCandidateChange?: (candidate: Candidate) => void;
}

// Helper function to calculate age
function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Helper function to get grade color
function getGradeColor(grade: string | null | undefined): string {
  if (!grade) return "bg-muted";
  const upperGrade = grade.toUpperCase();
  if (["A1", "A2", "A3", "B1", "B2", "B3"].includes(upperGrade)) return "bg-green-500";
  if (["C4", "C5", "C6"].includes(upperGrade)) return "bg-yellow-500";
  if (["D7", "E8", "F9"].includes(upperGrade)) return "bg-red-500";
  return "bg-muted";
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
  const [activePhoto, setActivePhoto] = useState<CandidatePhoto | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);
  const [deletePhotoId, setDeletePhotoId] = useState<number | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // State for accordion control
  const [accordionStates, setAccordionStates] = useState<Record<string, Set<string>>>({});

  // Find current candidate index
  const currentIndex = candidate ? candidates.findIndex((c) => c.id === candidate.id) : -1;
  const canNavigatePrevious = currentIndex > 0;
  const canNavigateNext = currentIndex >= 0 && currentIndex < candidates.length - 1;
  const positionText = candidate && currentIndex >= 0
    ? `${currentIndex + 1} of ${candidates.length}`
    : "";

  // Load school and programme data
  useEffect(() => {
    const loadSchoolAndProgramme = async () => {
      if (!candidate || !open) {
        setSchool(null);
        setProgramme(null);
        return;
      }

      setLoadingSchool(true);
      try {
        const [schoolData, programmeData] = await Promise.all([
          candidate.school_id ? getSchoolById(candidate.school_id).catch(() => null) : Promise.resolve(null),
          candidate.programme_id ? getProgramme(candidate.programme_id).catch(() => null) : Promise.resolve(null),
        ]);
        setSchool(schoolData);
        setProgramme(programmeData);
      } catch (err) {
        console.error("Failed to load school/programme:", err);
      } finally {
        setLoadingSchool(false);
      }
    };

    loadSchoolAndProgramme();
  }, [candidate, open]);

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
      if (event.key === "ArrowLeft" && canNavigatePrevious) {
        event.preventDefault();
        handlePrevious();
      } else if (event.key === "ArrowRight" && canNavigateNext) {
        event.preventDefault();
        handleNext();
      } else if (event.key === "Escape" && !lightboxOpen) {
        onOpenChange(false);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setShowKeyboardShortcuts(!showKeyboardShortcuts);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentIndex, candidates, onCandidateChange, canNavigatePrevious, canNavigateNext, lightboxOpen, showKeyboardShortcuts]);

  // Load exam data
  useEffect(() => {
    const loadExamData = async () => {
      if (!candidate || !open) {
        setExamRegistrations([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const examRegs = await listCandidateExamRegistrations(candidate.id);
        const examRegsWithSubjects = await Promise.all(
          examRegs.map(async (examReg) => {
            try {
              const subjects = await listExamRegistrationSubjects(
                candidate.id,
                examReg.exam_id
              );
              return { ...examReg, subjects };
            } catch (err) {
              console.error(`Failed to load subjects for exam ${examReg.exam_id}:`, err);
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

  // Load photos
  useEffect(() => {
    const loadPhotos = async () => {
      if (!candidate || !open) {
        setActivePhoto(null);
        setPhotoUrl(null);
        return;
      }

      setLoadingPhotos(true);
      try {
        const active = await getActiveCandidatePhoto(candidate.id);
        setActivePhoto(active);

        if (active) {
          try {
            const url = await getPhotoFile(candidate.id, active.id);
            if (url) {
              setPhotoUrl(url);
            } else {
              // File doesn't exist in storage, clear the photo URL
              setPhotoUrl(null);
            }
          } catch (err) {
            console.error("Failed to load photo:", err);
            setPhotoUrl(null);
          }
        } else {
          setPhotoUrl(null);
        }
      } catch (err) {
        console.error("Failed to load photo:", err);
        setPhotoUrl(null);
      } finally {
        setLoadingPhotos(false);
      }
    };

    loadPhotos();
  }, [candidate, open]);

  const handlePhotoUploadSuccess = async () => {
    if (!candidate) return;
    try {
      const active = await getActiveCandidatePhoto(candidate.id);
      setActivePhoto(active);

      if (active) {
        const url = await getPhotoFile(candidate.id, active.id);
        if (url) {
          setPhotoUrl(url);
        } else {
          setPhotoUrl(null);
        }
      } else {
        setPhotoUrl(null);
      }
      toast.success("Photo uploaded successfully");
      setUploadDialogOpen(false);
    } catch (err) {
      toast.error("Failed to refresh photo");
    }
  };


  const openLightbox = async (photo: CandidatePhoto) => {
    try {
      // If this is the active photo and we already have the URL, use it
      if (activePhoto && activePhoto.id === photo.id && photoUrl) {
        setLightboxPhotoUrl(photoUrl);
        setLightboxOpen(true);
        return;
      }
      // Otherwise, fetch the photo
      const url = await getPhotoFile(candidate!.id, photo.id);
      if (url) {
        setLightboxPhotoUrl(url);
        setLightboxOpen(true);
      } else {
        toast.error("Photo file not found");
      }
    } catch (err) {
      console.error("Failed to open lightbox:", err);
      toast.error("Failed to load photo");
    }
  };

  const copyIndexNumber = () => {
    if (candidate?.index_number) {
      navigator.clipboard.writeText(candidate.index_number);
      toast.success("Index number copied to clipboard");
    }
  };

  // Calculate performance summary
  const performanceSummary = useMemo(() => {
    if (!examRegistrations.length) return null;

    let totalSubjects = 0;
    let completedSubjects = 0;
    let totalScore = 0;
    let scoreCount = 0;
    const gradeCounts: Record<string, number> = {};

    examRegistrations.forEach((examReg) => {
      if (examReg.subjects) {
        examReg.subjects.forEach((subject) => {
          totalSubjects++;
          if (subject.subject_score?.total_score !== undefined && subject.subject_score.total_score !== null && subject.subject_score.total_score !== -1) {
            completedSubjects++;
            totalScore += subject.subject_score.total_score;
            scoreCount++;
            const grade = subject.subject_score.grade;
            if (grade) {
              gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
            }
          }
        });
      }
    });

    const averageScore = scoreCount > 0 ? totalScore / scoreCount : 0;
    const completionRate = totalSubjects > 0 ? (completedSubjects / totalSubjects) * 100 : 0;

    return {
      totalSubjects,
      completedSubjects,
      averageScore,
      completionRate,
      gradeCounts,
    };
  }, [examRegistrations]);

  if (!candidate) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[95vw] min-w-6xl max-h-[95vh] min-h-[90vh] flex flex-col p-0 overflow-hidden">
          {/* Enhanced Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-background to-muted/20 sticky top-0 z-10 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {activePhoto && photoUrl ? (
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary flex-shrink-0">
                    <img
                      src={photoUrl}
                      alt={candidate.name}
                      className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => openLightbox(activePhoto)}
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-2xl font-bold truncate">{candidate.name}</DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-2">
                      Index: <span className="font-mono">{candidate.index_number}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={copyIndexNumber}
                        title="Copy index number"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </span>
                    {programme && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <GraduationCap className="h-3 w-3" />
                        {programme.name}
                      </Badge>
                    )}
                    {school && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {school.name}
                      </Badge>
                    )}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                  title="Keyboard shortcuts"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Keyboard Shortcuts Info */}
          {showKeyboardShortcuts && (
            <div className="px-6 py-3 bg-muted/50 border-b">
              <div className="flex items-start gap-2 text-sm">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium mb-1">Keyboard Shortcuts</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>← → Navigate candidates</div>
                    <div>Esc Close modal</div>
                    <div>Ctrl+K Toggle shortcuts</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowKeyboardShortcuts(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <div className="space-y-6 py-4">
              {/* Photo and Candidate Information - Side by Side */}
              <div className="flex gap-6 items-stretch">
                {/* Enhanced Candidate Information Card */}
                <Card className="flex-1 flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Candidate Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Date of Birth
                        </div>
                        <div className="text-sm font-medium">
                          {candidate.date_of_birth ? (
                            <>
                              {new Date(candidate.date_of_birth).toLocaleDateString()}
                              {candidate.date_of_birth && (
                                <span className="text-muted-foreground ml-2">
                                  (Age: {calculateAge(candidate.date_of_birth)})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Gender
                        </div>
                        <div className="text-sm font-medium">
                          {candidate.gender || <span className="text-muted-foreground">—</span>}
                        </div>
                      </div>
                      {school && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            School
                          </div>
                          <div className="text-sm font-medium">{school.name}</div>
                        </div>
                      )}
                      {programme && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" />
                            Programme
                          </div>
                          <div className="text-sm font-medium">{programme.name}</div>
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Registered
                        </div>
                        <div className="text-sm font-medium">
                          {new Date(candidate.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Photo Section - Right Corner */}
                <Card className="w-fit shrink-0 flex flex-col">
                  <CardHeader className="pb-3">
                  </CardHeader>
                  <CardContent className="pt-0 flex-1 flex flex-col items-center justify-center gap-3">
                    {loadingPhotos ? (
                      <div className="flex justify-center items-center">
                        <Skeleton className="h-48 w-48 rounded-lg" />
                      </div>
                    ) : activePhoto && photoUrl ? (
                      <>
                        <div
                          className="relative w-48 h-48 border-2 border-primary rounded-lg overflow-hidden bg-muted group cursor-pointer hover:shadow-lg transition-shadow mx-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLightbox(activePhoto).catch((err) => {
                              console.error("Failed to open lightbox:", err);
                              toast.error("Failed to load photo");
                            });
                          }}
                        >
                          <img
                            src={photoUrl}
                            alt={candidate.name}
                            className="w-full h-full object-cover pointer-events-none"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-primary text-xs">Active</Badge>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadDialogOpen(true);
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Change Photo
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col items-center justify-center text-muted-foreground w-48 mx-auto">
                          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-12 w-12" />
                          </div>
                          <p className="text-xs mt-2 text-center">No photo available</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadDialogOpen(true);
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Photo
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Performance Summary Card */}
              {performanceSummary && performanceSummary.totalSubjects > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Performance Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Total Subjects</div>
                        <div className="text-2xl font-bold">{performanceSummary.totalSubjects}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Completed</div>
                        <div className="text-2xl font-bold">{performanceSummary.completedSubjects}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {performanceSummary.completionRate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Average Score</div>
                        <div className="text-2xl font-bold">
                          {performanceSummary.averageScore > 0 ? performanceSummary.averageScore.toFixed(2) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Top Grade</div>
                        <div className="text-2xl font-bold">
                          {Object.keys(performanceSummary.gradeCounts).length > 0
                            ? Object.keys(performanceSummary.gradeCounts).sort()[0]
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                          <Skeleton className="h-4 w-32 mt-2" />
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : error ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <div className="text-sm">{error}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          if (candidate) {
                            setError(null);
                            // Trigger reload
                            const loadExamData = async () => {
                              setLoading(true);
                              try {
                                const examRegs = await listCandidateExamRegistrations(candidate.id);
                                const examRegsWithSubjects = await Promise.all(
                                  examRegs.map(async (examReg) => {
                                    try {
                                      const subjects = await listExamRegistrationSubjects(
                                        candidate.id,
                                        examReg.exam_id
                                      );
                                      return { ...examReg, subjects };
                                    } catch (err) {
                                      return { ...examReg, subjects: [] };
                                    }
                                  })
                                );
                                setExamRegistrations(examRegsWithSubjects);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed to load examination records");
                              } finally {
                                setLoading(false);
                              }
                            };
                            loadExamData();
                          }
                        }}
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                ) : examRegistrations.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center text-muted-foreground text-sm py-8">
                        <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No examination records found for this candidate.</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {examRegistrations.map((examReg) => (
                      <Card key={examReg.id} className="transition-all hover:shadow-md">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{examReg.exam_name}</CardTitle>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary">
                                  Year {examReg.exam_year}
                                </Badge>
                                <Badge variant="outline">
                                  Series {examReg.exam_series}
                                </Badge>
                                {examReg.subjects && (
                                  <Badge variant="outline" className="text-xs">
                                    {examReg.subjects.length} {examReg.subjects.length === 1 ? "subject" : "subjects"}
                                  </Badge>
                                )}
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
                              const coreSubjects = examReg.subjects
                                .filter((s) => s.subject_type === "CORE")
                                .sort((a, b) => (a.subject_name || "").localeCompare(b.subject_name || ""));
                              const electiveSubjects = examReg.subjects
                                .filter((s) => s.subject_type === "ELECTIVE")
                                .sort((a, b) => (a.subject_name || "").localeCompare(b.subject_name || ""));
                              const allSubjects = [...coreSubjects, ...electiveSubjects];

                              const accordionKey = examReg.id.toString();
                              const currentValueSet = accordionStates[accordionKey] || new Set<string>();
                              const allSubjectIds = allSubjects.map(s => `subject-${s.id}`);
                              const isAllOpen = allSubjects.length > 0 && allSubjectIds.every(id => currentValueSet.has(id));

                              return (
                                <div>
                                  <div className="flex items-center justify-end mb-3">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setAccordionStates(prev => ({
                                          ...prev,
                                          [accordionKey]: isAllOpen ? new Set<string>() : new Set(allSubjectIds)
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
                                  <div className="flex items-center justify-between text-sm font-semibold mb-2 pb-2 border-b">
                                    <div>Subject</div>
                                    <div>Grade</div>
                                  </div>
                                  <Accordion
                                    type="multiple"
                                    value={currentValueSet}
                                    onValueChange={(value) => {
                                      const newSet = value instanceof Set ? value : new Set<string>();
                                      setAccordionStates(prev => ({
                                        ...prev,
                                        [accordionKey]: newSet
                                      }));
                                    }}
                                  >
                                    {allSubjects.map((subjectReg) => {
                                      const grade = subjectReg.subject_score?.grade;
                                      const totalScore = subjectReg.subject_score?.total_score;
                                      const isAbsent = totalScore === -1;
                                      const isPending = !totalScore && totalScore !== 0;

                                      return (
                                        <AccordionItem
                                          key={subjectReg.id}
                                          value={`subject-${subjectReg.id}`}
                                        >
                                          <AccordionTrigger className="hover:no-underline py-3">
                                            <div className="flex items-center justify-between w-full pr-4">
                                              <div className="flex items-center gap-3 text-left">
                                                <div>
                                                  <div className="font-medium">
                                                    {subjectReg.subject_name}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">
                                                    {subjectReg.subject_code}
                                                    {subjectReg.series && ` • Series ${subjectReg.series}`}
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                {isAbsent ? (
                                                  <Badge variant="outline" className="text-sm">
                                                    ABSENT
                                                  </Badge>
                                                ) : isPending ? (
                                                  <Badge variant="outline" className="text-sm">
                                                    PENDING
                                                  </Badge>
                                                ) : grade ? (
                                                  <Badge
                                                    className={cn("text-sm", getGradeColor(grade))}
                                                  >
                                                    {grade}
                                                  </Badge>
                                                ) : (
                                                  <Badge variant="outline" className="text-sm">
                                                    —
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                          </AccordionTrigger>
                                          <AccordionContent>
                                            <div className="pt-3 pb-2">
                                              {(subjectReg.obj_max_score !== null ||
                                                subjectReg.essay_max_score !== null ||
                                                subjectReg.pract_max_score !== null) && (
                                                  <div className="space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                      {subjectReg.obj_max_score !== null && (
                                                        <div className="space-y-2">
                                                          <div className="text-xs text-muted-foreground">MCQ Score</div>
                                                          {subjectReg.subject_score?.obj_normalized !== null && subjectReg.subject_score?.obj_normalized !== undefined ? (
                                                            <>
                                                              <div className="w-full bg-muted rounded-full h-2">
                                                                <div
                                                                  className="bg-primary h-2 rounded-full transition-all"
                                                                  style={{
                                                                    width: `${Math.min(100, (subjectReg.subject_score!.obj_normalized / subjectReg.obj_max_score) * 100)}%`
                                                                  }}
                                                                />
                                                              </div>
                                                              <div className="flex items-center justify-between text-sm">
                                                                <span className="font-medium">
                                                                  {subjectReg.subject_score!.obj_normalized.toFixed(2)}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                  / {subjectReg.obj_max_score}
                                                                </span>
                                                              </div>
                                                            </>
                                                          ) : (
                                                            <div className="text-sm text-muted-foreground">PENDING</div>
                                                          )}
                                                        </div>
                                                      )}
                                                      {subjectReg.essay_max_score !== null && (
                                                        <div className="space-y-2">
                                                          <div className="text-xs text-muted-foreground">Essay Score</div>
                                                          {subjectReg.subject_score?.essay_normalized !== null && subjectReg.subject_score?.essay_normalized !== undefined ? (
                                                            <>
                                                              <div className="w-full bg-muted rounded-full h-2">
                                                                <div
                                                                  className="bg-primary h-2 rounded-full transition-all"
                                                                  style={{
                                                                    width: `${Math.min(100, (subjectReg.subject_score!.essay_normalized / subjectReg.essay_max_score) * 100)}%`
                                                                  }}
                                                                />
                                                              </div>
                                                              <div className="flex items-center justify-between text-sm">
                                                                <span className="font-medium">
                                                                  {subjectReg.subject_score!.essay_normalized.toFixed(2)}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                  / {subjectReg.essay_max_score}
                                                                </span>
                                                              </div>
                                                            </>
                                                          ) : (
                                                            <div className="text-sm text-muted-foreground">PENDING</div>
                                                          )}
                                                        </div>
                                                      )}
                                                      {subjectReg.pract_max_score !== null && (
                                                        <div className="space-y-2">
                                                          <div className="text-xs text-muted-foreground">Practical Score</div>
                                                          {subjectReg.subject_score?.pract_normalized !== null && subjectReg.subject_score?.pract_normalized !== undefined ? (
                                                            <>
                                                              <div className="w-full bg-muted rounded-full h-2">
                                                                <div
                                                                  className="bg-primary h-2 rounded-full transition-all"
                                                                  style={{
                                                                    width: `${Math.min(100, (subjectReg.subject_score!.pract_normalized / subjectReg.pract_max_score) * 100)}%`
                                                                  }}
                                                                />
                                                              </div>
                                                              <div className="flex items-center justify-between text-sm">
                                                                <span className="font-medium">
                                                                  {subjectReg.subject_score!.pract_normalized.toFixed(2)}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                  / {subjectReg.pract_max_score}
                                                                </span>
                                                              </div>
                                                            </>
                                                          ) : (
                                                            <div className="text-sm text-muted-foreground">PENDING</div>
                                                          )}
                                                        </div>
                                                      )}
                                                    </div>
                                                    {totalScore !== undefined && totalScore !== null && (
                                                      <div className="pt-2 border-t">
                                                        <div className="flex items-center justify-between">
                                                          <div className="text-sm text-muted-foreground">Total Score</div>
                                                          <div className="text-lg font-bold">
                                                            {isAbsent ? "ABSENT" : totalScore.toFixed(2)}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                            </div>
                                          </AccordionContent>
                                        </AccordionItem>
                                      );
                                    })}
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

          {/* Enhanced Footer with Navigation */}
          {candidates.length > 1 && (
            <DialogFooter className="justify-between sm:justify-between px-6 pb-6 pt-4 border-t bg-muted/30">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Keyboard className="h-3 w-3" />
                Use ← → to navigate
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevious}
                  disabled={!canNavigatePrevious}
                  className="h-9 w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[80px] text-center font-medium">
                  {positionText}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNext}
                  disabled={!canNavigateNext}
                  className="h-9 w-9"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl w-[95vw] p-0">
          {lightboxPhotoUrl && (
            <div className="relative">
              <img
                src={lightboxPhotoUrl}
                alt={candidate.name}
                className="w-full h-auto max-h-[90vh] object-contain"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                onClick={() => setLightboxOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Upload Dialog */}
      {candidate && (
        <CandidatePhotoUpload
          candidateId={candidate.id}
          candidateName={candidate.name}
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onUploadSuccess={handlePhotoUploadSuccess}
        />
      )}
    </>
  );
}
