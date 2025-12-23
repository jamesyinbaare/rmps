"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listPdfGenerationJobs,
  cancelPdfGenerationJob,
  deletePdfGenerationJob,
  deleteMultiplePdfGenerationJobs,
  type PdfGenerationJob,
} from "@/lib/api";
import { FileText, Eye, X, Loader2, CheckCircle2, AlertCircle, Clock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";

export default function JobHistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<PdfGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancellingJobId, setCancellingJobId] = useState<number | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [deletingJobIds, setDeletingJobIds] = useState<Set<number>>(new Set());

  const loadJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listPdfGenerationJobs(
        page,
        20,
        statusFilter !== "all" ? statusFilter : undefined
      );
      setJobs(response.items);
      setTotalPages(response.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
      console.error("Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [page, statusFilter]);

  const handleCancel = async (jobId: number) => {
    if (!confirm("Are you sure you want to cancel this job?")) {
      return;
    }

    setCancellingJobId(jobId);
    try {
      await cancelPdfGenerationJob(jobId);
      toast.success("Job cancelled successfully");
      loadJobs();
    } catch (err) {
      toast.error("Failed to cancel job");
      console.error("Failed to cancel job:", err);
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleDelete = async (jobId: number) => {
    if (!confirm("Are you sure you want to delete this job? This action cannot be undone.")) {
      return;
    }

    setDeletingJobIds(new Set([jobId]));
    try {
      await deletePdfGenerationJob(jobId);
      toast.success("Job deleted successfully");
      setSelectedJobIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
      loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete job");
      console.error("Failed to delete job:", err);
    } finally {
      setDeletingJobIds(new Set());
    }
  };

  const handleDeleteMultiple = async () => {
    if (selectedJobIds.size === 0) {
      toast.error("No jobs selected");
      return;
    }

    const jobIdsArray = Array.from(selectedJobIds);
    if (!confirm(`Are you sure you want to delete ${jobIdsArray.length} job(s)? This action cannot be undone.`)) {
      return;
    }

    setDeletingJobIds(new Set(jobIdsArray));
    try {
      await deleteMultiplePdfGenerationJobs(jobIdsArray);
      toast.success(`Successfully deleted ${jobIdsArray.length} job(s)`);
      setSelectedJobIds(new Set());
      loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete jobs");
      console.error("Failed to delete jobs:", err);
    } finally {
      setDeletingJobIds(new Set());
    }
  };

  const handleSelectJob = (jobId: number, checked: boolean) => {
    setSelectedJobIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(jobId);
      } else {
        newSet.delete(jobId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedJobIds(new Set(jobs.map((job) => job.id)));
    } else {
      setSelectedJobIds(new Set());
    }
  };

  const canDeleteJob = (job: PdfGenerationJob) => {
    return ["completed", "failed", "cancelled"].includes(job.status);
  };

  const allSelected = jobs.length > 0 && jobs.every((job) => selectedJobIds.has(job.id));
  const someSelected = jobs.some((job) => selectedJobIds.has(job.id)) && !allSelected;

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

  return (
    <DashboardLayout title="PDF Generation Jobs">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="PDF Generation Jobs" />
        <main className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Job History
                  </CardTitle>
                  <CardDescription>View and manage PDF generation jobs</CardDescription>
                </div>
                <Link href="/home/generate-icms">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Generate New ICMs
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter and Actions */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Status:</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedJobIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteMultiple}
                    disabled={deletingJobIds.size > 0}
                  >
                    {deletingJobIds.size > 0 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedJobIds.size})
                      </>
                    )}
                  </Button>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                  {error}
                </div>
              )}

              {/* Jobs Table */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No jobs found
                </div>
              ) : (
                <>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={handleSelectAll}
                              aria-label="Select all jobs"
                            />
                          </TableHead>
                          <TableHead>ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Exam ID</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job) => {
                          const isSelected = selectedJobIds.has(job.id);
                          const isDeleting = deletingJobIds.has(job.id);
                          const canDelete = canDeleteJob(job);

                          return (
                            <TableRow key={job.id} className={isSelected ? "bg-muted/50" : ""}>
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => handleSelectJob(job.id, checked as boolean)}
                                  disabled={!canDelete}
                                  aria-label={`Select job ${job.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-mono">{job.id}</TableCell>
                              <TableCell>{getStatusBadge(job.status)}</TableCell>
                              <TableCell>{job.exam_id}</TableCell>
                              <TableCell>
                                {job.progress_total > 0
                                  ? `${job.progress_current} / ${job.progress_total}`
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                {format(new Date(job.created_at), "MMM d, yyyy HH:mm")}
                              </TableCell>
                              <TableCell>
                                {job.completed_at
                                  ? format(new Date(job.completed_at), "MMM d, yyyy HH:mm")
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => router.push(`/home/generate-icms/jobs/${job.id}`)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                  {["pending", "processing"].includes(job.status) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleCancel(job.id)}
                                      disabled={cancellingJobId === job.id}
                                    >
                                      {cancellingJobId === job.id ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      ) : (
                                        <X className="h-4 w-4 mr-1" />
                                      )}
                                      Cancel
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(job.id)}
                                      disabled={isDeleting}
                                    >
                                      {isDeleting ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4 mr-1" />
                                      )}
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          Previous
                        </Button>
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
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </DashboardLayout>
  );
}
