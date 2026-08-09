"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import {
  getCurrentUser,
  getValidationIssues,
  runValidation,
  getAllExams,
  listSchools,
  listSubjects,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type {
  SubjectScoreValidationIssue,
  ValidationIssueStatus,
  ValidationIssueType,
  Exam,
  School,
  Subject,
} from "@/types/document";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ValidationIssueWorkspace } from "@/components/ValidationIssueWorkspace";
import { ValidationIssuesDataTable } from "@/components/ValidationIssuesDataTable";

export default function ValidationIssuesPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [issues, setIssues] = useState<SubjectScoreValidationIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [statusFilter, setStatusFilter] = useState<ValidationIssueStatus | null>(null);
  const [issueTypeFilter, setIssueTypeFilter] = useState<ValidationIssueType | null>(null);
  const [examIdFilter, setExamIdFilter] = useState<number | null>(null);
  const [schoolIdFilter, setSchoolIdFilter] = useState<number | null>(null);
  const [subjectIdFilter, setSubjectIdFilter] = useState<number | null>(null);
  const [testTypeFilter, setTestTypeFilter] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<string | null>(null);

  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runningValidation, setRunningValidation] = useState(false);

  const [validationExamId, setValidationExamId] = useState<number | null>(null);
  const [validationSchoolId, setValidationSchoolId] = useState<number | null>(null);
  const [validationSubjectId, setValidationSubjectId] = useState<number | null>(null);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [currentIssueIndex, setCurrentIssueIndex] = useState<number | null>(null);

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return (a.exam_type || "").localeCompare(b.exam_type || "");
        })
        .map((exam) => {
          const typeLabel =
            exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
          return {
            value: exam.id,
            label: `${exam.year} ${exam.series} ${typeLabel}`,
          };
        }),
    [exams]
  );

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: {
        page: number;
        page_size: number;
        status?: ValidationIssueStatus;
        issue_type?: ValidationIssueType;
        exam_id?: number;
        school_id?: number;
        subject_id?: number;
        test_type?: number;
        subject_type?: string;
      } = {
        page,
        page_size: pageSize,
      };

      if (statusFilter) filters.status = statusFilter;
      if (issueTypeFilter) filters.issue_type = issueTypeFilter;
      if (examIdFilter) filters.exam_id = examIdFilter;
      if (schoolIdFilter) filters.school_id = schoolIdFilter;
      if (subjectIdFilter) filters.subject_id = subjectIdFilter;
      if (testTypeFilter) filters.test_type = testTypeFilter;
      if (subjectTypeFilter) filters.subject_type = subjectTypeFilter;

      const response = await getValidationIssues(filters);
      setIssues(response.issues);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / pageSize));
      setCurrentIssueIndex((idx) => {
        if (idx !== null && idx >= response.issues.length) {
          setIssueModalOpen(false);
          return null;
        }
        return idx;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load validation issues");
      console.error("Error loading validation issues:", err);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    statusFilter,
    issueTypeFilter,
    examIdFilter,
    schoolIdFilter,
    subjectIdFilter,
    testTypeFilter,
    subjectTypeFilter,
  ]);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        if (normalizeRole(user.role) === "DATACLERK") {
          router.replace("/clerk");
          return;
        }
        setAuthorized(true);
      } catch {
        router.replace("/login");
      } finally {
        setAuthChecked(true);
      }
    };
    void checkAccess();
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    loadIssues();
  }, [authorized, loadIssues]);

  const loadFilterOptions = useCallback(async () => {
    setLoadingFilterOptions(true);
    try {
      const allSubjects: Subject[] = [];
      let subjectsPage = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const subjectsData = await listSubjects(subjectsPage, 100);
          allSubjects.push(...subjectsData);
          hasMore = subjectsData.length === 100;
          subjectsPage++;
        } catch (err) {
          console.error("Error loading subjects page:", err);
          hasMore = false;
        }
      }

      const [examsData, schoolsData] = await Promise.all([
        getAllExams().catch((err) => {
          console.error("Error loading exams:", err);
          return [];
        }),
        listSchools(1, 100).catch((err) => {
          console.error("Error loading schools:", err);
          return [];
        }),
      ]);

      setExams(Array.isArray(examsData) ? examsData : []);
      setSchools(Array.isArray(schoolsData) ? schoolsData : []);
      setSubjects(allSubjects);
    } catch (err) {
      console.error("Error loading filter options:", err);
      toast.error("Failed to load filter options");
    } finally {
      setLoadingFilterOptions(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadFilterOptions();
  }, [authorized, loadFilterOptions]);

  useEffect(() => {
    if (runDialogOpen) {
      void loadFilterOptions();
    }
  }, [runDialogOpen, loadFilterOptions]);

  const handleRunValidation = async () => {
    setRunningValidation(true);
    try {
      const request = {
        exam_id: validationExamId || null,
        school_id: validationSchoolId || null,
        subject_id: validationSubjectId || null,
      };

      const result = await runValidation(request);
      toast.success(result.message);
      setRunDialogOpen(false);
      setValidationExamId(null);
      setValidationSchoolId(null);
      setValidationSubjectId(null);
      await loadIssues();
    } catch (err) {
      console.error("Error running validation:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to run validation";
      toast.error(errorMessage);
    } finally {
      setRunningValidation(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setRunDialogOpen(open);
    if (!open) {
      setValidationExamId(null);
      setValidationSchoolId(null);
      setValidationSubjectId(null);
    }
  };

  const handleOpenIssueModal = (_issue: SubjectScoreValidationIssue, index: number) => {
    setCurrentIssueIndex(index);
    setIssueModalOpen(true);
  };

  const handleIssueHandled = (issueId: number) => {
    setIssues((prev) => prev.filter((issue) => issue.id !== issueId));
    setTotal((prev) => Math.max(0, prev - 1));
  };

  const resetPage = () => setPage(1);

  if (!authChecked || !authorized) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        <TopBar title="Validation Issues" />

        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
          <div className="flex items-center justify-end">
            <Button variant="outline" onClick={() => setRunDialogOpen(true)} className="gap-2">
              <Play className="h-4 w-4" />
              Check missing & invalid scores
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative min-w-[280px] flex-1">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
                    Examination
                  </label>
                  <div className="pt-4">
                    <SearchableSelect
                      options={examOptions}
                      value={examIdFilter ? examIdFilter : "all"}
                      onValueChange={(value) => {
                        if (value === "all" || value === "") {
                          setExamIdFilter(null);
                        } else {
                          setExamIdFilter(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
                        }
                        resetPage();
                      }}
                      placeholder="Select an examination"
                      disabled={loadingFilterOptions}
                      allowAll={true}
                      allLabel="All examinations"
                      searchPlaceholder="Search examinations..."
                      emptyMessage="No examinations found"
                    />
                  </div>
                </div>

                <div className="relative min-w-[280px] flex-1">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
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
                          setSchoolIdFilter(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
                        }
                        resetPage();
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

                <div className="relative min-w-[280px] flex-1">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
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
                          setSubjectIdFilter(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
                        }
                        resetPage();
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

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ValidationIssuesDataTable
              issues={issues}
              loading={loading}
              error={error}
              onRowClick={handleOpenIssueModal}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                resetPage();
              }}
              currentPage={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              statusFilter={statusFilter}
              onStatusFilterChange={(value) => {
                setStatusFilter(value);
                resetPage();
              }}
              issueTypeFilter={issueTypeFilter}
              onIssueTypeFilterChange={(value) => {
                setIssueTypeFilter(value);
                resetPage();
              }}
              testTypeFilter={testTypeFilter}
              onTestTypeFilterChange={(value) => {
                setTestTypeFilter(value);
                resetPage();
              }}
              subjectTypeFilter={subjectTypeFilter}
              onSubjectTypeFilterChange={(value) => {
                setSubjectTypeFilter(value);
                resetPage();
              }}
            />
          </Card>
        </div>

        <Dialog open={runDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Run Validation</DialogTitle>
              <DialogDescription>
                Run validation to check for issues in candidate&apos;s subject scores. You can
                optionally filter by exam, school, or subject.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="mx-auto max-w-md">
                <div className="relative">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
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

              <div className="mx-auto max-w-md">
                <div className="relative">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
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
                          setValidationSchoolId(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
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

              <div className="mx-auto max-w-md">
                <div className="relative">
                  <label className="pointer-events-none absolute left-3 top-2 z-10 bg-background px-1 text-xs text-muted-foreground">
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
                          setValidationSubjectId(
                            typeof value === "number" ? value : parseInt(String(value), 10)
                          );
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

        <ValidationIssueWorkspace
          open={issueModalOpen}
          onOpenChange={setIssueModalOpen}
          issues={issues}
          currentIndex={currentIssueIndex}
          onCurrentIndexChange={setCurrentIssueIndex}
          onHandled={handleIssueHandled}
          allowIgnore
        />
      </div>
    </DashboardLayout>
  );
}
