"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelCertificateBatch,
  downloadCertificateBatchZip,
  getCertificateBatch,
} from "@/lib/api";
import type { CertificateBatchJob } from "@/types/document";
import { ArrowLeft, Download, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

function statusVariant(
  status: CertificateBatchJob["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "processing") return "secondary";
  return "outline";
}

export default function CertificateBatchJobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.jobId);
  const [job, setJob] = useState<CertificateBatchJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getCertificateBatch(jobId);
      setJob(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load batch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!job) return;
    if (job.status !== "pending" && job.status !== "processing") return;
    const t = setInterval(() => {
      void load();
    }, 2000);
    return () => clearInterval(t);
  }, [job, load]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadCertificateBatchZip(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-batch-${jobId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const updated = await cancelCertificateBatch(jobId);
      setJob(updated);
      toast.success("Batch cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  const pct =
    job && job.progress_total > 0
      ? Math.round((job.progress_current / job.progress_total) * 100)
      : 0;

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Certificate batch" showSearch={false} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={
                  job
                    ? `/results/certificates/${job.exam_id}/schools/${job.school_id}`
                    : "/results/certificates"
                }
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/results/certificates/issuances">Issuance ledger</Link>
            </Button>
            <div className="flex-1" />
            {job?.status === "completed" && (
              <Button size="sm" onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1 h-4 w-4" />
                )}
                Download ZIP
              </Button>
            )}
            {(job?.status === "pending" || job?.status === "processing") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-1 h-4 w-4" />
                )}
                Cancel
              </Button>
            )}
          </div>

          {loading || !job ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-medium">
                      {job.school_code} — {job.school_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {job.exam_label}
                      {job.programme_name ? ` · ${job.programme_name}` : " · All programmes"}
                    </div>
                  </div>
                  <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {job.progress_current} / {job.progress_total}
                      {job.current_candidate_name
                        ? ` · ${job.current_candidate_name}`
                        : ""}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>

                {job.error_message && (
                  <p className="mt-3 text-sm text-destructive">{job.error_message}</p>
                )}

                {job.results && (
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>Generated: {job.results.generated_count ?? 0}</span>
                    <span>Skipped: {job.results.skipped_count ?? 0}</span>
                    <span>Errors: {job.results.error_count ?? 0}</span>
                  </div>
                )}
              </div>

              {job.results?.items && job.results.items.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Index</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Certificate #</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {job.results.items.map((item, idx) => (
                        <TableRow key={`${item.exam_registration_id}-${idx}`}>
                          <TableCell className="font-mono text-xs">
                            {item.index_number || "—"}
                          </TableCell>
                          <TableCell>{item.candidate_name || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.certificate_number || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                            {item.error || ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/results/certificates/issuances")}
                >
                  Open ledger
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
