"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CertificateBreadcrumbs } from "@/components/certificates/CertificateBreadcrumbs";
import { IssuanceStatusBadge } from "@/components/certificates/issuance-status";
import { TableSkeleton } from "@/components/certificates/TableSkeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { examLabel } from "@/components/results/exam-label";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  getAllExams,
  listCertificateIssuances,
  listExamResultSchools,
  listExamSchoolProgrammes,
  setIssuanceCertificateNumber,
  voidCertificateIssuance,
} from "@/lib/api";
import type {
  CertificateIssuanceLedgerItem,
  Exam,
  ExamProgrammeSummary,
  ExamSchoolSummary,
} from "@/types/document";
import { Download, Pencil, Search, Ban } from "lucide-react";
import { toast } from "sonner";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function IssuanceLedgerInner() {
  const searchParams = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | "all">(() => {
    const raw = searchParams.get("examId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : "all";
  });
  const [schoolId, setSchoolId] = useState<number | "all">(() => {
    const raw = searchParams.get("schoolId");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : "all";
  });
  const [programmeId, setProgrammeId] = useState<number | "all">("all");
  const [schools, setSchools] = useState<ExamSchoolSummary[]>([]);
  const [programmes, setProgrammes] = useState<ExamProgrammeSummary[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 300);
  const [items, setItems] = useState<CertificateIssuanceLedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState<CertificateIssuanceLedgerItem | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [numberTarget, setNumberTarget] = useState<CertificateIssuanceLedgerItem | null>(null);
  const [numberValue, setNumberValue] = useState("");

  useEffect(() => {
    getAllExams()
      .then((list) => setExams([...list].sort((a, b) => b.year - a.year)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (examId === "all") {
      setSchools([]);
      setSchoolId("all");
      setProgrammes([]);
      setProgrammeId("all");
      return;
    }
    listExamResultSchools(examId, {
      page: 1,
      page_size: 200,
      include_counts: false,
    })
      .then(async (data) => {
        let items = data.items;
        if (data.total > items.length) {
          const more = await listExamResultSchools(examId, {
            page: 2,
            page_size: 200,
            include_counts: false,
          });
          items = [...items, ...more.items];
        }
        setSchools(items);
      })
      .catch(() => setSchools([]));
  }, [examId]);

  useEffect(() => {
    if (examId === "all" || schoolId === "all") {
      setProgrammes([]);
      setProgrammeId("all");
      return;
    }
    listExamSchoolProgrammes(examId, schoolId)
      .then(setProgrammes)
      .catch(() => setProgrammes([]));
  }, [examId, schoolId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCertificateIssuances({
        examId: examId === "all" ? undefined : examId,
        schoolId: schoolId === "all" ? undefined : schoolId,
        programmeId: programmeId === "all" ? undefined : programmeId,
        status: status === "all" ? undefined : status,
        search: search || undefined,
        page,
        pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [examId, schoolId, programmeId, status, search, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, examId, schoolId, programmeId, status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setActionLoading(true);
    try {
      await voidCertificateIssuance(voidTarget.id, voidReason.trim());
      toast.success("Certificate voided");
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Void failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (item: CertificateIssuanceLedgerItem) => {
    try {
      const blob = await downloadIssuancePdf(item.id);
      downloadBlob(blob, `${item.certificate_number || `issuance-${item.id}`}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleSaveNumber = async () => {
    if (!numberTarget || !numberValue.trim()) return;
    setActionLoading(true);
    try {
      await setIssuanceCertificateNumber(numberTarget.id, numberValue.trim());
      toast.success("Certificate number saved");
      setNumberTarget(null);
      setNumberValue("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save number");
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Manage certificates · Ledger" showSearch={false} />
        <div className="flex-1 overflow-y-auto p-6">
          <CertificateBreadcrumbs
            items={[
              { label: "Certificates", href: "/results/certificates" },
              { label: "Ledger" },
            ]}
          />

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-72">
              <Label className="mb-1 text-xs text-muted-foreground">Examination</Label>
              <Select
                value={examId === "all" ? "all" : String(examId)}
                onValueChange={(v) => {
                  setPage(1);
                  setExamId(v === "all" ? "all" : Number(v));
                  setSchoolId("all");
                  setProgrammeId("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All exams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All examinations</SelectItem>
                  {exams.map((exam) => (
                    <SelectItem key={exam.id} value={String(exam.id)}>
                      {examLabel(exam)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Label className="mb-1 text-xs text-muted-foreground">School</Label>
              <SearchableSelect
                options={schools.map((s) => ({
                  value: s.school_id,
                  label: `${s.school_code} — ${s.school_name}`,
                }))}
                value={schoolId === "all" ? "all" : schoolId}
                onValueChange={(value) => {
                  setPage(1);
                  if (value === "all" || value === "") setSchoolId("all");
                  else setSchoolId(Number(value));
                  setProgrammeId("all");
                }}
                allowAll
                allLabel="All schools"
                disabled={examId === "all"}
                placeholder="All schools"
              />
            </div>
            <div className="w-56">
              <Label className="mb-1 text-xs text-muted-foreground">Programme</Label>
              <SearchableSelect
                options={programmes.map((p) => ({
                  value: p.programme_id,
                  label: `${p.programme_code} — ${p.programme_name}`,
                }))}
                value={programmeId === "all" ? "all" : programmeId}
                onValueChange={(value) => {
                  setPage(1);
                  if (value === "all" || value === "") setProgrammeId("all");
                  else setProgrammeId(Number(value));
                }}
                allowAll
                allLabel="All programmes"
                disabled={schoolId === "all"}
                placeholder="All programmes"
              />
            </div>
            <div className="w-40">
              <Label className="mb-1 text-xs text-muted-foreground">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setPage(1);
                  setStatus(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="printed">Printed</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                  <SelectItem value="matched_scan">Matched scan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 text-xs text-muted-foreground">Search</Label>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Name, index, or cert #"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              No issuances found.
            </div>
          ) : (
            <>
              <div className="mb-2 text-sm text-muted-foreground">
                {total} issuance{total === 1 ? "" : "s"}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate #</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">
                          {item.certificate_number || (
                            <span className="text-muted-foreground">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/results/certificates/${item.exam_id}/registrations/${item.exam_registration_id}`}
                            className="font-medium hover:underline"
                          >
                            {item.candidate_name}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.index_number}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {item.school_code} — {item.school_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{item.exam_label}</div>
                        </TableCell>
                        <TableCell>
                          <IssuanceStatusBadge
                            status={item.status}
                            certificateNumber={item.certificate_number}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.issuance_date || "—"}
                          {item.printed_at && (
                            <div>Printed {new Date(item.printed_at).toLocaleDateString()}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            {item.status !== "void" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  setNumberTarget(item);
                                  setNumberValue(item.certificate_number || "");
                                }}
                                aria-label="Set certificate number"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleDownload(item)}
                              aria-label="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {item.status !== "void" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive"
                                onClick={() => {
                                  setVoidTarget(item);
                                  setVoidReason("");
                                }}
                                aria-label="Void"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void certificate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Void {voidTarget?.certificate_number || `issuance #${voidTarget?.id}`} for{" "}
            {voidTarget?.candidate_name}. This cannot be undone (reissue from Manage certificates if needed).
          </p>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Printing error"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || actionLoading}
              onClick={handleVoid}
            >
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!numberTarget} onOpenChange={(open) => !open && setNumberTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {numberTarget?.certificate_number ? "Edit certificate number" : "Assign certificate number"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {numberTarget?.candidate_name} · {numberTarget?.index_number}. Leave blank at generate and
            enter the number from the printed stock (or assign later via OCR).
          </p>
          <div className="space-y-2">
            <Label htmlFor="cert-no">Certificate number</Label>
            <Input
              id="cert-no"
              className="font-mono"
              value={numberValue}
              onChange={(e) => setNumberValue(e.target.value)}
              placeholder="Enter number from stock"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNumberTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!numberValue.trim() || actionLoading} onClick={handleSaveNumber}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export default function IssuanceLedgerPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout title="Certificates">
          <TopBar title="Manage certificates · Ledger" showSearch={false} />
          <div className="p-6">
            <TableSkeleton rows={8} cols={6} />
          </div>
        </DashboardLayout>
      }
    >
      <IssuanceLedgerInner />
    </Suspense>
  );
}
