"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CertificateBreadcrumbs } from "@/components/certificates/CertificateBreadcrumbs";
import { IssuanceStatusBadge } from "@/components/certificates/issuance-status";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { examLabel } from "@/components/results/exam-label";
import {
  downloadIssuancePdf,
  generateCertificatePdf,
  getExam,
  getExamRegistrationResultDetail,
  getRegistrationCertificateIssuance,
  previewCertificatePdf,
  setIssuanceCertificateNumber,
} from "@/lib/api";
import type {
  CertificateIssuance,
  Exam,
  ExamRegistrationResultDetail,
} from "@/types/document";
import { Download, Eye, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function gradeBadgeVariant(
  grade: string | null
): "default" | "secondary" | "destructive" | "outline" {
  if (!grade || grade === "Pending") return "secondary";
  if (grade === "Fail" || grade === "Absent" || grade === "Cancelled" || grade === "Blocked") {
    return "destructive";
  }
  if (grade === "Distinction" || grade === "Upper Credit") return "default";
  return "outline";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ManageCertificateCandidatePage() {
  const params = useParams();
  const examId = Number(params.examId);
  const registrationId = Number(params.registrationId);

  const [detail, setDetail] = useState<ExamRegistrationResultDetail | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [issuance, setIssuance] = useState<CertificateIssuance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingNumber, setSavingNumber] = useState(false);
  const [issuanceDate, setIssuanceDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [certificateNumber, setCertificateNumber] = useState("");

  const loadIssuance = useCallback(async () => {
    if (!registrationId) return;
    try {
      const data = await getRegistrationCertificateIssuance(registrationId);
      setIssuance(data);
      if (data?.issuance_date) {
        setIssuanceDate(data.issuance_date);
      }
      if (data?.certificate_number) {
        setCertificateNumber(data.certificate_number);
      }
    } catch {
      setIssuance(null);
    }
  }, [registrationId]);

  useEffect(() => {
    async function load() {
      if (!registrationId) return;
      setLoading(true);
      setError(null);
      try {
        const [data, examData] = await Promise.all([
          getExamRegistrationResultDetail(registrationId),
          examId ? getExam(examId).catch(() => null) : Promise.resolve(null),
          loadIssuance(),
        ]);
        setDetail(data);
        setExam(examData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load candidate");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId, registrationId, loadIssuance]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const blob = await previewCertificatePdf(registrationId, {
        issuanceDate,
        certificateNumber: certificateNumber.trim() || undefined,
      });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateCertificatePdf(registrationId, {
        issuanceDate,
        certificateNumber: certificateNumber.trim() || undefined,
        reissue: Boolean(issuance),
      });
      downloadBlob(
        result.blob,
        `${result.certificateNumber || `issuance-${result.issuanceId || registrationId}`}.pdf`
      );
      toast.success(
        result.certificateNumber
          ? `Certificate ${result.certificateNumber} generated`
          : "Certificate generated (number not assigned yet)"
      );
      await loadIssuance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadIssued = async () => {
    if (!issuance) return;
    setDownloading(true);
    try {
      const blob = await downloadIssuancePdf(issuance.id);
      downloadBlob(
        blob,
        `${issuance.certificate_number || `issuance-${issuance.id}`}.pdf`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveCertificateNumber = async () => {
    if (!issuance) return;
    const value = certificateNumber.trim();
    if (!value) {
      toast.error("Enter a certificate number");
      return;
    }
    setSavingNumber(true);
    try {
      const updated = await setIssuanceCertificateNumber(issuance.id, value);
      setIssuance(updated);
      setCertificateNumber(updated.certificate_number || value);
      toast.success("Certificate number saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save number");
    } finally {
      setSavingNumber(false);
    }
  };

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            detail
              ? `${detail.index_number} — ${detail.candidate_name}`
              : "Candidate certificate"
          }
        />
        <div className="flex-1 overflow-y-auto p-6">
          <CertificateBreadcrumbs
            items={[
              { label: "Certificates", href: "/results/certificates" },
              {
                label: exam ? examLabel(exam) : "Examination",
                href: `/results/certificates/${examId}`,
              },
              {
                label: detail ? `${detail.school_code} — ${detail.school_name}` : "School",
                href: detail
                  ? `/results/certificates/${examId}/schools/${detail.school_id}`
                  : `/results/certificates/${examId}`,
              },
              {
                label: detail
                  ? `${detail.index_number} — ${detail.candidate_name}`
                  : "Candidate",
              },
            ]}
          />
          {!loading && detail && (
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cert-number" className="text-xs text-muted-foreground">
                    Certificate #
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="cert-number"
                      className="h-8 w-40 font-mono text-xs"
                      placeholder="Optional"
                      value={certificateNumber}
                      onChange={(e) => setCertificateNumber(e.target.value)}
                    />
                    {issuance && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8"
                        onClick={handleSaveCertificateNumber}
                        disabled={savingNumber}
                      >
                        {savingNumber ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Save #"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="issuance-date" className="text-xs text-muted-foreground">
                    Completion / issuance date
                  </Label>
                  <Input
                    id="issuance-date"
                    type="date"
                    className="h-8 w-auto"
                    value={issuanceDate}
                    onChange={(e) => setIssuanceDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePreview}>
                  <Eye className="mr-1 h-4 w-4" />
                  Preview
                </Button>
                {issuance ? (
                  <>
                    <Button
                      size="sm"
                      onClick={handleDownloadIssued}
                      disabled={downloading}
                    >
                      {downloading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-1 h-4 w-4" />
                      )}
                      Download PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={generating}
                    >
                      {generating ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-4 w-4" />
                      )}
                      Regenerate
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={handleGenerate} disabled={generating}>
                    {generating ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-4 w-4" />
                    )}
                    Generate & download
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !detail ? null : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <div className="text-xs text-muted-foreground">Index number</div>
                  <div className="font-mono font-medium">{detail.index_number}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">School</div>
                  <div className="font-medium">
                    {detail.school_code} — {detail.school_name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Programme</div>
                  <div className="font-medium">
                    {detail.programme_code
                      ? `${detail.programme_code} — ${detail.programme_name}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Results status</div>
                  <div className="mt-0.5">
                    {detail.is_fully_graded ? (
                      <Badge>
                        Complete ({detail.subjects_graded}/{detail.subjects_registered})
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        Pending ({detail.subjects_pending} of {detail.subjects_registered})
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Certificate</div>
                  <div className="mt-0.5 text-sm">
                    {issuance ? (
                      <>
                        <div className="font-mono text-xs">
                          {issuance.certificate_number || (
                            <span className="text-muted-foreground">Not assigned</span>
                          )}
                        </div>
                        <div className="mt-1">
                          <IssuanceStatusBadge
                            status={issuance.status}
                            certificateNumber={issuance.certificate_number}
                          />
                        </div>
                        {issuance.issuance_date && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Issued {issuance.issuance_date}
                          </div>
                        )}
                        {issuance.printed_at && (
                          <div className="text-xs text-muted-foreground">
                            Printed {new Date(issuance.printed_at).toLocaleString()}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not issued</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-2 text-sm font-medium">Grades</div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.subjects.map((s) => (
                      <TableRow key={s.subject_registration_id}>
                        <TableCell className="font-mono text-sm">{s.subject_code}</TableCell>
                        <TableCell>{s.subject_name}</TableCell>
                        <TableCell>{s.subject_type ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatNum(s.total_score)}</TableCell>
                        <TableCell>
                          <Badge variant={gradeBadgeVariant(s.grade)}>{s.grade ?? "—"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Certificate preview</DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              className="h-[70vh] w-full rounded border"
              title="Certificate preview"
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
