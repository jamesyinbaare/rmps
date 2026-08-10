"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  downloadIssuancePdf,
  generateCertificatePdf,
  getExamRegistrationResultDetail,
  getRegistrationCertificateIssuance,
  markCertificatePrinted,
  previewCertificatePdf,
} from "@/lib/api";
import type {
  CertificateIssuance,
  ExamRegistrationResultDetail,
} from "@/types/document";
import { ArrowLeft, Download, Eye, Loader2, Printer } from "lucide-react";
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

export default function RegistrationResultDetailPage() {
  const params = useParams();
  const examId = Number(params.examId);
  const registrationId = Number(params.registrationId);

  const [detail, setDetail] = useState<ExamRegistrationResultDetail | null>(null);
  const [issuance, setIssuance] = useState<CertificateIssuance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [issuanceDate, setIssuanceDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const loadIssuance = useCallback(async () => {
    if (!registrationId) return;
    try {
      const data = await getRegistrationCertificateIssuance(registrationId);
      setIssuance(data);
      if (data?.issuance_date) {
        setIssuanceDate(data.issuance_date);
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
        const data = await getExamRegistrationResultDetail(registrationId);
        setDetail(data);
        await loadIssuance();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load result detail");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [registrationId, loadIssuance]);

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
    setActionLoading(true);
    try {
      const result = await generateCertificatePdf(registrationId, {
        issuanceDate,
      });
      downloadBlob(
        result.blob,
        `${result.certificateNumber || `certificate-${registrationId}`}.pdf`
      );
      toast.success(
        result.certificateNumber
          ? `Certificate ${result.certificateNumber} generated`
          : "Certificate generated"
      );
      await loadIssuance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadIssued = async () => {
    if (!issuance) return;
    setActionLoading(true);
    try {
      const blob = await downloadIssuancePdf(issuance.id);
      downloadBlob(blob, `${issuance.certificate_number}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPrinted = async () => {
    if (!issuance) return;
    setActionLoading(true);
    try {
      const updated = await markCertificatePrinted(issuance.id, true);
      setIssuance(updated);
      toast.success("Marked as printed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark printed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <DashboardLayout title="Results & Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            detail
              ? `${detail.index_number} — ${detail.candidate_name}`
              : "Candidate results"
          }
        />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={
                  detail
                    ? `/results/${examId}/schools/${detail.school_id}`
                    : `/results/${examId}`
                }
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to school results
              </Link>
            </Button>
            <div className="flex-1" />
            {!loading && detail && (
              <>
                <div className="flex items-center gap-2">
                  <Label htmlFor="issuance-date" className="whitespace-nowrap text-xs text-muted-foreground">
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
                <Button variant="outline" size="sm" onClick={handlePreview}>
                  <Eye className="mr-1 h-4 w-4" />
                  Preview certificate
                </Button>
                <Button size="sm" onClick={handleGenerate} disabled={actionLoading}>
                  {actionLoading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-4 w-4" />
                  )}
                  {issuance ? "Re-download / regenerate" : "Generate & download"}
                </Button>
                {issuance && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDownloadIssued}
                      disabled={actionLoading}
                    >
                      Download issued
                    </Button>
                    {issuance.status !== "printed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMarkPrinted}
                        disabled={actionLoading}
                      >
                        <Printer className="mr-1 h-4 w-4" />
                        Mark printed
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

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
                        <div className="font-mono text-xs">{issuance.certificate_number}</div>
                        <Badge variant="outline" className="mt-1">
                          {issuance.status}
                        </Badge>
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

              <Tabs defaultValue="grades">
                <TabsList>
                  <TabsTrigger value="grades">Grades</TabsTrigger>
                  <TabsTrigger value="raw">Raw scores</TabsTrigger>
                  <TabsTrigger value="normalized">Normalized</TabsTrigger>
                </TabsList>

                <TabsContent value="grades" className="mt-4">
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
                </TabsContent>

                <TabsContent value="raw" className="mt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">Obj</TableHead>
                          <TableHead className="text-right">Essay</TableHead>
                          <TableHead className="text-right">Pract</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.subjects.map((s) => (
                          <TableRow key={s.subject_registration_id}>
                            <TableCell className="font-mono text-sm">{s.subject_code}</TableCell>
                            <TableCell>{s.subject_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.obj_raw_score ?? "—"}
                              {s.obj_max_score != null ? (
                                <span className="text-muted-foreground"> / {s.obj_max_score}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.essay_raw_score ?? "—"}
                              {s.essay_max_score != null ? (
                                <span className="text-muted-foreground"> / {s.essay_max_score}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.pract_raw_score ?? "—"}
                              {s.pract_max_score != null ? (
                                <span className="text-muted-foreground"> / {s.pract_max_score}</span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="normalized" className="mt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">Obj</TableHead>
                          <TableHead className="text-right">Essay</TableHead>
                          <TableHead className="text-right">Pract</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.subjects.map((s) => (
                          <TableRow key={s.subject_registration_id}>
                            <TableCell className="font-mono text-sm">{s.subject_code}</TableCell>
                            <TableCell>{s.subject_name}</TableCell>
                            <TableCell className="text-right">{formatNum(s.obj_normalized)}</TableCell>
                            <TableCell className="text-right">{formatNum(s.essay_normalized)}</TableCell>
                            <TableCell className="text-right">{formatNum(s.pract_normalized)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatNum(s.total_score)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={gradeBadgeVariant(s.grade)}>{s.grade ?? "—"}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
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
