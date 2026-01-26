"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  getPdfGenerationJob,
  downloadJobSchoolPdf,
  downloadJobAllPdfs,
  mergeJobSchoolPdf,
  cancelPdfGenerationJob,
  type PdfGenerationJob,
} from "@/lib/api";
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function JobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id ? parseInt(params.id as string) : null;

  const [job, setJob] = useState<PdfGenerationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [mergePerSchool, setMergePerSchool] = useState(false);

  const loadJob = async () => {
    if (!jobId) {
      setError("Invalid job ID");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const jobData = await getPdfGenerationJob(jobId);
      setJob(jobData);

      // Start polling if job is pending or processing
      const statusesToPoll = ["pending", "processing"];
      if (statusesToPoll.includes(jobData.status)) {
        setPolling(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job");
      console.error("Failed to load job:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
  }, [jobId]);

  // Poll job status if active
  useEffect(() => {
    if (!job || !polling || !jobId) return;

    const statusesToStopPolling = ["completed", "failed", "cancelled"];
    if (statusesToStopPolling.includes(job.status)) {
      setPolling(false);
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updatedJob = await getPdfGenerationJob(jobId);
        setJob(updatedJob);
      } catch (err) {
        console.error("Failed to poll job status:", err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [job, polling, jobId]);

  const handleDownloadSchool = async (schoolId: number, schoolName: string, schoolCode: string) => {
    if (!jobId) return;

    setDownloading(schoolId);
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
      toast.error(`Failed to download PDF for ${schoolName}`);
      console.error("Download error:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleMergeSchool = async (schoolId: number, schoolName: string, schoolCode: string) => {
    if (!jobId) return;

    try {
      const blob = await mergeJobSchoolPdf(jobId, schoolId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${schoolCode}_${schoolName.replace(/\//g, "_").replace(/\\/g, "_")}_combined_score_sheets.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Merged PDF downloaded for ${schoolName}`);
    } catch (err) {
      toast.error(`Failed to merge PDF for ${schoolName}`);
      console.error("Merge error:", err);
    }
  };

  const handleDownloadAll = async () => {
    if (!jobId) return;

    setDownloading(-1);
    try {
      const blob = await downloadJobAllPdfs(jobId, mergePerSchool);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = mergePerSchool
        ? `job_${jobId}_merged.zip`
        : `job_${jobId}_all_schools.zip`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(mergePerSchool
        ? "Downloaded merged PDFs per school as ZIP"
        : "Downloaded all PDFs as ZIP");
    } catch (err) {
      toast.error("Failed to download all PDFs");
      console.error("Download error:", err);
    } finally {
      setDownloading(null);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;

    if (!confirm("Are you sure you want to cancel this job?")) {
      return;
    }

    setCancelling(true);
    try {
      await cancelPdfGenerationJob(jobId);
      toast.success("Job cancelled successfully");
      loadJob();
    } catch (err) {
      toast.error("Failed to cancel job");
      console.error("Failed to cancel job:", err);
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      processing: "default",
      completed: "default",
      failed: "destructive",
      cancelled: "outline",
    };

    const icons: Record<string, React.ReactNode> = {
      pending: <Clock className="h-3 w-3" />,
      processing: <Loader2 className="h-3 w-3 animate-spin" />,
      completed: <CheckCircle2 className="h-3 w-3" />,
      failed: <AlertCircle className="h-3 w-3" />,
      cancelled: <X className="h-3 w-3" />,
    };

    return (
      <Badge variant={variants[status] || "default"} className="flex items-center gap-1 w-fit">
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <DashboardLayout title="Job Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Loading..." />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          </main>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !job) {
    return (
      <DashboardLayout title="Job Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Error" />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error || "Job not found"}
            </div>
            <Button variant="outline" className="mt-4" onClick={() => router.push("/icm-studio/generate-icms/jobs")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>
          </main>
        </div>
      </DashboardLayout>
    );
  }

  const successfulResults = job.results?.filter(
    (r) => !r.error && ((r.pdf_file_paths && r.pdf_file_paths.length > 0) || r.pdf_file_path)
  ) || [];
  const failedResults = job.results?.filter((r) => r.error) || [];

  return (
    <DashboardLayout title="Job Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={`Job #${job.id}`} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.push("/icm-studio/generate-icms/jobs")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>

            {/* Job Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Job Information
                  </CardTitle>
                  {getStatusBadge(job.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Job ID:</span>
                    <span className="ml-2 font-mono font-medium">{job.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Exam ID:</span>
                    <span className="ml-2 font-medium">{job.exam_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <span className="ml-2">
                      {format(new Date(job.created_at), "MMM d, yyyy HH:mm:ss")}
                    </span>
                  </div>
                  {job.completed_at && (
                    <div>
                      <span className="text-muted-foreground">Completed:</span>
                      <span className="ml-2">
                        {format(new Date(job.completed_at), "MMM d, yyyy HH:mm:ss")}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Schools:</span>
                    <span className="ml-2">
                      {job.school_ids ? `${job.school_ids.length} selected` : "All schools"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subject:</span>
                    <span className="ml-2">{job.subject_id ? `ID: ${job.subject_id}` : "All subjects"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Test Types:</span>
                    <span className="ml-2">
                      {job.test_types.map((t) => (t === 1 ? "Objectives" : "Essay")).join(", ")}
                    </span>
                  </div>
                  {job.template && (
                    <div>
                      <span className="text-muted-foreground">Template:</span>
                      <span className="ml-2 font-medium">
                        {job.template === "new" ? "New" : "Old"}
                      </span>
                    </div>
                  )}
                </div>

                {job.error_message && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{job.error_message}</AlertDescription>
                  </Alert>
                )}

                {/* Progress */}
                {job.status === "processing" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        {job.current_school_name
                          ? `Processing: ${job.current_school_name}`
                          : "Starting..."}
                      </span>
                      <span>
                        {job.progress_current} / {job.progress_total}
                      </span>
                    </div>
                    {job.progress_total > 0 && (
                      <Progress value={(job.progress_current / job.progress_total) * 100} />
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {["pending", "processing"].includes(job.status) && (
                    <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                      {cancelling ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Cancel Job
                        </>
                      )}
                    </Button>
                  )}
                  {job.status === "completed" && successfulResults.length > 0 && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="merge-per-school"
                          checked={mergePerSchool}
                          onCheckedChange={(checked) => setMergePerSchool(checked === true)}
                          disabled={downloading === -1}
                        />
                        <Label
                          htmlFor="merge-per-school"
                          className="text-sm cursor-pointer"
                        >
                          Merge per school
                        </Label>
                      </div>
                      <Button onClick={handleDownloadAll} disabled={downloading === -1}>
                        {downloading === -1 ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Download All ({successfulResults.length} Schools)
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Results Card */}
            {job.results && job.results.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>
                    {successfulResults.length} successful, {failedResults.length} failed
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {job.results.map((result) => (
                      <div
                        key={result.school_id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          {result.error ? (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          <div>
                            <div className="font-medium">{result.school_name}</div>
                            {result.error && (
                              <div className="text-sm text-red-600">{result.error}</div>
                            )}
                          </div>
                        </div>
                        {!result.error && ((result.pdf_file_paths && result.pdf_file_paths.length > 0) || result.pdf_file_path) && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleDownloadSchool(
                                  result.school_id,
                                  result.school_name,
                                  result.school_code
                                )
                              }
                              disabled={downloading === result.school_id}
                            >
                              {downloading === result.school_id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4 mr-2" />
                              )}
                              Download ZIP
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleMergeSchool(
                                  result.school_id,
                                  result.school_name,
                                  result.school_code
                                )
                              }
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Merge PDF
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
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
