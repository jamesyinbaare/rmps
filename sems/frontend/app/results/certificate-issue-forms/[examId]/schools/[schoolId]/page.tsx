"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { IssueFormCandidatesDataTable } from "@/components/IssueFormCandidatesDataTable";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadCertificateIssueForm,
  listIssueFormCandidates,
} from "@/lib/api";
import type { IssueFormCandidate } from "@/types/document";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CertificateIssueFormReviewPage() {
  const params = useParams();
  const examId = Number(params.examId);
  const schoolId = Number(params.schoolId);

  const [candidates, setCandidates] = useState<IssueFormCandidate[]>([]);
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [examLabel, setExamLabel] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [includeUnnumbered, setIncludeUnnumbered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    if (!examId || !schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listIssueFormCandidates(examId, schoolId, {
        includeUnnumbered: true,
      });
      setCandidates(data.items);
      setTotal(data.total);
      setSchoolCode(data.school_code);
      setSchoolName(data.school_name);
      setExamLabel(data.exam_label);
    } catch (err) {
      setCandidates([]);
      setTotal(0);
      const message =
        err instanceof Error ? err.message : "Failed to load candidates";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [examId, schoolId]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadCertificateIssueForm(examId, schoolId, {
        includeUnnumbered,
      });
      downloadBlob(blob, `issue-form-${schoolCode || schoolId}.pdf`);
      toast.success("Issue form downloaded");
      setDownloadOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const title = schoolCode ? `${schoolCode} — ${schoolName}` : "Issue form";

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} showSearch={false} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
                <Link href="/results/certificate-issue-forms">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Examinations
                </Link>
              </Button>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {examLabel || "Certificate issue form"}
                {!loading && (
                  <>
                    {" "}
                    · {total} candidate{total === 1 ? "" : "s"}
                  </>
                )}
              </p>
            </div>
            <Button
              className="bg-teal-800 hover:bg-teal-700"
              disabled={loading || total === 0}
              onClick={() => {
                setIncludeUnnumbered(false);
                setDownloadOpen(true);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download issue form
            </Button>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <IssueFormCandidatesDataTable
              candidates={candidates}
              loading={loading}
            />
          )}
        </div>
      </div>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download issue form</DialogTitle>
          </DialogHeader>
          <label className="flex items-start gap-2.5 text-sm leading-relaxed">
            <Checkbox
              checked={includeUnnumbered}
              onCheckedChange={(checked) =>
                setIncludeUnnumbered(Boolean(checked))
              }
              className="mt-0.5"
            />
            <span>Include candidates without certificate numbers</span>
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDownloadOpen(false)}
              disabled={downloading}
            >
              Cancel
            </Button>
            <Button
              className="bg-teal-800 hover:bg-teal-700"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
