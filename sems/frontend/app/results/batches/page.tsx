"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CertificateBreadcrumbs } from "@/components/certificates/CertificateBreadcrumbs";
import { TableSkeleton } from "@/components/certificates/TableSkeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getExam, listCertificateBatches } from "@/lib/api";
import { examLabel } from "@/components/results/exam-label";
import type { CertificateBatchJob, Exam } from "@/types/document";
import { toast } from "sonner";

function batchBadgeVariant(
  status: CertificateBatchJob["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "processing") return "secondary";
  return "outline";
}

export default function CertificateBatchesPage() {
  const searchParams = useSearchParams();
  const examIdParam = searchParams.get("examId");
  const schoolIdParam = searchParams.get("schoolId");
  const examId = examIdParam ? Number(examIdParam) : undefined;
  const schoolId = schoolIdParam ? Number(schoolIdParam) : undefined;

  const [exam, setExam] = useState<Exam | null>(null);
  const [jobs, setJobs] = useState<CertificateBatchJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, examData] = await Promise.all([
        listCertificateBatches({ examId, schoolId, limit: 100 }),
        examId ? getExam(examId).catch(() => null) : Promise.resolve(null),
      ]);
      setJobs(list.items);
      setExam(examData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, [examId, schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Certificate batches" showSearch={false} />
        <div className="flex-1 overflow-y-auto p-6">
          <CertificateBreadcrumbs
            items={[
              { label: "Certificates", href: "/results/certificates" },
              { label: "Batches" },
            ]}
          />
          <p className="mb-4 text-sm text-muted-foreground">
            {exam
              ? `Recent generate jobs for ${examLabel(exam)}${schoolId ? " at this school" : ""}.`
              : "Recent certificate generate jobs."}
          </p>

          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              No batch jobs found.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead>Examination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/results/batches/${job.id}`}
                          className="hover:underline"
                        >
                          {job.school_code
                            ? `${job.school_code} — ${job.school_name}`
                            : `Job #${job.id}`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {job.exam_label || "—"}
                        {job.programme_name ? ` · ${job.programme_name}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={batchBadgeVariant(job.status)}>{job.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {job.progress_current}/{job.progress_total}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(job.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4">
            <Button variant="outline" size="sm" asChild>
              <Link href="/results/certificates">Manage certificates</Link>
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
