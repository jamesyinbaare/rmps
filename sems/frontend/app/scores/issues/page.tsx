"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getValidationIssues, getValidationIssue, runValidation, resolveValidationIssue, ignoreValidationIssue, getAllExams, listSchools, listSubjects, API_BASE_URL } from "@/lib/api";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueDetailResponse,
  ValidationIssueStatus,
  ValidationIssueType,
  Exam,
  School,
  Subject,
} from "@/types/document";
import { Loader2, AlertCircle, CheckCircle2, XCircle, Play, Filter, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export default function ValidationIssuesPage() {
  const [issues, setIssues] = useState<SubjectScoreValidationIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters - using arrays for multi-select
  const [statusFilter, setStatusFilter] = useState<ValidationIssueStatus[]>([]);
  const [issueTypeFilter, setIssueTypeFilter] = useState<ValidationIssueType[]>([]);
  const [examIdFilter, setExamIdFilter] = useState<number | null>(null);
  const [schoolIdFilter, setSchoolIdFilter] = useState<number | null>(null);
  const [subjectIdFilter, setSubjectIdFilter] = useState<number | null>(null);
  const [testTypeFilter, setTestTypeFilter] = useState<number[]>([]);

  // Validation run dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);

  // Filter options for validation
  const [validationExamId, setValidationExamId] = useState<number | null>(null);
  const [validationSchoolId, setValidationSchoolId] = useState<number | null>(null);
  const [validationSubjectId, setValidationSubjectId] = useState<number | null>(null);

  // Options for filters
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);

  // Issue detail modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [currentIssueIndex, setCurrentIssueIndex] = useState<number | null>(null);
  const [issueDetail, setIssueDetail] = useState<ValidationIssueDetailResponse | null>(null);
  const [loadingIssueDetail, setLoadingIssueDetail] = useState(false);
  const [correctedScore, setCorrectedScore] = useState<string>("");
  const [resolvingIssue, setResolvingIssue] = useState(false);
  const [ignoringIssue, setIgnoringIssue] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Load issues
  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: any = {
        page,
        page_size: pageSize,
      };

      // Handle multi-select filters - only send to backend if exactly one is selected
      // If multiple are selected, we'll fetch all and filter on frontend
      if (statusFilter.length === 1) {
        filters.status = statusFilter[0];
      }

      if (issueTypeFilter.length === 1) {
        filters.issue_type = issueTypeFilter[0];
      }

      if (examIdFilter) {
        filters.exam_id = examIdFilter;
      }

      if (schoolIdFilter) {
        filters.school_id = schoolIdFilter;
      }

      if (subjectIdFilter) {
        filters.subject_id = subjectIdFilter;
      }

      if (testTypeFilter.length === 1) {
        filters.test_type = testTypeFilter[0];
      }

      const response = await getValidationIssues(filters);
      setIssues(response.issues);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / pageSize));
      // Update current issue detail if modal is open and issue still exists
      if (issueModalOpen && currentIssueIndex !== null && currentIssueIndex < response.issues.length) {
        loadIssueDetail(response.issues[currentIssueIndex].id);
      } else if (issueModalOpen && (currentIssueIndex === null || currentIssueIndex >= response.issues.length)) {
        // Close modal if current issue no longer exists
        setIssueModalOpen(false);
        setCurrentIssueIndex(null);
        setIssueDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load validation issues");
      console.error("Error loading validation issues:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, issueTypeFilter, examIdFilter, schoolIdFilter, subjectIdFilter, testTypeFilter]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Load filter options on mount and when dialog opens
  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    if (runDialogOpen) {
      loadFilterOptions();
    }
  }, [runDialogOpen]);

  const loadFilterOptions = async () => {
    setLoadingFilterOptions(true);
    try {
      console.log("Loading filter options...");
      // Load exams, schools, and subjects
      const [examsData, schoolsData, subjectsData] = await Promise.all([
        getAllExams().catch((err) => {
          console.error("Error loading exams:", err);
          return [];
        }),
        listSchools(1, 100).catch((err) => {
          console.error("Error loading schools:", err);
          return [];
        }),
        listSubjects(1, 100).catch((err) => {
          console.error("Error loading subjects:", err);
          return [];
        }),
      ]);

      console.log("Filter options loaded:", { exams: examsData?.length, schools: schoolsData?.length, subjects: subjectsData?.length });
      setExams(Array.isArray(examsData) ? examsData : []);
      setSchools(Array.isArray(schoolsData) ? schoolsData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (err) {
      console.error("Error loading filter options:", err);
      toast.error("Failed to load filter options");
    } finally {
      setLoadingFilterOptions(false);
    }
  };

  const handleRunValidation = async () => {
    setRunningValidation(true);
    try {
      console.log("Running validation with filters:", {
        exam_id: validationExamId,
        school_id: validationSchoolId,
        subject_id: validationSubjectId,
      });

      const request = {
        exam_id: validationExamId || null,
        school_id: validationSchoolId || null,
        subject_id: validationSubjectId || null,
      };

      console.log("Validation request:", request);
      const result = await runValidation(request);
      console.log("Validation result:", result);

      toast.success(result.message);
      setRunDialogOpen(false);
      // Reset filters
      setValidationExamId(null);
      setValidationSchoolId(null);
      setValidationSubjectId(null);
      // Reload issues after validation
      await loadIssues();
    } catch (err) {
      console.error("Error running validation:", err);
      console.error("Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        error: err,
      });
      const errorMessage = err instanceof Error ? err.message : "Failed to run validation";
      toast.error(errorMessage);
    } finally {
      setRunningValidation(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setRunDialogOpen(open);
    if (!open) {
      // Reset filters when dialog closes
      setValidationExamId(null);
      setValidationSchoolId(null);
      setValidationSubjectId(null);
    }
  };

  const loadIssueDetail = async (issueId: number) => {
    setLoadingIssueDetail(true);
    setImageLoading(true);
    setImageError(false);
    try {
      const detail = await getValidationIssue(issueId);
      setIssueDetail(detail);
      setCorrectedScore(detail.current_score_value || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load issue details");
      console.error("Error loading issue detail:", err);
    } finally {
      setLoadingIssueDetail(false);
    }
  };

  const handleOpenIssueModal = (issue: SubjectScoreValidationIssue, index: number) => {
    setCurrentIssueIndex(index);
    setIssueModalOpen(true);
    // Reset image state when opening modal
    setImageLoading(true);
    setImageError(false);
    loadIssueDetail(issue.id);
  };

  const handleCloseIssueModal = () => {
    setIssueModalOpen(false);
    setCurrentIssueIndex(null);
    setIssueDetail(null);
    setCorrectedScore("");
    setImageLoading(true);
    setImageError(false);
  };

  const handleNavigateIssue = (direction: "prev" | "next") => {
    if (currentIssueIndex === null || issues.length === 0) return;

    let newIndex: number;
    if (direction === "prev") {
      newIndex = Math.max(0, currentIssueIndex - 1);
    } else {
      newIndex = Math.min(issues.length - 1, currentIssueIndex + 1);
    }

    if (newIndex !== currentIssueIndex) {
      setCurrentIssueIndex(newIndex);
      // Reset image state before loading new issue
      setImageLoading(true);
      setImageError(false);
      loadIssueDetail(issues[newIndex].id);
    }
  };

  const handleResolveIssue = async () => {
    if (!issueDetail) return;

    setResolvingIssue(true);
    try {
      await resolveValidationIssue(issueDetail.id, correctedScore || undefined);
      toast.success("Issue marked as resolved");

      // Navigate to next issue or close modal
      if (currentIssueIndex !== null && currentIssueIndex < issues.length - 1) {
        handleNavigateIssue("next");
      } else {
        handleCloseIssueModal();
      }

      await loadIssues();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve issue");
    } finally {
      setResolvingIssue(false);
    }
  };

  const handleIgnoreIssue = async () => {
    if (!issueDetail) return;

    setIgnoringIssue(true);
    try {
      await ignoreValidationIssue(issueDetail.id);
      toast.success("Issue marked as ignored");

      // Navigate to next issue or close modal
      if (currentIssueIndex !== null && currentIssueIndex < issues.length - 1) {
        handleNavigateIssue("next");
      } else {
        handleCloseIssueModal();
      }

      await loadIssues();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ignore issue");
    } finally {
      setIgnoringIssue(false);
    }
  };

  const getStatusBadge = (status: ValidationIssueStatus) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Open
          </Badge>
        );
      case "resolved":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Resolved
          </Badge>
        );
      case "ignored":
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-700">
            <XCircle className="h-3 w-3 mr-1" />
            Ignored
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getIssueTypeBadge = (issueType: ValidationIssueType) => {
    switch (issueType) {
      case "missing_score":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            Missing Score
          </Badge>
        );
      case "invalid_score":
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            Invalid Score
          </Badge>
        );
      default:
        return <Badge>{issueType}</Badge>;
    }
  };

  const getTestTypeLabel = (testType: number) => {
    switch (testType) {
      case 1:
        return "Objectives";
      case 2:
        return "Essay";
      case 3:
        return "Practical";
      default:
        return `Type ${testType}`;
    }
  };

  const getFieldNameLabel = (fieldName: string) => {
    switch (fieldName) {
      case "obj_raw_score":
        return "Objectives";
      case "essay_raw_score":
        return "Essay";
      case "pract_raw_score":
        return "Practical";
      default:
        return fieldName;
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Validation Issues" />

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
          {/* Header with Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* <h2 className="text-2xl font-semibold">
                Issues
              </h2> */}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setRunDialogOpen(true)}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Check missing & invalid scores
              </Button>
            </div>
          </div>

          {/* School and Subject Filters Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                </div> */}
                <div className="relative flex-1 min-w-[300px]">
                  <label className="absolute left-3 top-2 text-xs text-muted-foreground pointer-events-none z-10 bg-background px-1">
                    School
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={schools.map((school) => ({
                        value: school.id,
                        label: `${school.code} - ${school.name}`,
                      }))}
                      value={schoolIdFilter ? schoolIdFilter : "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setSchoolIdFilter(null);
                        } else {
                          setSchoolIdFilter(typeof value === "number" ? value : parseInt(value as string, 10));
                        }
                        setPage(1);
                      }}
                      placeholder="Select a school"
                      disabled={loadingFilterOptions}
                      allowAll={true}
                      allLabel="All schools"
                      searchPlaceholder="Search schools..."
                      emptyMessage="No schools found"
                    />
                  </div>
                </div>

                <div className="relative flex-1 min-w-[300px]">
                  <label className="absolute left-3 top-2 text-xs text-muted-foreground pointer-events-none z-10 bg-background px-1">
                    Subject
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={subjects.map((subject) => ({
                        value: subject.id,
                        label: `${subject.code} - ${subject.name}`,
                      }))}
                      value={subjectIdFilter ? subjectIdFilter : "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setSubjectIdFilter(null);
                        } else {
                          setSubjectIdFilter(typeof value === "number" ? value : parseInt(value as string, 10));
                        }
                        setPage(1);
                      }}
                      placeholder="Select a subject"
                      disabled={loadingFilterOptions}
                      allowAll={true}
                      allLabel="All subjects"
                      searchPlaceholder="Search subjects..."
                      emptyMessage="No subjects found"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Issues List */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            {/* Table Header with Filters - Organized by table field order */}
            <div className="border-b p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Status Filter - matches first column in table */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      Status
                      {statusFilter.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {statusFilter.length}
                        </Badge>
                      )}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="p-2 space-y-2">
                      <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                        <Checkbox
                          id="status-all"
                          checked={statusFilter.length === 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setStatusFilter([]);
                              setPage(1);
                            }
                          }}
                        />
                        <label
                          htmlFor="status-all"
                          className="text-sm font-medium leading-none cursor-pointer flex-1"
                        >
                          All
                        </label>
                      </div>
                      {(["pending", "resolved", "ignored"] as ValidationIssueStatus[]).map((status) => (
                        <div key={status} className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                          <Checkbox
                            id={`status-${status}`}
                            checked={statusFilter.includes(status)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setStatusFilter([...statusFilter, status]);
                              } else {
                                setStatusFilter(statusFilter.filter((s) => s !== status));
                              }
                              setPage(1);
                            }}
                          />
                          <label
                            htmlFor={`status-${status}`}
                            className="text-sm font-medium leading-none cursor-pointer flex-1 capitalize"
                          >
                            {status === "pending" ? "Open" : status}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Issue Type Filter - matches second column in table */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      Type
                      {issueTypeFilter.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {issueTypeFilter.length}
                        </Badge>
                      )}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="p-2 space-y-2">
                      <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                        <Checkbox
                          id="type-all"
                          checked={issueTypeFilter.length === 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setIssueTypeFilter([]);
                              setPage(1);
                            }
                          }}
                        />
                        <label
                          htmlFor="type-all"
                          className="text-sm font-medium leading-none cursor-pointer flex-1"
                        >
                          All
                        </label>
                      </div>
                      {(["missing_score", "invalid_score"] as ValidationIssueType[]).map((type) => (
                        <div key={type} className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                          <Checkbox
                            id={`type-${type}`}
                            checked={issueTypeFilter.includes(type)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setIssueTypeFilter([...issueTypeFilter, type]);
                              } else {
                                setIssueTypeFilter(issueTypeFilter.filter((t) => t !== type));
                              }
                              setPage(1);
                            }}
                          />
                          <label
                            htmlFor={`type-${type}`}
                            className="text-sm font-medium leading-none cursor-pointer flex-1"
                          >
                            {type === "missing_score" ? "Missing Score" : "Invalid Score"}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Test Type Filter - matches third column in table */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      Test Type
                      {testTypeFilter.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {testTypeFilter.length}
                        </Badge>
                      )}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="p-2 space-y-2">
                      <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                        <Checkbox
                          id="test-type-all"
                          checked={testTypeFilter.length === 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setTestTypeFilter([]);
                              setPage(1);
                            }
                          }}
                        />
                        <label
                          htmlFor="test-type-all"
                          className="text-sm font-medium leading-none cursor-pointer flex-1"
                        >
                          All
                        </label>
                      </div>
                      {[1, 2, 3].map((testType) => (
                        <div key={testType} className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                          <Checkbox
                            id={`test-type-${testType}`}
                            checked={testTypeFilter.includes(testType)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setTestTypeFilter([...testTypeFilter, testType]);
                              } else {
                                setTestTypeFilter(testTypeFilter.filter((t) => t !== testType));
                              }
                              setPage(1);
                            }}
                          />
                          <label
                            htmlFor={`test-type-${testType}`}
                            className="text-sm font-medium leading-none cursor-pointer flex-1"
                          >
                            {getTestTypeLabel(testType)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                </div>

                {/* Page Size Filter - control, not a table field - moved to the right */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      Page Size: {pageSize}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0" align="end">
                    <div className="p-2 space-y-2">
                      {[20, 50, 100, 200, 500, 1000].map((size) => (
                        <div key={size} className="flex items-center space-x-2 p-2 hover:bg-muted rounded-sm">
                          <Checkbox
                            id={`page-size-${size}`}
                            checked={pageSize === size}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setPageSize(size);
                                setPage(1);
                              }
                            }}
                          />
                          <label
                            htmlFor={`page-size-${size}`}
                            className="text-sm font-medium leading-none cursor-pointer flex-1"
                          >
                            {size}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <CardContent className="flex-1 overflow-auto p-0">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="flex items-center justify-center py-8 text-destructive">
                  {error}
                </div>
              )}

              {!loading && !error && issues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No issues found</p>
                  <p className="text-sm mt-2">
                    {statusFilter.length > 0 || issueTypeFilter.length > 0 || testTypeFilter.length > 0
                      ? "Try adjusting your filters"
                      : "Run validation to check for issues"}
                  </p>
                </div>
              )}

              {!loading && !error && issues.length > 0 && (
                <div className="divide-y">
                  {issues
                    .filter((issue) => {
                      // Apply frontend filtering for multi-select
                      if (statusFilter.length > 0 && !statusFilter.includes(issue.status)) {
                        return false;
                      }
                      if (issueTypeFilter.length > 0 && !issueTypeFilter.includes(issue.issue_type)) {
                        return false;
                      }
                      if (testTypeFilter.length > 0 && !testTypeFilter.includes(issue.test_type)) {
                        return false;
                      }
                      return true;
                    })
                    .map((issue, filteredIndex) => {
                      // Find the original index in the unfiltered array for modal navigation
                      const originalIndex = issues.findIndex((i) => i.id === issue.id);
                      return (
                    <div
                      key={issue.id}
                      className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleOpenIssueModal(issue, originalIndex)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(issue.status)}
                          {getIssueTypeBadge(issue.issue_type)}
                          <Badge variant="outline" className="text-xs">
                            {getTestTypeLabel(issue.test_type)}
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-4">
                          <span className="font-semibold text-sm shrink-0">
                            {getFieldNameLabel(issue.field_name)}
                          </span>
                          <p className="text-sm text-muted-foreground flex-1 min-w-0 truncate">
                            {issue.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                            <span>
                              Created {format(new Date(issue.created_at), "MMM d, yyyy")}
                            </span>
                            {issue.resolved_at && (
                              <span>
                                Resolved {format(new Date(issue.resolved_at), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} issues
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <div className="text-sm">
                  Page {page} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Run Validation Dialog */}
        <Dialog open={runDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Run Validation</DialogTitle>
              <DialogDescription>
                Run validation to check for issues in candidate's subject scores. You can optionally filter by exam, school, or subject.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="max-w-md mx-auto">
                <div className="relative">
                  <label className="absolute left-3 top-2 text-xs text-muted-foreground pointer-events-none z-10 bg-background px-1">
                    Exam (Optional)
                  </label>
                  <div className="pt-4">
                    <Select
                      value={validationExamId?.toString() || "all"}
                      onValueChange={(value) => {
                        if (value === "all") {
                          setValidationExamId(null);
                        } else {
                          const numValue = parseInt(value, 10);
                          setValidationExamId(isNaN(numValue) ? null : numValue);
                        }
                      }}
                      disabled={runningValidation || loadingFilterOptions}
                    >
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Select an exam" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All exams</SelectItem>
                        {exams.map((exam) => (
                          <SelectItem key={exam.id} value={exam.id.toString()}>
                            {exam.exam_type} - {exam.series} {exam.year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="max-w-md mx-auto">
                <div className="relative">
                  <label className="absolute left-3 top-2 text-xs text-muted-foreground pointer-events-none z-10 bg-background px-1">
                    School (Optional)
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={schools.map((school) => ({
                        value: school.id,
                        label: `${school.code} - ${school.name}`,
                      }))}
                      value={validationSchoolId ? validationSchoolId : "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setValidationSchoolId(null);
                        } else {
                          setValidationSchoolId(typeof value === "number" ? value : parseInt(value as string, 10));
                        }
                      }}
                      placeholder="Select a school"
                      disabled={runningValidation || loadingFilterOptions}
                      allowAll={true}
                      allLabel="All schools"
                      searchPlaceholder="Search schools..."
                      emptyMessage="No schools found"
                    />
                  </div>
                </div>
              </div>

              <div className="max-w-md mx-auto">
                <div className="relative">
                  <label className="absolute left-3 top-2 text-xs text-muted-foreground pointer-events-none z-10 bg-background px-1">
                    Subject (Optional)
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={subjects.map((subject) => ({
                        value: subject.id,
                        label: `${subject.code} - ${subject.name}`,
                      }))}
                      value={validationSubjectId ? validationSubjectId : "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setValidationSubjectId(null);
                        } else {
                          setValidationSubjectId(typeof value === "number" ? value : parseInt(value as string, 10));
                        }
                      }}
                      placeholder="Select a subject"
                      disabled={runningValidation || loadingFilterOptions}
                      allowAll={true}
                      allLabel="All subjects"
                      searchPlaceholder="Search subjects..."
                      emptyMessage="No subjects found"
                    />
                  </div>
                </div>
              </div>

              {loadingFilterOptions && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading options...</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={runningValidation}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRunValidation}
                disabled={runningValidation || loadingFilterOptions}
                className="gap-2"
              >
                {runningValidation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Validation
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Issue Detail Modal */}
        <Dialog open={issueModalOpen} onOpenChange={handleCloseIssueModal}>
          <DialogContent className="2xl:max-w-[60vw] min-w-[80vw] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Issue Details</DialogTitle>
              <DialogDescription>
                Review and resolve validation issues
              </DialogDescription>
            </DialogHeader>

            {loadingIssueDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : issueDetail ? (
              <div className="flex gap-6 flex-1 overflow-hidden min-h-0">
                {/* Document Image on Left */}
                {issueDetail.document_id && issueDetail.document_mime_type?.startsWith("image/") && issueDetail.exam_id && (
                  <div className="w-1/2 shrink-0 border-r pr-6 overflow-y-auto flex flex-col">
                    <div className="relative bg-muted rounded-lg overflow-auto flex-1 flex items-center justify-center min-h-0" style={{ minHeight: '400px' }}>
                      {imageError ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <p>Unable to load document image</p>
                        </div>
                      ) : (
                        <>
                          {imageLoading && (
                            <Skeleton className="w-full h-full absolute inset-0 z-10" />
                          )}
                          <img
                            key={`doc-${issueDetail.document_id}-${issueDetail.exam_id}-${issueDetail.id}`}
                            src={`${API_BASE_URL}/api/v1/documents/by-extracted-id/${issueDetail.document_id}/download?exam_id=${issueDetail.exam_id}`}
                            alt={issueDetail.document_file_name || "Document"}
                            className="w-auto h-auto object-contain"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              opacity: imageLoading ? 0 : 1,
                              transition: 'opacity 0.2s ease-in-out'
                            }}
                            loading="lazy"
                            onLoad={() => {
                              setImageLoading(false);
                            }}
                            onError={(e) => {
                              console.error("Image load error:", e);
                              setImageLoading(false);
                              setImageError(true);
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Issue Details on Right */}
                <div className={`space-y-6 py-4 overflow-y-auto flex-1 min-h-0 ${issueDetail.document_id && issueDetail.document_mime_type?.startsWith("image/") && issueDetail.exam_id ? "" : "w-full"}`}>
                {/* Issue Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(issueDetail.status)}
                    {getIssueTypeBadge(issueDetail.issue_type)}
                    <Badge variant="outline" className="text-xs">
                      {getTestTypeLabel(issueDetail.test_type)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Message</p>
                    <p className="text-sm mt-1">{issueDetail.message}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p>{format(new Date(issueDetail.created_at), "MMM d, yyyy HH:mm")}</p>
                    </div>
                    {issueDetail.resolved_at && (
                      <div>
                        <p className="text-muted-foreground">Resolved</p>
                        <p>{format(new Date(issueDetail.resolved_at), "MMM d, yyyy HH:mm")}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Candidate/Subject Info */}
                <div className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold text-sm">Candidate & Subject Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {issueDetail.candidate_name && (
                      <div>
                        <p className="text-muted-foreground">Candidate Name</p>
                        <p className="font-medium">{issueDetail.candidate_name}</p>
                      </div>
                    )}
                    {issueDetail.candidate_index_number && (
                      <div>
                        <p className="text-muted-foreground">Index Number</p>
                        <p className="font-medium">{issueDetail.candidate_index_number}</p>
                      </div>
                    )}
                    {issueDetail.subject_name && (
                      <div>
                        <p className="text-muted-foreground">Subject</p>
                        <p className="font-medium">
                          {issueDetail.subject_code} - {issueDetail.subject_name}
                        </p>
                      </div>
                    )}
                    {issueDetail.exam_type && issueDetail.exam_year && issueDetail.exam_series && (
                      <div>
                        <p className="text-muted-foreground">Exam</p>
                        <p className="font-medium">
                          {issueDetail.exam_type} - {issueDetail.exam_series} {issueDetail.exam_year}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Score Information */}
                <div className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold text-sm">Score Information</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Field</label>
                      <p className="text-sm font-medium mt-1">{getFieldNameLabel(issueDetail.field_name)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Current Score Value</label>
                      <p className="text-sm mt-1 font-mono">
                        {issueDetail.current_score_value ?? <span className="text-muted-foreground">Not set</span>}
                      </p>
                    </div>
                    {issueDetail.status === "pending" && (
                      <div>
                        <label htmlFor="corrected-score" className="text-sm font-medium text-muted-foreground">
                          Corrected Score Value
                        </label>
                        <Input
                          id="corrected-score"
                          value={correctedScore}
                          onChange={(e) => setCorrectedScore(e.target.value)}
                          placeholder="Enter score (e.g., 85, A, AA) or leave empty"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter a numeric value, "A" for absent, "AA" for absent with reason, or leave empty
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Related Document Info (if not showing image) */}
                {issueDetail.document_id && (!issueDetail.document_numeric_id || !issueDetail.document_mime_type?.startsWith("image/")) && (
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="font-semibold text-sm">Related Document</h3>
                    <div className="text-sm">
                      <p className="text-muted-foreground">Document ID</p>
                      <p className="font-mono">{issueDetail.document_id}</p>
                      {issueDetail.document_file_name && (
                        <>
                          <p className="text-muted-foreground mt-2">File Name</p>
                          <p>{issueDetail.document_file_name}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Failed to load issue details
              </div>
            )}

            {issueDetail && issueDetail.status === "pending" && (
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCloseIssueModal}
                  disabled={resolvingIssue || ignoringIssue}
                >
                  Close
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleIgnoreIssue}
                  disabled={resolvingIssue || ignoringIssue}
                  className="gap-2"
                >
                  {ignoringIssue ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ignoring...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Ignore
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleResolveIssue}
                  disabled={resolvingIssue || ignoringIssue}
                  className="gap-2"
                >
                  {resolvingIssue ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Resolve
                    </>
                  )}
                </Button>
              </DialogFooter>
            )}

            {/* Navigation - Below the action buttons */}
            {issueDetail && issues.length > 1 && (
              <div className="flex items-center justify-center gap-4 border-t pt-4 px-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigateIssue("prev")}
                  disabled={currentIssueIndex === 0 || loadingIssueDetail}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Issue {currentIssueIndex !== null ? currentIssueIndex + 1 : 0} of {issues.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNavigateIssue("next")}
                  disabled={currentIssueIndex === null || currentIssueIndex === issues.length - 1 || loadingIssueDetail}
                  className="gap-2"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
