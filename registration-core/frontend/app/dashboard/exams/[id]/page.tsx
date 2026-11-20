"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  Building2,
  Download,
  Key,
  XCircle,
  Edit,
  Plus,
  Upload,
  AlertCircle,
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
import { ManageEligibleSchoolsDialog } from "@/components/admin/ManageEligibleSchoolsDialog";
import { LateRegistrationWindowsSection } from "@/components/admin/LateRegistrationWindowsSection";
import { ImportCandidatesDialog } from "@/components/admin/ImportCandidatesDialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { StatStrip } from "@/components/dashboard/StatStrip";

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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<ExaminationSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [createScheduleDialogOpen, setCreateScheduleDialogOpen] = useState(false);
  const [editScheduleDialogOpen, setEditScheduleDialogOpen] = useState(false);
  const [uploadSchedulesDialogOpen, setUploadSchedulesDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ExaminationSchedule | null>(null);
  const [editExamDialogOpen, setEditExamDialogOpen] = useState(false);
  const [eligibleSchoolsDialogOpen, setEligibleSchoolsDialogOpen] = useState(false);
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
      return { label: "Inactive", color: "bg-muted text-muted-foreground", variant: "secondary" as const };
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
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
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
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" onClick={() => router.push("/dashboard/exams")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Examinations
          </Button>
        }
        title={`${exam.exam_type}${exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}`}
        subtitle={
          <div className="space-y-2">
            {exam.description ? <p>{exam.description}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
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
        }
        actions={
          <>
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
          </>
        }
      />

      {loadingStatistics ? (
        <div className="grid gap-0 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 border-border p-5 sm:border-l first:border-l-0 md:p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : statistics ? (
        <StatStrip
          items={[
            {
              label: "Candidates Registered",
              value: statistics.total_candidates.toLocaleString(),
              hint: "Total registrations",
            },
            {
              label: "Approved Registrations",
              value: statistics.approved_candidates.toLocaleString(),
              hint: `${statistics.completion_percentage.toFixed(1)}% completed`,
            },
            {
              label: "Schools Participating",
              value: statistics.schools_count.toLocaleString(),
              hint: "Active schools",
            },
            {
              label: "Registration Ends",
              value:
                statistics.days_to_end !== null && statistics.days_to_end !== undefined
                  ? statistics.days_to_end
                  : "Ended",
              hint:
                statistics.days_to_end !== null && statistics.days_to_end !== undefined
                  ? statistics.days_to_end === 1
                    ? "day remaining"
                    : "days remaining"
                  : "Registration closed",
            },
          ]}
        />
      ) : null}

      {/* Eligible schools summary (Llama strip) */}
      <div className="rounded-lg border border-border bg-card p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Eligible schools</p>
            </div>
            {(exam.eligible_school_count ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not configured · Schools cannot register until you select eligible schools.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-medium text-foreground">
                  {(exam.eligible_school_count ?? 0).toLocaleString()}
                </span>{" "}
                school{(exam.eligible_school_count ?? 0) === 1 ? "" : "s"} can register for this
                examination.
              </p>
            )}
          </div>
          <Button
            variant={(exam.eligible_school_count ?? 0) === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setEligibleSchoolsDialogOpen(true)}
            className="shrink-0"
          >
            {(exam.eligible_school_count ?? 0) === 0 ? "Select schools" : "Manage schools"}
          </Button>
        </div>
      </div>

      {/* Exam information */}
      <div className="rounded-lg border border-border bg-card p-5 md:p-6">
        <SectionLabel
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditExamDialogOpen(true)}
              disabled={(exam.candidate_count ?? 0) > 0}
              title={
                (exam.candidate_count ?? 0) > 0
                  ? `Cannot edit: ${exam.candidate_count} candidate(s) registered`
                  : "Edit examination details"
              }
              className="gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit
            </Button>
          }
        >
          Exam information
        </SectionLabel>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Exam type</p>
            <p className="text-sm font-medium">{exam.exam_type}</p>
          </div>
          {exam.exam_series ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Series</p>
              <p className="text-sm font-medium">{exam.exam_series}</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Year</p>
            <p className="font-mono text-sm font-medium">{exam.year}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="text-sm font-medium">{new Date(exam.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Registration period */}
      <div className="rounded-lg border border-border bg-card p-5 md:p-6">
        <SectionLabel>Registration period</SectionLabel>
        {isActive &&
        now >= new Date(exam.registration_period.registration_start_date) &&
        now <= endDate ? (
          <div className="mb-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Registration progress</span>
              <span className="font-mono font-medium">{Math.round(registrationProgress)}%</span>
            </div>
            <Progress value={registrationProgress} className="h-1.5" />
            {statistics?.days_to_end !== null &&
            statistics?.days_to_end !== undefined &&
            statistics.days_to_end <= 7 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-warning" />
                Registration ends{" "}
                {formatRelativeTime(exam.registration_period.registration_end_date).toLowerCase()}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Start date</p>
            <p className="text-sm font-medium">
              {formatDateTime(exam.registration_period.registration_start_date)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(exam.registration_period.registration_start_date)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">End date</p>
            <p className="text-sm font-medium">
              {formatDateTime(exam.registration_period.registration_end_date)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(exam.registration_period.registration_end_date)}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant="outline" className={status.color}>
              {status.label}
            </Badge>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Active</p>
            <Badge variant="outline">
              {exam.registration_period.is_active ? "Yes" : "No"}
            </Badge>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Examination kind</p>
            <Badge variant="outline" className="capitalize">
              {exam.exam_kind || "school"}
            </Badge>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Bulk registration</p>
            <Badge variant="outline">
              {exam.registration_period.allows_bulk_registration ? "Allowed" : "Not allowed"}
            </Badge>
          </div>
          {exam.exam_kind === "school" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Referral registration</p>
              <Badge variant="outline">
                {exam.allows_referral_registration ? "Allowed" : "Not allowed"}
              </Badge>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Individual private portal</p>
              <Badge variant="outline">Open</Badge>
            </div>
          )}
        </div>

        <LateRegistrationWindowsSection examId={exam.id} />
      </div>

      {currentJobId && exam?.id ? (
        <IndexNumberGenerationProgress
          examId={exam.id}
          jobId={currentJobId}
          onComplete={handleProgressComplete}
        />
      ) : null}

      {/* Actions */}
      <div className="rounded-lg border border-border bg-card p-5 md:p-6">
        <SectionLabel>Actions</SectionLabel>
        <p className="mb-4 text-sm text-muted-foreground">
          Manage registration and export data
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCandidates}
            disabled={exporting}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export Candidates"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Import Candidates
          </Button>
          {isClosed ? (
            <Button
              variant="outline"
              onClick={() => setGenerateIndexDialogOpen(true)}
              disabled={generatingIndexNumbers}
              className="gap-2"
            >
              <Key className="h-4 w-4" />
              Generate Index Numbers
            </Button>
          ) : null}
        </div>
      </div>

      {/* Timetable */}
      <div className="rounded-lg border border-border bg-card p-5 md:p-6">
        <SectionLabel
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setCreateScheduleDialogOpen(true)}
                disabled={loadingSchedules}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Schedule
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUploadSchedulesDialogOpen(true)}
                disabled={loadingSchedules}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk Upload
              </Button>
            </div>
          }
        >
          Examination timetable
        </SectionLabel>
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
      </div>

      {exam ? (
        <UpdateRegistrationPeriodDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          exam={exam}
          onSuccess={handleUpdateSuccess}
        />
      ) : null}

      <CloseRegistrationDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        exam={exam}
        onConfirm={handleCloseRegistration}
        loading={closing}
      />

      {exam ? (
        <ImportCandidatesDialog
          examId={exam.id}
          examLabel={exam.year && exam.exam_series ? `${exam.year} ${exam.exam_series}` : undefined}
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onSuccess={reloadData}
        />
      ) : null}

      <ManageEligibleSchoolsDialog
        open={eligibleSchoolsDialogOpen}
        onOpenChange={setEligibleSchoolsDialogOpen}
        examId={exam.id}
        onSaved={(count) => {
          setExam((prev) => (prev ? { ...prev, eligible_school_count: count } : prev));
        }}
      />

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
