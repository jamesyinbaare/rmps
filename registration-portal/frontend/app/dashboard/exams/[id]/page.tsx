"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getExam,
  updateRegistrationPeriod,
  closeRegistrationPeriod,
  generateIndexNumbers,
  exportCandidates,
  listExaminationSchedules,
  deleteExaminationSchedule,
} from "@/lib/api";
import type { ExaminationSchedule } from "@/types";
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

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = parseInt(params.id as string);

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

  const loadExam = async () => {
    if (isNaN(examId)) {
      toast.error("Invalid exam ID");
      router.push("/dashboard/exams");
      return;
    }

    setLoading(true);
    try {
      const examData = await getExam(examId);
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
    if (isNaN(examId)) return;

    setLoadingSchedules(true);
    try {
      const schedulesData = await listExaminationSchedules(examId);
      setSchedules(schedulesData);
    } catch (error) {
      toast.error("Failed to load schedules");
      console.error(error);
    } finally {
      setLoadingSchedules(false);
    }
  };

  useEffect(() => {
    loadExam();
    loadSchedules();
    // Check if there's a job (completed or in progress) when page loads
    const checkForJob = async () => {
      try {
        const { getLatestIndexNumberGenerationStatus } = await import("@/lib/api");
        const latestJob = await getLatestIndexNumberGenerationStatus(examId);
        if (latestJob) {
          setCurrentJobId(latestJob.id);
        }
      } catch (error) {
        // Silently fail - job might not exist yet
        console.debug("No job found or error checking for job:", error);
      }
    };
    if (!isNaN(examId)) {
      // Delay checking for job to avoid race conditions
      const timeoutId = setTimeout(checkForJob, 500);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const handleCloseRegistration = async () => {
    if (!exam) return;

    setClosing(true);
    try {
      await closeRegistrationPeriod(examId);
      toast.success("Registration period closed successfully");
      setCloseDialogOpen(false);
      await loadExam(); // Reload to see updated data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close registration");
    } finally {
      setClosing(false);
    }
  };

  const handleGenerateIndexNumbers = async (replaceExisting: boolean) => {
    if (!exam) return;

    setGeneratingIndexNumbers(true);
    try {
      const result = await generateIndexNumbers(examId, replaceExisting);
      toast.success(result.message || "Index number generation has been queued");
      setGenerateIndexDialogOpen(false);
      setCurrentJobId(result.job_id);
      await loadExam(); // Reload to see updated data
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate index numbers");
    } finally {
      setGeneratingIndexNumbers(false);
    }
  };

  const handleProgressComplete = () => {
    loadExam(); // Reload exam data
  };

  const handleExportCandidates = async () => {
    if (!exam) return;

    setExporting(true);
    try {
      await exportCandidates(examId);
      toast.success("Candidates data exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export candidates");
    } finally {
      setExporting(false);
    }
  };

  const handleUpdateSuccess = async () => {
    await loadExam();
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Loading exam data...</div>
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

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push("/dashboard/exams")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Examinations
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {exam.exam_type} ({exam.exam_series} {exam.year})
          </h1>
          {exam.description && (
            <p className="text-muted-foreground mt-1">{exam.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={status.variant} className={status.color}>
              {status.label}
            </Badge>
            {exam.results_published && (
              <Badge variant="default" className="bg-green-500">
                Results Published
              </Badge>
            )}
            {exam.has_index_numbers && (
              <Badge variant="default" className="bg-blue-500">
                Index Numbers Generated
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setUpdateDialogOpen(true)}
            disabled={updating}
          >
            <Edit className="mr-2 h-4 w-4" />
            Update Period
          </Button>
          {isActive && (
            <Button
              variant="destructive"
              onClick={() => setCloseDialogOpen(true)}
              disabled={closing}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Close Registration
            </Button>
          )}
        </div>
      </div>

      {/* Exam Information */}
      <Card>
        <CardHeader>
          <CardTitle>Exam Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Exam Type</p>
              <p className="text-sm font-medium">{exam.exam_type}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Series</p>
              <p className="text-sm font-medium">{exam.exam_series}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Year</p>
              <p className="text-sm font-medium">{exam.year}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm font-medium">
                {new Date(exam.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registration Period */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Registration Period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p className="text-sm font-medium">
                {formatDateTime(exam.registration_period.registration_start_date)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">End Date</p>
              <p className="text-sm font-medium">
                {formatDateTime(exam.registration_period.registration_end_date)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={status.variant} className={status.color}>
                {status.label}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <Badge variant={exam.registration_period.is_active ? "default" : "secondary"}>
                {exam.registration_period.is_active ? "Yes" : "No"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bulk Registration</p>
              <Badge variant={exam.registration_period.allows_bulk_registration ? "default" : "secondary"}>
                {exam.registration_period.allows_bulk_registration ? "Allowed" : "Not Allowed"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Private Registration</p>
              <Badge variant={exam.registration_period.allows_private_registration ? "default" : "secondary"}>
                {exam.registration_period.allows_private_registration ? "Allowed" : "Not Allowed"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Index Number Generation Progress */}
      {currentJobId && (
        <IndexNumberGenerationProgress
          examId={examId}
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExportCandidates}
              disabled={exporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting..." : "Export Candidates"}
            </Button>
            {isClosed && (
              <Button
                variant="outline"
                onClick={() => setGenerateIndexDialogOpen(true)}
                disabled={generatingIndexNumbers}
              >
                <Key className="mr-2 h-4 w-4" />
                Generate Index Numbers
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
              try {
                await deleteExaminationSchedule(examId, scheduleId);
                toast.success("Schedule deleted successfully");
                await loadSchedules();
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
      <CreateScheduleDialog
        open={createScheduleDialogOpen}
        onOpenChange={setCreateScheduleDialogOpen}
        examId={examId}
        onSuccess={loadSchedules}
      />

      {/* Bulk Upload Schedules Dialog */}
      <BulkUploadSchedulesDialog
        open={uploadSchedulesDialogOpen}
        onOpenChange={setUploadSchedulesDialogOpen}
        examId={examId}
        onSuccess={loadSchedules}
      />

      {/* Edit Schedule Dialog */}
      {editingSchedule && (
        <EditScheduleDialog
          open={editScheduleDialogOpen}
          onOpenChange={(open) => {
            setEditScheduleDialogOpen(open);
            if (!open) {
              setEditingSchedule(null);
            }
          }}
          examId={examId}
          schedule={editingSchedule}
          onSuccess={loadSchedules}
        />
      )}
    </div>
  );
}
