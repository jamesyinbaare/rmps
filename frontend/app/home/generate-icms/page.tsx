"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  findExamId,
  getSchoolsForExamWithCandidates,
  getSubjectsForExamAndSchoolByCandidates,
  listExamSubjects,
  createPdfGenerationJob,
  getPdfGenerationJob,
  downloadJobSchoolPdf,
  type PdfGenerationJob,
} from "@/lib/api";
import type { Exam, School, Subject, ExamType, ExamSeries } from "@/types/document";
import { FileText, Download, Loader2, AlertCircle, CheckCircle2, History, Eye } from "lucide-react";
import { toast } from "sonner";


export default function GenerateICMsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examType, setExamType] = useState<ExamType | "">("");
  const [series, setSeries] = useState<ExamSeries | "">("");
  const [year, setYear] = useState<number | "">("");
  const [examId, setExamId] = useState<number | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | "all" | "">("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<"ALL" | "CORE" | "ELECTIVE">("ALL");
  const [subjectSearch, setSubjectSearch] = useState<string>("");
  const [testTypes, setTestTypes] = useState<number[]>([1, 2]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<PdfGenerationJob | null>(null);
  const [polling, setPolling] = useState(false);

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

  // Find exam ID when type, series, year are selected
  useEffect(() => {
    if (examType && series && year) {
      const foundExamId = findExamId(exams, examType as ExamType, series as ExamSeries, Number(year));
      setExamId(foundExamId);
    } else {
      setExamId(null);
      setSchools([]);
      setSelectedSchoolId("");
      setSubjects([]);
      setSelectedSubjectIds([]);
    }
  }, [examType, series, year, exams]);

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
  // If a school is selected, only show subjects that school has candidates for
  // If "All Schools" is selected, show all exam subjects
  useEffect(() => {
    const loadSubjects = async () => {
      if (!examId) {
        setSubjects([]);
        setSelectedSubjectIds([]);
        return;
      }

      try {
        setLoading(true);
        if (selectedSchoolId && selectedSchoolId !== "all" && selectedSchoolId !== "") {
          // Get subjects that this school has candidates registered for in this exam
          const schoolSubjects = await getSubjectsForExamAndSchoolByCandidates(examId, selectedSchoolId as number);
          setSubjects(schoolSubjects);
        } else {
          // For "All Schools" or no school selected, get all exam subjects
          const examSubjects = await listExamSubjects(examId);
          setSubjects(
            examSubjects.map((es) => ({
              id: es.subject_id,
              code: es.subject_code,
              name: es.subject_name,
              original_code: es.subject_code,
              subject_type: es.subject_type,
              exam_type: examType as ExamType,
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
  }, [examId, selectedSchoolId, examType]);

  const handleTestTypeChange = (testType: number, checked: boolean) => {
    if (checked) {
      setTestTypes((prev) => [...prev, testType].sort());
    } else {
      setTestTypes((prev) => prev.filter((t) => t !== testType));
    }
  };

  const handleGenerate = async () => {
    if (!examId) {
      setError("Please select an examination");
      return;
    }

    // Default to both test types if none selected
    const finalTestTypes = testTypes.length > 0 ? testTypes : [1, 2];

    setError(null);
    setGenerating(true);

    try {
      // Create job
      // If all subjects are selected or none selected, treat as null (all subjects)
      const subjectIdForJob =
        selectedSubjectIds.length === 0 ||
        selectedSubjectIds.length === filteredSubjects.length
          ? null
          : selectedSubjectIds.length === 1
          ? selectedSubjectIds[0]
          : null; // For now, if multiple selected, treat as all (backend only supports single subject_id or null)

      const jobData = {
        school_ids: selectedSchoolId === "all" || selectedSchoolId === "" ? null : [selectedSchoolId as number],
        subject_id: subjectIdForJob,
        test_types: finalTestTypes,
      };

      const job = await createPdfGenerationJob(examId, jobData);

      // Save job ID to localStorage
      localStorage.setItem("activePdfGenerationJobId", job.id.toString());

      // Set current job and start polling
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
      a.download = `${schoolCode}_${schoolName.replace(/\//g, "_").replace(/\\/g, "_")}_combined_score_sheets.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      toast.error(`Failed to download PDF for ${schoolName}`);
      console.error("Download error:", err);
    }
  };

  const handleViewJob = () => {
    if (currentJob) {
      window.location.href = `/home/generate-icms/jobs/${currentJob.id}`;
    }
  };

  // Get unique years from exams
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    exams.forEach((exam) => {
      if (exam.exam_type === examType && exam.series === series) {
        yearsSet.add(exam.year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a); // Sort descending
  }, [exams, examType, series]);

  // Convert schools to options for searchable select
  const schoolOptions = useMemo<SearchableSelectOption[]>(() => {
    return schools.map((school) => ({
      value: school.id,
      label: `${school.name} (${school.code})`,
    }));
  }, [schools]);

  // Filter subjects by subject type and search query, then sort: selected first, then unselected
  const filteredSubjects = useMemo(() => {
    const filtered = subjects.filter((subject) => {
      // Filter by type
      const matchesType = subjectTypeFilter === "ALL" || subject.subject_type === subjectTypeFilter;
      // Filter by search query
      const matchesSearch =
        !subjectSearch ||
        subject.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        subject.name.toLowerCase().includes(subjectSearch.toLowerCase());
      return matchesType && matchesSearch;
    });

    // Sort: selected subjects first, then unselected (alphabetically by code within each group)
    return filtered.sort((a, b) => {
      const aSelected = selectedSubjectIds.includes(a.id);
      const bSelected = selectedSubjectIds.includes(b.id);

      if (aSelected && !bSelected) return -1; // a comes first
      if (!aSelected && bSelected) return 1;  // b comes first

      // If both selected or both unselected, sort alphabetically by code
      return a.code.localeCompare(b.code);
    });
  }, [subjects, subjectTypeFilter, subjectSearch, selectedSubjectIds]);

  // Auto-select all subjects when subject type changes or subjects are loaded
  // Only auto-select if no subjects are currently selected (to preserve user selections when searching)
  useEffect(() => {
    if (!examId || subjects.length === 0) {
      return;
    }

    // Only auto-select if nothing is selected yet (preserves selections when searching)
    if (selectedSubjectIds.length === 0) {
      if (subjectTypeFilter === "ALL") {
        // When "ALL" is selected, select all subjects
        const allSubjectIds = subjects.map((s) => s.id);
        if (allSubjectIds.length > 0) {
          setSelectedSubjectIds(allSubjectIds);
        }
      } else {
        // When a specific type is selected, select all subjects of that type
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

  return (
    <DashboardLayout title="Generate ICMs">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Generate ICMs" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto mb-4 flex justify-end">
            <Link href="/home/generate-icms/jobs">
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                View Job History
              </Button>
            </Link>
          </div>

          <div className="max-w-6xl mx-auto space-y-6">
            {/* Generation Form Card */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Generate Score Sheets
                </CardTitle>
                <CardDescription>
                  Select examination details, school, subject, and test types to generate score sheets
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

              {/* Examination Selection */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Examination Type</label>
                    <Select
                      value={examType}
                      onValueChange={(value) => setExamType(value as ExamType)}
                      disabled={loading || generating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Certificate II Examination">Certificate II Examination</SelectItem>
                        <SelectItem value="CBT">CBT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Series</label>
                    <Select
                      value={series}
                      onValueChange={(value) => setSeries(value as ExamSeries)}
                      disabled={loading || generating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select series" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAY/JUNE">MAY/JUNE</SelectItem>
                        <SelectItem value="NOV/DEC">NOV/DEC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Year</label>
                    <Select
                      value={year.toString()}
                      onValueChange={(value) => setYear(Number(value))}
                      disabled={loading || generating || !examType || !series}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={examType && series ? "Select year" : "Select type and series first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableYears.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No exams found
                          </SelectItem>
                        ) : (
                          availableYears.map((y) => (
                            <SelectItem key={y} value={y.toString()}>
                              {y}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* School Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">School</label>
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
                <p className="text-xs text-muted-foreground">
                  Leave unselected or select "All Schools" to generate for all schools
                </p>
              </div>

              {/* Subject Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject Type</label>
                <Select
                  value={subjectTypeFilter}
                  onValueChange={(value) => {
                    setSubjectTypeFilter(value as "ALL" | "CORE" | "ELECTIVE");
                    // Reset selection - will be auto-selected by useEffect
                  }}
                  disabled={!examId || loading || generating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Subjects</SelectItem>
                    <SelectItem value="CORE">Core Subjects</SelectItem>
                    <SelectItem value="ELECTIVE">Elective Subjects</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Filter subjects by type, then select specific subjects below
                </p>
              </div>

              {/* Subject Selection with Checkboxes */}
              {examId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Subjects</label>
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
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      No {subjectTypeFilter === "ALL" ? "" : subjectTypeFilter.toLowerCase()} subjects found
                    </div>
                  ) : (
                    <div className="border rounded-md p-4 max-h-64 overflow-y-auto space-y-2">
                      {filteredSubjects.map((subject) => (
                        <div
                          key={subject.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`subject-${subject.id}`}
                            checked={selectedSubjectIds.includes(subject.id)}
                            onCheckedChange={(checked) =>
                              handleSubjectToggle(subject.id, checked as boolean)
                            }
                            disabled={loading || generating}
                          />
                          <label
                            htmlFor={`subject-${subject.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                          >
                            {subject.code} - {subject.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selectedSubjectIds.length === 0
                      ? "No subjects selected"
                      : selectedSubjectIds.length === filteredSubjects.length
                      ? "All subjects selected"
                      : `${selectedSubjectIds.length} of ${filteredSubjects.length} subjects selected`}
                  </p>
                </div>
              )}

              {/* Test Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Test Types</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="test-type-1"
                      checked={testTypes.includes(1)}
                      onCheckedChange={(checked) => handleTestTypeChange(1, checked as boolean)}
                      disabled={generating}
                    />
                    <label htmlFor="test-type-1" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Objectives
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="test-type-2"
                      checked={testTypes.includes(2)}
                      onCheckedChange={(checked) => handleTestTypeChange(2, checked as boolean)}
                      disabled={generating}
                    />
                    <label htmlFor="test-type-2" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Essay
                    </label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave unselected to generate both Objectives and Essay (default)
                </p>
              </div>

                {/* Generate Button */}
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
              </CardContent>
            </Card>

            {/* Job Progress Card */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5" />
                  Job Progress
                </CardTitle>
                <CardDescription>
                  Monitor the status and progress of your PDF generation job
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentJob ? (
                  <>
                    {/* Job Status Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          {currentJob.status === "processing" && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                          {currentJob.status === "pending" && <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />}
                          {currentJob.status === "completed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {currentJob.status === "failed" && <AlertCircle className="h-5 w-5 text-red-600" />}
                          {currentJob.status === "cancelled" && <AlertCircle className="h-5 w-5 text-gray-600" />}
                          <div>
                            <div className="font-semibold text-lg">
                              Job #{currentJob.id}
                            </div>
                            <div className="text-sm text-muted-foreground capitalize">
                              {currentJob.status}
                            </div>
                          </div>
                        </div>

                        {/* Progress Information */}
                        {currentJob.status === "processing" && (
                          <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
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
                                className="h-2"
                              />
                            )}
                          </div>
                        )}

                        {currentJob.status === "pending" && (
                          <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            <div className="text-sm text-muted-foreground">
                              Job is queued and will start processing shortly...
                            </div>
                          </div>
                        )}

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
                                {currentJob.results.filter((r) => r.pdf_file_path && !r.error).length} available
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
                                  {result.pdf_file_path && !result.error ? (
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
                                      Download
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
                      </div>
                      <Button variant="outline" size="sm" onClick={handleViewJob} className="shrink-0">
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="font-medium mb-1">No active job</p>
                    <p className="text-sm">Start a generation job to see progress here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
