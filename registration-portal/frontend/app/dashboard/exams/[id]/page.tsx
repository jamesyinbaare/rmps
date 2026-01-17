"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  getExam,
  getExamStatistics,
  updateRegistrationPeriod,
  closeRegistrationPeriod,
  generateIndexNumbers,
  exportCandidates,
  listExaminationSchedules,
  deleteExaminationSchedule,
} from "@/lib/api";
import type { ExaminationSchedule, ExamStatistics } from "@/types";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  Download,
  Key,
  XCircle,
  Edit,
  Clock,
  Plus,
  Upload,
  Users as UsersIcon,
  CheckCircle2,
  Building2,
  AlertCircle,
  TrendingUp,
  Info,
} from "lucide-react";
import type { RegistrationExam } from "@/types";
import { UpdateRegistrationPeriodDialog } from "@/components/admin/UpdateRegistrationPeriodDialog";
import { CloseRegistrationDialog } from "@/components/admin/CloseRegistrationDialog";
import { GenerateIndexNumbersDialog } from "@/components/admin/GenerateIndexNumbersDialog";
import { IndexNumberGenerationProgress } from "@/components/admin/IndexNumberGenerationProgress";
import { ExaminationScheduleTable } from "@/components/admin/ExaminationScheduleTable";
import { CreateScheduleDialog } from "@/components/admin/CreateScheduleDialog";
import { EditScheduleDialog } from "@/components/admin/EditScheduleDialog";
import { BulkUploadSchedulesDialog } from "@/components/admin/BulkUploadSchedulesDialog";
import { EditExamDialog } from "@/components/admin/EditExamDialog";

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  // Parse examId from params, defaulting to NaN if invalid
  const examIdParam = params.id as string | undefined;
  const examId = examIdParam ? parseInt(examIdParam, 10) : NaN;

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [generateIndexDialogOpen, setGenerateIndexDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [generatingIndexNumbers, setGeneratingIndexNumbers] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<ExaminationSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [createScheduleDialogOpen, setCreateScheduleDialogOpen] = useState(false);
  const [editScheduleDialogOpen, setEditScheduleDialogOpen] = useState(false);
  const [uploadSchedulesDialogOpen, setUploadSchedulesDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ExaminationSchedule | null>(null);
  const [editExamDialogOpen, setEditExamDialogOpen] = useState(false);
  const [statistics, setStatistics] = useState<ExamStatistics | null>(null);
  const [loadingStatistics, setLoadingStatistics] = useState(true);

  useEffect(() => {
    // Parse examId from params inside effect to ensure params are available
    const currentExamId = examIdParam ? parseInt(examIdParam, 10) : NaN;

    // Only load data if examId is valid
    if (!Number.isInteger(currentExamId) || currentExamId <= 0 || isNaN(currentExamId)) {
      toast.error("Invalid exam ID");
      router.push("/dashboard/exams");
      return;
    }

    const loadExam = async () => {
      setLoading(true);
      try {
        const examData = await getExam(currentExamId);
        setExam(examData);
      } catch (error) {
        toast.error("Failed to load exam data");
        console.error(error);
        router.push("/dashboard/exams");
      } finally {
        setLoading(false);
      }
    };

    const loadSchedules = async () => {
      setLoadingSchedules(true);
      try {
        const schedulesData = await listExaminationSchedules(currentExamId);
        setSchedules(schedulesData);
      } catch (error) {
        toast.error("Failed to load schedules");
        console.error(error);
      } finally {
        setLoadingSchedules(false);
      }
    };

    const loadStatistics = async () => {
      setLoadingStatistics(true);
      try {
        const stats = await getExamStatistics(currentExamId);
        setStatistics(stats);
      } catch (error) {
        console.error("Failed to load statistics:", error);
        // Don't show toast for statistics failure, it's not critical
      } finally {
        setLoadingStatistics(false);
      }
    };

    loadExam();
    loadSchedules();
    loadStatistics();
    // Check if there's a job (completed or in progress) when page loads
    const checkForJob = async () => {
      try {
        const { getLatestIndexNumberGenerationStatus } = await import("@/lib/api");
        const latestJob = await getLatestIndexNumberGenerationStatus(currentExamId);
        if (latestJob) {
          setCurrentJobId(latestJob.id);
        }
      } catch (error) {
        // Silently fail - job might not exist yet
        console.debug("No job found or error checking for job:", error);
      }
    };
    // Delay checking for job to avoid race conditions
    const timeoutId = setTimeout(checkForJob, 500);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examIdParam, router]);

  // Reload functions that can be called from handlers
  const reloadData = async () => {
    if (!exam?.id) return;
    const currentExamId = exam.id;

    try {
      const [examData, schedulesData, stats] = await Promise.all([
        getExam(currentExamId),
        listExaminationSchedules(currentExamId),
        getExamStatistics(currentExamId).catch(() => null), // Don't fail if stats fail
      ]);
      setExam(examData);
      setSchedules(schedulesData);
      if (stats) setStatistics(stats);
    } catch (error) {
      console.error("Failed to reload data:", error);
    }
  };

  const handleCloseRegistration = async () => {
    if (!exam?.id) return;

    setClosing(true);
    try {
      await closeRegistrationPeriod(exam.id);
      toast.success("Registration period closed successfully");
      setCloseDialogOpen(false);
      await reloadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close registration");
    } finally {
      setClosing(false);
    }
  };

  const handleGenerateIndexNumbers = async (replaceExisting: boolean) => {
    if (!exam?.id) return;

    setGeneratingIndexNumbers(true);
    try {
      const result = await generateIndexNumbers(exam.id, replaceExisting);
      toast.success(result.message || "Index number generation has been queued");
      setGenerateIndexDialogOpen(false);
      setCurrentJobId(result.job_id);
      await reloadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate index numbers");
    } finally {
      setGeneratingIndexNumbers(false);
    }
  };

  const handleProgressComplete = () => {
    reloadData();
  };

  const handleExportCandidates = async () => {
    if (!exam?.id) return;

    setExporting(true);
    try {
      await exportCandidates(exam.id);
      toast.success("Candidates data exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export candidates");
    } finally {
      setExporting(false);
    }
  };

  const handleUpdateSuccess = async () => {
    await reloadData();
    setUpdateDialogOpen(false);
  };

  const getRegistrationStatus = (exam: RegistrationExam) => {
    const now = new Date();
    const startDate = new Date(exam.registration_period.registration_start_date);
    const endDate = new Date(exam.registration_period.registration_end_date);

    if (!exam.registration_period.is_active) {
      return { label: "Inactive", color: "bg-gray-100 text-gray-800", variant: "secondary" as const };
    }

    if (now < startDate) {
      return { label: "Upcoming", color: "bg-blue-100 text-blue-800", variant: "default" as const };
    }

    if (now >= startDate && now <= endDate) {
      return { label: "Open", color: "bg-green-100 text-green-800", variant: "default" as const };
    }

    return { label: "Closed", color: "bg-red-100 text-red-800", variant: "destructive" as const };
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
    } else if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Tomorrow";
    } else {
      return `In ${diffDays} days`;
    }
  };

  const getRegistrationProgress = (exam: RegistrationExam) => {
    const now = new Date();
    const startDate = new Date(exam.registration_period.registration_start_date);
    const endDate = new Date(exam.registration_period.registration_end_date);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();

    if (now < startDate) return 0;
    if (now > endDate) return 100;

    return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Exam not found</div>
      </div>
    );
  }

  const status = getRegistrationStatus(exam);
  const isActive = exam.registration_period.is_active;
  const now = new Date();
  const endDate = new Date(exam.registration_period.registration_end_date);
  const isClosed = !isActive || now > endDate;

  const registrationProgress = getRegistrationProgress(exam);

  return (
    <div className="space-y-8">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push("/dashboard/exams")} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Examinations
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {exam.exam_type}{exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}
          </h1>
          {exam.description && (
            <p className="text-muted-foreground mt-2">{exam.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge variant={status.variant} className={`${status.color} text-sm py-1`}>
              {status.label}
            </Badge>
            {exam.results_published && (
              <Badge variant="default" className="bg-green-500 text-white text-sm py-1">
                Results Published
              </Badge>
            )}
            {exam.has_index_numbers && (
              <Badge variant="default" className="bg-blue-500 text-white text-sm py-1">
                Index Numbers Generated
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setUpdateDialogOpen(true)}
            disabled={updating}
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            Update Period
          </Button>
          {isActive && (
            <Button
              variant="destructive"
              onClick={() => setCloseDialogOpen(true)}
              disabled={closing}
              className="gap-2"
            >
              <XCircle className="h-4 w-4" />
              Close Registration
            </Button>
          )}
        </div>
      </div>

      {/* Section Divider */}
      <div className="border-t border-border" />

      {/* Statistics Cards */}
      {loadingStatistics ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : statistics ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Candidates Registered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                  <UsersIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{statistics.total_candidates.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total registrations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved Registrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{statistics.approved_candidates.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {statistics.completion_percentage.toFixed(1)}% completed
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Schools Participating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 dark:bg-purple-900/30 p-2">
                  <Building2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{statistics.schools_count.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Active schools</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Registration Ends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-2">
                  <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  {statistics.days_to_end !== null && statistics.days_to_end !== undefined ? (
                    <>
                      <p className="text-3xl font-bold tracking-tight">{statistics.days_to_end}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {statistics.days_to_end === 1 ? "day remaining" : "days remaining"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold tracking-tight">Ended</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Registration closed</p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Section Divider */}
      <div className="border-t border-border" />

      {/* Exam Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Exam Information</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditExamDialogOpen(true)}
              disabled={(exam.candidate_count ?? 0) > 0}
              title={(exam.candidate_count ?? 0) > 0 ? `Cannot edit: ${exam.candidate_count} candidate(s) registered` : "Edit examination details"}
              className="gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Exam Type</p>
              <p className="text-sm font-medium">{exam.exam_type}</p>
            </div>
            {exam.exam_series && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Series</p>
                <p className="text-sm font-medium">{exam.exam_series}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Year</p>
              <p className="text-sm font-medium">{exam.year}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm font-medium">
                {new Date(exam.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Divider */}
      <div className="border-t border-border" />

      {/* Registration Period */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Registration Period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timeline Progress */}
          {isActive && now >= new Date(exam.registration_period.registration_start_date) && now <= endDate && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Registration Progress</span>
                <span className="font-medium">{Math.round(registrationProgress)}%</span>
              </div>
              <Progress value={registrationProgress} className="h-2" />
              {statistics?.days_to_end !== null && statistics?.days_to_end !== undefined && statistics.days_to_end <= 7 && (
                <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  <span>Registration ends {formatRelativeTime(exam.registration_period.registration_end_date).toLowerCase()}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p className="text-sm font-medium">
                {formatDateTime(exam.registration_period.registration_start_date)}
              </p>
              <p className="text-xs text-muted-foreground">{formatRelativeTime(exam.registration_period.registration_start_date)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">End Date</p>
              <p className="text-sm font-medium">
                {formatDateTime(exam.registration_period.registration_end_date)}
              </p>
              <p className="text-xs text-muted-foreground">{formatRelativeTime(exam.registration_period.registration_end_date)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={status.variant} className={status.color}>
                {status.label}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Active</p>
              <Badge variant={exam.registration_period.is_active ? "default" : "secondary"}>
                {exam.registration_period.is_active ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Bulk Registration</p>
              <Badge variant={exam.registration_period.allows_bulk_registration ? "default" : "secondary"}>
                {exam.registration_period.allows_bulk_registration ? "Allowed" : "Not Allowed"}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Private Registration</p>
              <Badge variant={exam.registration_period.allows_private_registration ? "default" : "secondary"}>
                {exam.registration_period.allows_private_registration ? "Allowed" : "Not Allowed"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Divider */}
      <div className="border-t border-border" />

      {/* Index Number Generation Progress */}
      {currentJobId && exam?.id && (
        <IndexNumberGenerationProgress
          examId={exam.id}
          jobId={currentJobId}
          onComplete={handleProgressComplete}
        />
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Manage registration and export data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleExportCandidates}
              disabled={exporting}
              className="gap-2"
              title="Export candidate data to a file"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export Candidates"}
            </Button>
            {isClosed && (
              <Button
                variant="outline"
                onClick={() => setGenerateIndexDialogOpen(true)}
                disabled={generatingIndexNumbers}
                className="gap-2"
                title="Generate index numbers for registered candidates"
              >
                <Key className="h-4 w-4" />
                Generate Index Numbers
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section Divider */}
      <div className="border-t border-border" />

      {/* Update Registration Period Dialog */}
      {exam && (
        <UpdateRegistrationPeriodDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          exam={exam}
          onSuccess={handleUpdateSuccess}
        />
      )}

      {/* Close Registration Dialog */}
      <CloseRegistrationDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        exam={exam}
        onConfirm={handleCloseRegistration}
        loading={closing}
      />

      {/* Timetable Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Examination Timetable</CardTitle>
              <CardDescription>Manage examination schedules with dates, times, and papers</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setCreateScheduleDialogOpen(true)}
                disabled={loadingSchedules}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Schedule
              </Button>
              <Button
                variant="outline"
                onClick={() => setUploadSchedulesDialogOpen(true)}
                disabled={loadingSchedules}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk Upload
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ExaminationScheduleTable
            schedules={schedules}
            loading={loadingSchedules}
            onEdit={(schedule) => {
              setEditingSchedule(schedule);
              setEditScheduleDialogOpen(true);
            }}
            onDelete={async (scheduleId) => {
              if (!exam?.id) return;
              try {
                await deleteExaminationSchedule(exam.id, scheduleId);
                toast.success("Schedule deleted successfully");
                await reloadData();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to delete schedule");
                throw error;
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Generate Index Numbers Dialog */}
      <GenerateIndexNumbersDialog
        open={generateIndexDialogOpen}
        onOpenChange={setGenerateIndexDialogOpen}
        exam={exam}
        onConfirm={handleGenerateIndexNumbers}
        loading={generatingIndexNumbers}
      />

      {/* Create Schedule Dialog */}
      {exam?.id && (
        <CreateScheduleDialog
          open={createScheduleDialogOpen}
          onOpenChange={setCreateScheduleDialogOpen}
          examId={exam.id}
          onSuccess={reloadData}
        />
      )}

      {/* Bulk Upload Schedules Dialog */}
      {exam?.id && (
        <BulkUploadSchedulesDialog
          open={uploadSchedulesDialogOpen}
          onOpenChange={setUploadSchedulesDialogOpen}
          examId={exam.id}
          onSuccess={reloadData}
        />
      )}

      {/* Edit Schedule Dialog */}
      {editingSchedule && exam?.id && (
        <EditScheduleDialog
          open={editScheduleDialogOpen}
          onOpenChange={(open) => {
            setEditScheduleDialogOpen(open);
            if (!open) {
              setEditingSchedule(null);
            }
          }}
          examId={exam.id}
          schedule={editingSchedule}
          onSuccess={reloadData}
        />
      )}

      {/* Edit Exam Dialog */}
      {exam && (
        <EditExamDialog
          open={editExamDialogOpen}
          onOpenChange={setEditExamDialogOpen}
          exam={exam}
          onSuccess={async () => {
            await reloadData();
          }}
        />
      )}
    </div>
  );
}
