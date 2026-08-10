"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  bulkMarkCertificatesPrinted,
  downloadIssuancePdf,
  getAllExams,
  listCertificateIssuances,
  setIssuanceCertificateNumber,
  voidCertificateIssuance,
} from "@/lib/api";
import type {
  CertificateIssuanceLedgerItem,
  Exam,
} from "@/types/document";
import { ArrowLeft, Download, Loader2, Pencil, Printer, Search, Ban } from "lucide-react";
import { toast } from "sonner";

function examLabel(exam: Exam): string {
  return `${exam.exam_type} · ${exam.series} · ${exam.year}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function IssuanceLedgerPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | "all">("all");
  const [status, setStatus] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CertificateIssuanceLedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCertificateIssuances({
        examId: examId === "all" ? undefined : examId,
        status: status === "all" ? undefined : status,
        search: search || undefined,
        page,
        pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [examId, status, search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.filter((i) => i.status !== "void").map((i) => i.id)));
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkPrint = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      await bulkMarkCertificatesPrinted([...selected], true);
      toast.success(`Marked ${selected.size} as printed`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk print failed");
    } finally {
      setActionLoading(false);
    }
  };

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
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/results/certificates">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Manage certificates
              </Link>
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.size === 0 || actionLoading}
              onClick={handleBulkPrint}
            >
              {actionLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1 h-4 w-4" />
              )}
              Mark printed ({selected.size})
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-72">
              <Label className="mb-1 text-xs text-muted-foreground">Examination</Label>
              <Select
                value={examId === "all" ? "all" : String(examId)}
                onValueChange={(v) => {
                  setPage(1);
                  setExamId(v === "all" ? "all" : Number(v));
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
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
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
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
            </form>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
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
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            items.filter((i) => i.status !== "void").length > 0 &&
                            items
                              .filter((i) => i.status !== "void")
                              .every((i) => selected.has(i.id))
                          }
                          onCheckedChange={(v) => toggleAll(Boolean(v))}
                          aria-label="Select all"
                        />
                      </TableHead>
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
                        <TableCell>
                          <Checkbox
                            checked={selected.has(item.id)}
                            disabled={item.status === "void"}
                            onCheckedChange={(v) => toggleOne(item.id, Boolean(v))}
                            aria-label={`Select ${item.certificate_number || item.index_number}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.certificate_number || (
                            <span className="text-muted-foreground">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.candidate_name}</div>
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
                          <Badge variant="outline">{item.status}</Badge>
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
