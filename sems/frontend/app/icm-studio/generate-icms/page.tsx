"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import {
  getAllExams,
  getSchoolsForExamWithCandidates,
  getSubjectsForExamAndSchoolByCandidates,
  listExamSubjects,
  createPdfGenerationJob,
  getPdfGenerationJob,
  downloadJobSchoolPdf,
  type PdfGenerationJob,
} from "@/lib/api";
import type { Exam, School, Subject } from "@/types/document";
import { FileText, Download, Loader2, AlertCircle, CheckCircle2, History, Eye, X, CheckCircle, Circle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Step = "examination" | "school" | "subjects" | "test-types" | "generate";

export default function GenerateICMsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | "all" | "">("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [subjectSearch, setSubjectSearch] = useState<string>("");
  const [testTypes, setTestTypes] = useState<number[]>([1, 2]);
  const [template, setTemplate] = useState<"new" | "old">("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<PdfGenerationJob | null>(null);
  const [polling, setPolling] = useState(false);

  // Determine current step
  const currentStep = useMemo<Step>(() => {
    if (!examId) return "examination";
    if (selectedSchoolId === "") return "school";
    if (selectedSubjectIds.length === 0) return "subjects";
    if (testTypes.length === 0) return "test-types";
    return "generate";
  }, [examId, selectedSchoolId, selectedSubjectIds.length, testTypes.length]);

  // Load exams on mount
  useEffect(() => {
    const loadExams = async () => {
      try {
        const allExams = await getAllExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    };
    loadExams();
  }, []);

  // Check for active job in localStorage on mount
  useEffect(() => {
    const activeJobId = localStorage.getItem("activePdfGenerationJobId");
    if (activeJobId) {
      const jobId = parseInt(activeJobId, 10);
      if (!isNaN(jobId)) {
        loadJobStatus(jobId);
      }
    }
  }, []);

  // Poll job status if there's an active job
  useEffect(() => {
    if (!currentJob || !polling) return;

    const statusesToStopPolling = ["completed", "failed", "cancelled"];
    if (statusesToStopPolling.includes(currentJob.status)) {
      setPolling(false);
      if (currentJob.status === "completed") {
        localStorage.removeItem("activePdfGenerationJobId");
        toast.success("PDF generation completed successfully!");
      }
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updatedJob = await getPdfGenerationJob(currentJob.id);
        setCurrentJob(updatedJob);
      } catch (err) {
        console.error("Failed to poll job status:", err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [currentJob, polling]);

  const loadJobStatus = async (jobId: number) => {
    try {
      const job = await getPdfGenerationJob(jobId);
      setCurrentJob(job);
      const statusesToPoll = ["pending", "processing"];
      if (statusesToPoll.includes(job.status)) {
        setPolling(true);
      }
    } catch (err) {
      console.error("Failed to load job status:", err);
      localStorage.removeItem("activePdfGenerationJobId");
    }
  };

  // Load schools when exam is selected
  useEffect(() => {
    const loadSchools = async () => {
      if (!examId) {
        setSchools([]);
        return;
      }

      try {
        setLoading(true);
        const schoolsList = await getSchoolsForExamWithCandidates(examId);
        setSchools(schoolsList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schools");
        console.error("Failed to load schools:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSchools();
  }, [examId]);

  // Load subjects when exam is selected
  useEffect(() => {
    const loadSubjects = async () => {
      if (!examId) {
        setSubjects([]);
        setSelectedSubjectIds([]);
        return;
      }

      const exam = exams.find((e) => e.id === examId);

      try {
        setLoading(true);
        if (selectedSchoolId && selectedSchoolId !== "all" && selectedSchoolId !== "") {
          const schoolSubjects = await getSubjectsForExamAndSchoolByCandidates(examId, selectedSchoolId as number);
          setSubjects(schoolSubjects);
        } else {
          const examSubjects = await listExamSubjects(examId);
          setSubjects(
            examSubjects.map((es) => ({
              id: es.subject_id,
              code: es.subject_code,
              name: es.subject_name,
              original_code: es.subject_code,
              subject_type: es.subject_type,
              exam_type: exam?.exam_type ?? null,
            }))
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load subjects");
        console.error("Failed to load subjects:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSubjects();
  }, [examId, selectedSchoolId, exams]);

  const handleTestTypeChange = (testType: number, checked: boolean) => {
    if (checked) {
      setTestTypes((prev) => [...prev, testType].sort());
    } else {
      setTestTypes((prev) => prev.filter((t) => t !== testType));
    }
  };

  const handleClearForm = () => {
    setExamId(null);
    setSelectedSchoolId("");
    setSelectedSubjectIds([]);
    setTestTypes([1, 2]);
    setTemplate("new");
    setSubjectTypeFilter("ALL");
    setSubjectSearch("");
    setError(null);
  };

  const handleGenerate = async () => {
    if (!examId) {
      setError("Please select an examination");
      return;
    }

    const finalTestTypes = testTypes.length > 0 ? testTypes : [1, 2];

    setError(null);
    setGenerating(true);

    try {
      const allSubjectIds = subjects.map((subject) => subject.id);
      const allSubjectsSelected =
        allSubjectIds.length > 0 && allSubjectIds.every((id) => selectedSubjectIds.includes(id));
      const subjectIdsForJob = allSubjectsSelected ? null : selectedSubjectIds.length > 0 ? selectedSubjectIds : null;
      const subjectIdForJob = subjectIdsForJob && subjectIdsForJob.length === 1 ? subjectIdsForJob[0] : null;

      const jobData = {
        school_ids: selectedSchoolId === "all" || selectedSchoolId === "" ? null : [selectedSchoolId as number],
        subject_ids: subjectIdsForJob,
        subject_id: subjectIdForJob,
        test_types: finalTestTypes,
        template,
      };

      const job = await createPdfGenerationJob(examId, jobData);

      localStorage.setItem("activePdfGenerationJobId", job.id.toString());

      setCurrentJob(job);
      setPolling(true);

      toast.success("PDF generation job started. You can leave this page and check back later.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create generation job");
      console.error("Generation error:", err);
      toast.error("Failed to create generation job");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadSchoolPdf = async (jobId: number, schoolId: number, schoolName: string, schoolCode: string) => {
    try {
      const blob = await downloadJobSchoolPdf(jobId, schoolId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${schoolCode}_${schoolName.replace(/\//g, "_").replace(/\\/g, "_")}_score_sheets.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Downloaded ZIP for ${schoolName}`);
    } catch (err) {
      toast.error(`Failed to download ZIP for ${schoolName}`);
      console.error("Download error:", err);
    }
  };

  const handleViewJob = () => {
    if (currentJob) {
      window.location.href = `/icm-studio/generate-icms/jobs/${currentJob.id}`;
    }
  };

  const examOptions = useMemo(() => {
    return [...exams]
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        const s = (x: string) => (x === "NOV/DEC" ? 2 : x === "MAY/JUNE" ? 1 : 0);
        if (a.series !== b.series) return s(b.series) - s(a.series);
        return (a.exam_type ?? "").localeCompare(b.exam_type ?? "");
      })
      .map((e) => ({
        value: e.id.toString(),
        label: `${e.year} ${e.series} ${e.exam_type}`,
      }));
  }, [exams]);

  const selectedExam = useMemo(
    () => (examId ? exams.find((e) => e.id === examId) : null),
    [exams, examId]
  );

  const schoolOptions = useMemo<SearchableSelectOption[]>(() => {
    return schools.map((school) => ({
      value: school.id,
      label: `${school.name} (${school.code})`,
    }));
  }, [schools]);

  const filteredSubjects = useMemo(() => {
    const filtered = subjects.filter((subject) => {
      const matchesType = subjectTypeFilter === "ALL" || subject.subject_type === subjectTypeFilter;
      const originalCode = subject.original_code || subject.code;
      const matchesSearch =
        !subjectSearch ||
        originalCode.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        subject.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        subject.name.toLowerCase().includes(subjectSearch.toLowerCase());
      return matchesType && matchesSearch;
    });

    return filtered.sort((a, b) => {
      const aSelected = selectedSubjectIds.includes(a.id);
      const bSelected = selectedSubjectIds.includes(b.id);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      const aCode = a.original_code || a.code;
      const bCode = b.original_code || b.code;
      return aCode.localeCompare(bCode);
    });
  }, [subjects, subjectTypeFilter, subjectSearch, selectedSubjectIds]);

  useEffect(() => {
    if (!examId || subjects.length === 0) {
      return;
    }

    if (selectedSubjectIds.length === 0) {
      if (subjectTypeFilter === "ALL") {
        const allSubjectIds = subjects.map((s) => s.id);
        if (allSubjectIds.length > 0) {
          setSelectedSubjectIds(allSubjectIds);
        }
      } else {
        const typeSubjectIds = subjects
          .filter((s) => s.subject_type === subjectTypeFilter)
          .map((s) => s.id);
        if (typeSubjectIds.length > 0) {
          setSelectedSubjectIds(typeSubjectIds);
        }
      }
    }
  }, [examId, subjectTypeFilter, subjects.length]);

  const handleSubjectToggle = (subjectId: number, checked: boolean) => {
    if (checked) {
      setSelectedSubjectIds((prev) => [...prev, subjectId]);
    } else {
      setSelectedSubjectIds((prev) => prev.filter((id) => id !== subjectId));
    }
  };

  const handleSelectAllSubjects = (checked: boolean) => {
    if (checked) {
      const allIds = filteredSubjects.map((s) => s.id);
      setSelectedSubjectIds(allIds);
    } else {
      setSelectedSubjectIds([]);
    }
  };

  const allSubjectsSelected = filteredSubjects.length > 0 && filteredSubjects.every((s) => selectedSubjectIds.includes(s.id));
  const someSubjectsSelected = filteredSubjects.some((s) => selectedSubjectIds.includes(s.id)) && !allSubjectsSelected;

  const selectedSubjects = useMemo(() => {
    return subjects.filter((s) => selectedSubjectIds.includes(s.id));
  }, [subjects, selectedSubjectIds]);

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);

  // Step indicator component
  const StepIndicator = () => {
    const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
      { key: "examination", label: "Examination", icon: <FileText className="h-4 w-4" /> },
      { key: "school", label: "School", icon: <CheckCircle className="h-4 w-4" /> },
      { key: "subjects", label: "Subjects", icon: <CheckCircle className="h-4 w-4" /> },
      { key: "test-types", label: "Test Types", icon: <CheckCircle className="h-4 w-4" /> },
      { key: "generate", label: "Generate", icon: <CheckCircle className="h-4 w-4" /> },
    ];

    const getStepStatus = (stepKey: Step) => {
      const stepIndex = steps.findIndex((s) => s.key === stepKey);
      const currentIndex = steps.findIndex((s) => s.key === currentStep);

      if (stepIndex < currentIndex) return "completed";
      if (stepIndex === currentIndex) return "current";
      return "upcoming";
    };

    return (
      <div className="flex items-center justify-between mb-6">
        {steps.map((step, index) => {
          const status = getStepStatus(step.key);
          const isCompleted = status === "completed";
          const isCurrent = status === "current";

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                    isCompleted && "bg-green-500 border-green-500 text-white",
                    isCurrent && "bg-primary border-primary text-primary-foreground",
                    !isCompleted && !isCurrent && "bg-muted border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : isCurrent ? (
                    <Circle className="h-5 w-5 fill-current" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center",
                    isCurrent && "text-foreground",
                    !isCurrent && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 -mt-5",
                    isCompleted ? "bg-green-500" : "bg-muted"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout title="Generate ICMs">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Generate ICMs" showSearch={false} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header with Job History Button */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex-1">
                <h2 className="text-2xl font-bold tracking-tight">Generate Score Sheets</h2>
                <p className="text-muted-foreground mt-1">
                  Create PDF score sheets for examinations
                </p>
              </div>
              <Link href="/icm-studio/generate-icms/jobs">
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4 mr-2" />
                  View Job History
                </Button>
              </Link>
            </div>

            {/* Step Indicator */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <StepIndicator />
              </CardContent>
            </Card>

            <div className={cn(
              "grid gap-6",
              currentJob && currentJob.status !== "completed" && currentJob.status !== "failed" && currentJob.status !== "cancelled"
                ? "lg:grid-cols-3"
                : "lg:grid-cols-1"
            )}>
              {/* Main Form */}
              <div className={cn(
                "space-y-6",
                currentJob && currentJob.status !== "completed" && currentJob.status !== "failed" && currentJob.status !== "cancelled"
                  ? "lg:col-span-2"
                  : ""
              )}>
                {/* Generation Form Card */}
                <Card className="w-full">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Generate Score Sheets
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Select examination details, school, subject, and test types to generate score sheets
                      </CardDescription>
                    </div>
                    {(examId || selectedSchoolId || selectedSubjectIds.length > 0) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearForm}
                        className="shrink-0"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {/* Step 1: Examination Selection */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                          examId ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {examId ? <CheckCircle className="h-4 w-4" /> : "1"}
                        </div>
                        <h3 className="text-sm font-semibold">Examination</h3>
                      </div>
                      <div className="pl-8 space-y-2">
                        <label className="text-sm font-medium">Examination</label>
                        <Select
                          value={examId?.toString() ?? ""}
                          onValueChange={(value) => {
                            if (!value) {
                              setExamId(null);
                              setSelectedSchoolId("");
                              setSelectedSubjectIds([]);
                            } else {
                              setExamId(Number(value));
                              setSelectedSchoolId("");
                              setSelectedSubjectIds([]);
                            }
                          }}
                          disabled={loading || generating}
                        >
                          <SelectTrigger className="w-full md:max-w-md">
                            <SelectValue placeholder="Select examination" />
                          </SelectTrigger>
                          <SelectContent>
                            {examOptions.length === 0 ? (
                              <SelectItem value="__none__" disabled>
                                No examinations found
                              </SelectItem>
                            ) : (
                              examOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Format: year, series, exam type
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Step 2: School Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                          selectedSchoolId !== "" ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {selectedSchoolId !== "" ? <CheckCircle className="h-4 w-4" /> : "2"}
                        </div>
                        <h3 className="text-sm font-semibold">School Selection</h3>
                      </div>
                      <div className="pl-8">
                        <SearchableSelect
                          options={schoolOptions}
                          value={selectedSchoolId === "" ? "" : selectedSchoolId === "all" ? "all" : selectedSchoolId}
                          onValueChange={(value) => {
                            if (value === "all") {
                              setSelectedSchoolId("all");
                            } else if (value === "") {
                              setSelectedSchoolId("");
                            } else {
                              setSelectedSchoolId(Number(value));
                            }
                          }}
                          placeholder={examId ? "Select school or 'All Schools'" : "Select examination first"}
                          disabled={!examId || loading || generating}
                          allowAll={true}
                          allLabel="All Schools"
                          searchPlaceholder="Search schools..."
                          emptyMessage="No schools found"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Leave unselected or select "All Schools" to generate for all schools
                        </p>
                        {selectedSchool && (
                          <div className="mt-2">
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {selectedSchool.name} ({selectedSchool.code})
                            </Badge>
                          </div>
                        )}
                        {selectedSchoolId === "all" && (
                          <div className="mt-2">
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              All Schools ({schools.length} schools)
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Step 3: Subject Selection */}
                    {examId && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                              selectedSubjectIds.length > 0 ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                            )}>
                              {selectedSubjectIds.length > 0 ? <CheckCircle className="h-4 w-4" /> : "3"}
                            </div>
                            <h3 className="text-sm font-semibold">Subject Selection</h3>
                          </div>
                          {selectedSubjectIds.length > 0 && (
                            <Badge variant="secondary">
                              {selectedSubjectIds.length} selected
                            </Badge>
                          )}
                        </div>
                        <div className="pl-8 space-y-4">
                          {/* Subject Type Filter */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Filter by Type</label>
                            <Select
                              value={subjectTypeFilter}
                              onValueChange={(value) => {
                                setSubjectTypeFilter(value as "ALL" | "CORE" | "ELECTIVE");
                              }}
                              disabled={!examId || loading || generating}
                            >
                              <SelectTrigger className="w-full md:w-[200px]">
                                <SelectValue placeholder="Select subject type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ALL">All Subjects</SelectItem>
                                <SelectItem value="CORE">Core Subjects</SelectItem>
                                <SelectItem value="ELECTIVE">Elective Subjects</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Selected Subjects Badges */}
                          {selectedSubjects.length > 0 && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Selected Subjects</label>
                              <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30 min-h-[60px]">
                                {selectedSubjects
                                  .filter((s) => filteredSubjects.some((fs) => fs.id === s.id))
                                  .map((subject) => {
                                    const originalCode = subject.original_code || subject.code;
                                    const displayText = `${originalCode} - ${subject.name}`;
                                    const maxLength = 45; // Reasonable character limit for badge display
                                    const truncatedText = displayText.length > maxLength
                                      ? `${displayText.substring(0, maxLength - 3)}...`
                                      : displayText;

                                    return (
                                      <Badge
                                        key={subject.id}
                                        variant="default"
                                        className="gap-1.5 pr-1"
                                        title={displayText} // Full text on hover
                                      >
                                        <span className="font-medium max-w-[180px] truncate block">{truncatedText}</span>
                                        <button
                                          onClick={() => handleSubjectToggle(subject.id, false)}
                                          className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors shrink-0"
                                          disabled={loading || generating}
                                          aria-label={`Remove ${subject.name}`}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </Badge>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {/* Subject Search and List */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium">Available Subjects</label>
                              {filteredSubjects.length > 0 && (
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="select-all-subjects"
                                    checked={allSubjectsSelected}
                                    onCheckedChange={handleSelectAllSubjects}
                                    disabled={loading || generating}
                                  />
                                  <label
                                    htmlFor="select-all-subjects"
                                    className="text-sm text-muted-foreground cursor-pointer"
                                  >
                                    {allSubjectsSelected ? "Deselect All" : "Select All"}
                                  </label>
                                </div>
                              )}
                            </div>
                            {filteredSubjects.length > 0 && (
                              <Input
                                placeholder="Search subjects by code or name..."
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                className="h-9"
                                disabled={loading || generating}
                              />
                            )}
                            {filteredSubjects.length === 0 ? (
                              <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
                                No {subjectTypeFilter === "ALL" ? "" : subjectTypeFilter.toLowerCase()} subjects found
                              </div>
                            ) : (
                              <div className="border rounded-md p-4 max-h-64 overflow-y-auto space-y-2">
                                {filteredSubjects.map((subject) => {
                                  const isSelected = selectedSubjectIds.includes(subject.id);
                                  return (
                                    <div
                                      key={subject.id}
                                      className={cn(
                                        "flex items-center space-x-2 p-2 rounded-md transition-colors",
                                        isSelected && "bg-primary/10"
                                      )}
                                    >
                                      <Checkbox
                                        id={`subject-${subject.id}`}
                                        checked={isSelected}
                                        onCheckedChange={(checked) =>
                                          handleSubjectToggle(subject.id, checked as boolean)
                                        }
                                        disabled={loading || generating}
                                      />
                                      <label
                                        htmlFor={`subject-${subject.id}`}
                                        className="text-sm font-medium leading-none cursor-pointer flex-1 flex items-center gap-2"
                                      >
                                        <span className="font-mono text-xs text-muted-foreground">{subject.original_code || subject.code}</span>
                                        <span>{subject.name}</span>
                                        <Badge variant="outline" className="ml-auto text-xs">
                                          {subject.subject_type}
                                        </Badge>
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {examId && <Separator />}

                    {/* Step 4: Test Type Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                          testTypes.length > 0 ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {testTypes.length > 0 ? <CheckCircle className="h-4 w-4" /> : "4"}
                        </div>
                        <h3 className="text-sm font-semibold">Test Types</h3>
                      </div>
                      <div className="pl-8 space-y-2">
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                            <Checkbox
                              id="test-type-1"
                              checked={testTypes.includes(1)}
                              onCheckedChange={(checked) => handleTestTypeChange(1, checked as boolean)}
                              disabled={generating}
                            />
                            <label htmlFor="test-type-1" className="text-sm font-medium leading-none cursor-pointer flex-1">
                              Objectives
                            </label>
                          </div>
                          <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                            <Checkbox
                              id="test-type-2"
                              checked={testTypes.includes(2)}
                              onCheckedChange={(checked) => handleTestTypeChange(2, checked as boolean)}
                              disabled={generating}
                            />
                            <label htmlFor="test-type-2" className="text-sm font-medium leading-none cursor-pointer flex-1">
                              Essay
                            </label>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Leave unselected to generate both Objectives and Essay (default)
                        </p>
                      </div>
                    </div>

                    {/* Score sheet template */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold">Score Sheet Template</h3>
                      </div>
                      <div className="pl-8 space-y-2">
                        <Select
                          value={template}
                          onValueChange={(v) => setTemplate(v as "new" | "old")}
                          disabled={generating}
                        >
                          <SelectTrigger className="w-full md:w-[280px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="old">Old</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {template === "new"
                            ? "Current layout: logo crest, Invigilator/Examiner footer, barcode + sheet ID, black headers."
                            : "Legacy layout: logo.jpg, footer.jpg, barcode + sheet ID in header."}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Step 5: Generate Button */}
                    <div className="space-y-4">
                      {/* Summary Card */}
                      {examId && (
                        <Card className="bg-muted/30">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Generation Summary</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Examination:</span>
                              <span className="font-medium">
                                {selectedExam
                                  ? `${selectedExam.year} ${selectedExam.series} ${selectedExam.exam_type}`
                                  : "—"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">School:</span>
                              <span className="font-medium">
                                {selectedSchoolId === "all"
                                  ? `All Schools (${schools.length})`
                                  : selectedSchool
                                  ? `${selectedSchool.name}`
                                  : "Not selected"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subjects:</span>
                              <span className="font-medium">
                                {selectedSubjectIds.length === 0
                                  ? "All subjects"
                                  : `${selectedSubjectIds.length} subject${selectedSubjectIds.length !== 1 ? "s" : ""}`}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Test Types:</span>
                              <span className="font-medium">
                                {testTypes.length === 0
                                  ? "Both (Objectives & Essay)"
                                  : testTypes.includes(1) && testTypes.includes(2)
                                  ? "Both (Objectives & Essay)"
                                  : testTypes.includes(1)
                                  ? "Objectives"
                                  : "Essay"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Template:</span>
                              <span className="font-medium">{template === "new" ? "New" : "Old"}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <Button
                        onClick={handleGenerate}
                        disabled={!examId || generating || (currentJob && currentJob.exam_id === examId && ["pending", "processing"].includes(currentJob.status))}
                        className="w-full"
                        size="lg"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating Job...
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4 mr-2" />
                            Generate Score Sheets
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Job Progress Card - Sticky when active */}
              {currentJob && currentJob.status !== "completed" && currentJob.status !== "failed" && currentJob.status !== "cancelled" && (
                <div className="lg:col-span-1">
                  <Card className="sticky top-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {currentJob.status === "processing" && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                        {currentJob.status === "pending" && <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />}
                        Job Progress
                      </CardTitle>
                      <CardDescription>
                        Job #{currentJob.id}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Progress Information */}
                      {currentJob.status === "processing" && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {currentJob.current_school_name
                                ? `Processing: ${currentJob.current_school_name}`
                                : "Starting..."}
                            </span>
                            <span className="font-semibold">
                              {currentJob.progress_current} / {currentJob.progress_total}
                            </span>
                          </div>
                          {currentJob.progress_total > 0 && (
                            <Progress
                              value={(currentJob.progress_current / currentJob.progress_total) * 100}
                              className="h-3"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            {currentJob.progress_total > 0
                              ? `${Math.round((currentJob.progress_current / currentJob.progress_total) * 100)}% complete`
                              : "Initializing..."}
                          </p>
                        </div>
                      )}

                      {currentJob.status === "pending" && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                          <div className="text-sm text-muted-foreground">
                            Job is queued and will start processing shortly...
                          </div>
                        </div>
                      )}

                      <Button variant="outline" size="sm" onClick={handleViewJob} className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Job Progress Card - Full width when completed/failed */}
            {(currentJob && (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "cancelled")) && (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {currentJob.status === "completed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                        {currentJob.status === "failed" && <AlertCircle className="h-5 w-5 text-red-600" />}
                        {currentJob.status === "cancelled" && <AlertCircle className="h-5 w-5 text-gray-600" />}
                        Job #{currentJob.id} - {currentJob.status.charAt(0).toUpperCase() + currentJob.status.slice(1)}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {currentJob.status === "completed"
                          ? "PDF generation completed successfully"
                          : currentJob.status === "failed"
                          ? "PDF generation failed"
                          : "PDF generation was cancelled"}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleViewJob}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Completion Summary */}
                  {currentJob.status === "completed" && currentJob.results && currentJob.results.length > 0 && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 space-y-2">
                      <div className="text-sm font-medium text-green-700 dark:text-green-400">
                        ✓ {currentJob.results.filter((r) => !r.error).length} school(s) completed successfully
                      </div>
                      {currentJob.results.filter((r) => r.error).length > 0 && (
                        <div className="text-sm text-orange-600 dark:text-orange-400">
                          ⚠ {currentJob.results.filter((r) => r.error).length} school(s) had errors
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Message */}
                  {currentJob.error_message && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{currentJob.error_message}</AlertDescription>
                    </Alert>
                  )}

                  {/* Download Results */}
                  {currentJob.status === "completed" && currentJob.results && currentJob.results.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Download Results</h4>
                        <span className="text-xs text-muted-foreground">
                          {currentJob.results.filter(
                            (r) =>
                              !r.error &&
                              ((r.pdf_file_paths && r.pdf_file_paths.length > 0) || r.pdf_file_path)
                          ).length} available
                        </span>
                      </div>
                      <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                        {currentJob.results.map((result) => (
                          <div
                            key={result.school_id}
                            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {result.school_name}
                              </div>
                              {result.school_code && (
                                <div className="text-xs text-muted-foreground">
                                  {result.school_code}
                                </div>
                              )}
                            </div>
                            {!result.error && ((result.pdf_file_paths && result.pdf_file_paths.length > 0) || result.pdf_file_path) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleDownloadSchoolPdf(
                                    currentJob.id,
                                    result.school_id,
                                    result.school_name,
                                    result.school_code
                                  )
                                }
                                className="shrink-0"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download ZIP
                              </Button>
                            ) : (
                              <span className="text-xs text-red-600 dark:text-red-400 shrink-0">
                                {result.error || "No PDF"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty State - No Active Job */}
            {!currentJob && (
              <Card className="mt-6">
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="font-medium mb-1">No active job</p>
                    <p className="text-sm">Start a generation job to see progress here</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
