"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getLatestIndexNumberGenerationStatus, getIndexNumberGenerationStatus } from "@/lib/api";
import { CheckCircle2, XCircle, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import type { IndexNumberGenerationJob, IndexNumberGenerationJobStatus } from "@/types";
import { format } from "date-fns";

interface IndexNumberGenerationProgressProps {
  examId: number;
  jobId?: number | null;
  onComplete?: () => void;
}

export function IndexNumberGenerationProgress({
  examId,
  jobId: initialJobId,
  onComplete,
}: IndexNumberGenerationProgressProps) {
  const [job, setJob] = useState<IndexNumberGenerationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<IndexNumberGenerationJob | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep refs in sync
  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Initial load
  useEffect(() => {
    const loadJobStatus = async () => {
      try {
        setError(null);
        setLoading(true);
        let jobData: IndexNumberGenerationJob | null = null;

        if (initialJobId) {
          // Load specific job
          jobData = await getIndexNumberGenerationStatus(examId, initialJobId);
        } else {
          // Load latest job for exam
          jobData = await getLatestIndexNumberGenerationStatus(examId);
        }

        setJob(jobData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load job status");
      } finally {
        setLoading(false);
      }
    };

    loadJobStatus();
  }, [examId, initialJobId]);

  // Polling effect - only runs when job ID changes, not when status changes
  useEffect(() => {
    const currentJob = jobRef.current;
    if (!currentJob || currentJob.status === "completed" || currentJob.status === "failed") {
      return;
    }

    if (currentJob.status !== "pending" && currentJob.status !== "processing") {
      return;
    }

    const jobIdToPoll = initialJobId || currentJob.id;
    if (!jobIdToPoll) {
      return;
    }

    // Poll every 3 seconds
    const intervalId = setInterval(async () => {
      try {
        const jobData = await getIndexNumberGenerationStatus(examId, jobIdToPoll);
        setJob(jobData);

        // Check status and stop polling if done
        if (jobData.status === "completed" || jobData.status === "failed") {
          if (jobData.status === "completed" && onCompleteRef.current) {
            onCompleteRef.current();
          }
          clearInterval(intervalId);
        }
      } catch (err) {
        // Only set error if it's not a network error (to avoid spamming)
        if (err instanceof Error && !err.message.includes("connect to the server")) {
          setError(err.message);
        }
        // On error, stop polling to avoid infinite retries
        clearInterval(intervalId);
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [examId, initialJobId, job?.id]); // Only depend on job.id, not job.status

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const jobIdToLoad = initialJobId || job?.id;
      let jobData: IndexNumberGenerationJob | null = null;

      if (jobIdToLoad) {
        jobData = await getIndexNumberGenerationStatus(examId, jobIdToLoad);
      } else {
        jobData = await getLatestIndexNumberGenerationStatus(examId);
      }

      setJob(jobData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job status");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: IndexNumberGenerationJobStatus) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-blue-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-500">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    };
  };

  const getSchoolStatusIcon = (status: IndexNumberGenerationJobStatus) => {
    switch (status) {
      case "pending":
        return <div className="h-2 w-2 rounded-full bg-gray-300" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    };
  };

  if (loading && !job) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !job) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={handleRefresh} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground py-8">
            No index number generation job found for this exam.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overallProgress = job.progress_total > 0
    ? (job.progress_current / job.progress_total) * 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Index Number Generation Progress
              {getStatusBadge(job.status)}
            </CardTitle>
            <CardDescription>
              {job.replace_existing
                ? "Regenerating index numbers for all candidates"
                : "Generating index numbers for candidates without index numbers"}
            </CardDescription>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">
              {job.progress_current} / {job.progress_total} candidates
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="text-xs text-muted-foreground">
            {overallProgress.toFixed(1)}% complete
          </div>
        </div>

        {/* Current School */}
        {job.current_school_name && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="font-medium">Currently Processing:</span>
              <span>{job.current_school_name}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {job.error_message && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{job.error_message}</AlertDescription>
          </Alert>
        )}

        {/* School-by-School Progress */}
        {job.school_progress && job.school_progress.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium">School Progress</h4>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {job.school_progress.map((school) => {
                const schoolProgress = school.total > 0
                  ? (school.processed / school.total) * 100
                  : 0;

                return (
                  <div key={school.school_id} className="space-y-2 p-3 border rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getSchoolStatusIcon(school.status)}
                        <div>
                          <div className="font-medium text-sm">{school.school_name}</div>
                          <div className="text-xs text-muted-foreground">{school.school_code}</div>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {school.processed} / {school.total}
                      </div>
                    </div>
                    <Progress value={schoolProgress} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Job Metadata */}
        <div className="pt-4 border-t space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Job ID:</span>
            <span className="font-mono">{job.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Created:</span>
            <span>{format(new Date(job.created_at), "PPpp")}</span>
          </div>
          {job.completed_at && (
            <div className="flex items-center justify-between">
              <span>Completed:</span>
              <span>{format(new Date(job.completed_at), "PPpp")}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Last Updated:</span>
            <span>{format(new Date(job.updated_at), "PPpp")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
