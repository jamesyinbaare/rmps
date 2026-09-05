"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cancelScoreValidationReportJob,
  downloadScoreValidationReportJobFile,
  getScoreValidationReportJob,
  startScoreValidationReportJob,
  type ScoreValidationReportFilters,
  type ScoreValidationReportJobStatus,
} from "@/lib/api";

const JOB_POLL_MS = 1500;
const JOB_STORAGE_KEY = "sems.validation_report.job";

export type ValidationReportFormat = "xlsx" | "pdf";

type StoredJob = { jobId: number; format: ValidationReportFormat };

export type ValidationReportJobDock = {
  jobId: number;
  format: ValidationReportFormat;
  status: ScoreValidationReportJobStatus | null;
  error: string | null;
};

function readStoredJob(): StoredJob | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(JOB_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredJob;
    if (parsed?.jobId && (parsed.format === "xlsx" || parsed.format === "pdf")) {
      return parsed;
    }
  } catch {
    const jobId = parseInt(raw, 10);
    if (!Number.isNaN(jobId)) return { jobId, format: "xlsx" };
  }
  return null;
}

function writeStoredJob(job: StoredJob): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(job));
}

function clearStoredJob(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(JOB_STORAGE_KEY);
}

export function isValidationReportCancelled(
  job: ScoreValidationReportJobStatus | null | undefined
): boolean {
  if (!job) return false;
  if (job.cancelled) return true;
  if (job.status !== "failed") return false;
  if (job.stage === "cancelled") return true;
  const msg = (job.error_message || job.message || "").toLowerCase();
  return msg.includes("cancel");
}

export function validationReportJobStageLabel(
  stage: string | null | undefined,
  status: string | null | undefined,
  cancelled?: boolean
): string {
  if (cancelled || stage === "cancelled" || status === "cancelled") return "Cancelled";
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  switch (stage) {
    case "building":
      return "Building";
    case "rendering":
    case "merging":
      return "Rendering";
    case "zipping":
      return "Packaging";
    case "ready":
      return "Ready";
    case "queued":
    default:
      return "Queued";
  }
}

export function validationReportJobProgress(job: ValidationReportJobDock | null): number {
  const status = job?.status;
  if (!status) return 8;
  if (isValidationReportCancelled(status) || status.status === "failed") return 0;
  if (status.schools_total && status.schools_total > 0) {
    return Math.round(((status.schools_done ?? 0) / status.schools_total) * 100);
  }
  if (status.status === "completed") return 100;
  if (status.stage === "building") return 15;
  if (status.stage === "zipping") return 90;
  return 8;
}

type UseValidationReportJobOptions = {
  /** When true, resume any stored in-flight job. */
  enabled?: boolean;
};

export function useValidationReportJob({ enabled = true }: UseValidationReportJobOptions = {}) {
  const [jobDock, setJobDock] = useState<ValidationReportJobDock | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollCancelRef = useRef(false);
  const autoDownloadedRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    pollCancelRef.current = true;
  }, []);

  const dismiss = useCallback(() => {
    stopPolling();
    clearStoredJob();
    setJobDock(null);
    setCancelling(false);
  }, [stopPolling]);

  const downloadReadyFile = useCallback(async (jobId: number, quiet = false) => {
    try {
      await downloadScoreValidationReportJobFile(jobId);
      if (!quiet) toast.success("Download started");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
      return false;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: number, format: ValidationReportFormat) => {
      pollCancelRef.current = false;
      const maxTransientFailures = 40;
      let transientFailures = 0;
      for (;;) {
        if (pollCancelRef.current) return;
        try {
          const job = await getScoreValidationReportJob(jobId);
          transientFailures = 0;
          setJobDock({ jobId, format, status: job, error: null });

          if (job.status === "completed") {
            clearStoredJob();
            if (autoDownloadedRef.current !== jobId) {
              autoDownloadedRef.current = jobId;
              const ok = await downloadReadyFile(jobId, true);
              toast.success(
                ok
                  ? job.is_zip
                    ? "Zip ready — download started"
                    : "Report ready — download started"
                  : job.is_zip
                    ? "Zip ready — use Download if needed"
                    : "Report ready — use Download if needed"
              );
            }
            return;
          }

          if (job.status === "failed" || isValidationReportCancelled(job)) {
            clearStoredJob();
            if (isValidationReportCancelled(job)) {
              setJobDock({
                jobId,
                format,
                status: job,
                error: null,
              });
              toast.message("Report cancelled");
            } else {
              setJobDock({
                jobId,
                format,
                status: job,
                error: job.error_message || "Report job failed",
              });
            }
            setCancelling(false);
            return;
          }
        } catch (err) {
          transientFailures += 1;
          const message =
            err instanceof Error ? err.message : "Report job status unavailable";
          setJobDock((prev) =>
            prev && prev.jobId === jobId
              ? {
                  ...prev,
                  error:
                    transientFailures > 3
                      ? `Reconnecting… (${message})`
                      : prev.error,
                }
              : prev
          );
          if (transientFailures > maxTransientFailures) {
            clearStoredJob();
            setJobDock({
              jobId,
              format,
              status: null,
              error: message || "Failed to reach the server while checking job status",
            });
            toast.error("Lost connection while generating report — try again");
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
      }
    },
    [downloadReadyFile]
  );

  const startJob = useCallback(
    async (filters: ScoreValidationReportFilters, format: ValidationReportFormat) => {
      const { job_id } = await startScoreValidationReportJob({ ...filters, format });
      writeStoredJob({ jobId: job_id, format });
      autoDownloadedRef.current = null;
      setJobDock({
        jobId: job_id,
        format,
        status: {
          job_id,
          exam_id: filters.exam_id,
          status: "pending",
          message: "Queued…",
          stage: "queued",
        },
        error: null,
      });
      toast.message("Report started in the background");
      void pollJob(job_id, format);
      return job_id;
    },
    [pollJob]
  );

  const cancelJob = useCallback(async () => {
    if (!jobDock) return;
    setCancelling(true);
    try {
      const job = await cancelScoreValidationReportJob(jobDock.jobId);
      setJobDock({
        jobId: jobDock.jobId,
        format: jobDock.format,
        status: job,
        error: null,
      });
      if (job.status === "failed" || isValidationReportCancelled(job)) {
        clearStoredJob();
        stopPolling();
        setCancelling(false);
        toast.message("Report cancelled");
      }
      // Otherwise keep polling until the worker acknowledges cancel.
    } catch (err) {
      setCancelling(false);
      toast.error(err instanceof Error ? err.message : "Could not cancel report");
    }
  }, [jobDock, stopPolling]);

  useEffect(() => {
    if (!enabled) return;
    const stored = readStoredJob();
    if (!stored) return;
    setJobDock({
      jobId: stored.jobId,
      format: stored.format,
      status: null,
      error: null,
    });
    void pollJob(stored.jobId, stored.format);
    return () => {
      pollCancelRef.current = true;
    };
  }, [enabled, pollJob]);

  return {
    jobDock,
    starting,
    setStarting,
    cancelling,
    startJob,
    cancelJob,
    dismiss,
    downloadReadyFile,
    pollJob,
  };
}
