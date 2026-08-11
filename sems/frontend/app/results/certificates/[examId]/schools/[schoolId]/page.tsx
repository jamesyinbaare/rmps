"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createCertificateBatch,
  downloadCertificateIssueForm,
  getAllExams,
  listExamSchoolProgrammes,
  listSchoolResults,
} from "@/lib/api";
import type {
  CandidateResultSummary,
  Exam,
  ExamProgrammeSummary,
} from "@/types/document";
import { ArrowLeft, ChevronRight, FileStack, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

function examLabel(exam: Exam): string {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${typeLabel} — ${exam.series} ${exam.year}`;
}

export default function ManageCertificatesSchoolPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params.examId);
  const schoolId = Number(params.schoolId);

  const [exam, setExam] = useState<Exam | null>(null);
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [programmes, setProgrammes] = useState<ExamProgrammeSummary[]>([]);
  const [programmeId, setProgrammeId] = useState<number | undefined>();
  const [candidates, setCandidates] = useState<CandidateResultSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [batchOpen, setBatchOpen] = useState(false);
  const [issuanceDate, setIssuanceDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [onlyFullyGraded, setOnlyFullyGraded] = useState(true);
  const [reissueExisting, setReissueExisting] = useState(false);
  const [batchStarting, setBatchStarting] = useState(false);
  const [issueFormLoading, setIssueFormLoading] = useState(false);
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [includeUnnumbered, setIncludeUnnumbered] = useState(false);

  const fullyGradedCount = useMemo(
    () => candidates.filter((c) => c.is_fully_graded).length,
    [candidates]
  );

  useEffect(() => {
    async function loadMeta() {
      setLoadingFilters(true);
      try {
        const [exams, progs] = await Promise.all([
          getAllExams(),
          listExamSchoolProgrammes(examId, schoolId),
        ]);
        setExam(exams.find((e) => e.id === examId) ?? null);
        setProgrammes(progs);
      } catch {
        /* detail errors handled by results load */
      } finally {
        setLoadingFilters(false);
      }
    }
    if (examId && schoolId) loadMeta();
  }, [examId, schoolId]);

  const loadResults = useCallback(async () => {
    if (!examId || !schoolId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSchoolResults(examId, schoolId, {
        page,
        page_size: pageSize,
        programme_id: programmeId,
        search: search || undefined,
      });
      setCandidates(data.items);
      setTotal(data.total);
      setSchoolCode(data.school_code);
      setSchoolName(data.school_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [examId, schoolId, page, pageSize, programmeId, search]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const handleStartBatch = async () => {
    setBatchStarting(true);
    try {
      const job = await createCertificateBatch({
        exam_id: examId,
        school_id: schoolId,
        programme_id: programmeId ?? null,
        issuance_date: issuanceDate || null,
        only_fully_graded: onlyFullyGraded,
        reissue_existing: reissueExisting,
      });
      toast.success("Certificate batch started");
      setBatchOpen(false);
      router.push(`/results/batches/${job.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start batch");
    } finally {
      setBatchStarting(false);
    }
  };

  const handleDownloadIssueForm = async () => {
    setIssueFormLoading(true);
    try {
      const blob = await downloadCertificateIssueForm(examId, schoolId, {
        includeUnnumbered,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `issue-form-${schoolCode || schoolId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setIssueFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download issue form");
    } finally {
      setIssueFormLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const programmeLabel = programmeId
    ? programmes.find((p) => p.programme_id === programmeId)?.programme_name
    : "All programmes";

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            schoolCode
              ? `${schoolCode} — ${schoolName}`
              : "School certificates"
          }
        />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/results/certificates/${examId}`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {exam ? examLabel(exam) : "Schools"}
              </Link>
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" asChild>
              <Link href="/results/certificates/issuances">Issuance ledger</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIncludeUnnumbered(false);
                setIssueFormOpen(true);
              }}
              disabled={loading}
            >
              Download issue form
            </Button>
            <Button size="sm" onClick={() => setBatchOpen(true)} disabled={loading}>
              <FileStack className="mr-1 h-4 w-4" />
              Generate certificates
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-64">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Programme
              </label>
              <SearchableSelect
                options={programmes.map((p) => ({
                  value: p.programme_id,
                  label: `${p.programme_code} — ${p.programme_name} (${p.candidate_count})`,
                }))}
                value={programmeId ?? ""}
                onValueChange={(value) => {
                  setPage(1);
                  if (value === "all" || value === "") setProgrammeId(undefined);
                  else setProgrammeId(Number(value));
                }}
                allowAll
                allLabel="All programmes"
                disabled={loadingFilters}
                placeholder="Filter by programme"
              />
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Name or index number..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
            </form>
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
          ) : candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              No candidates found for this filter.
            </div>
          ) : (
            <>
              <div className="mb-2 text-sm text-muted-foreground">
                {total} candidate{total === 1 ? "" : "s"}
                {page === 1 && !search
                  ? ` · ${fullyGradedCount} fully graded on this page`
                  : ""}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Index number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Programme</TableHead>
                      <TableHead>Subjects</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => (
                      <TableRow
                        key={c.exam_registration_id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/results/certificates/${examId}/registrations/${c.exam_registration_id}`
                          )
                        }
                      >
                        <TableCell className="font-mono text-xs">{c.index_number}</TableCell>
                        <TableCell className="font-medium">{c.candidate_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.programme_code || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.subjects_graded}/{c.subjects_registered}
                          {c.subjects_pending > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({c.subjects_pending} pending)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.is_fully_graded ? (
                            <Badge>Ready</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate certificates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Batch generate overlay PDFs for{" "}
              <span className="font-medium text-foreground">
                {schoolCode || "this school"}
              </span>
              {programmeLabel ? ` · ${programmeLabel}` : ""}. Default includes only fully
              graded candidates. Certificate numbers are not assigned here — enter them later on
              the ledger (or via OCR after scanning).
            </p>
            <div className="space-y-2">
              <Label htmlFor="batch-date">Completion / issuance date</Label>
              <Input
                id="batch-date"
                type="date"
                value={issuanceDate}
                onChange={(e) => setIssuanceDate(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={onlyFullyGraded}
                onCheckedChange={(checked) => setOnlyFullyGraded(Boolean(checked))}
              />
              Only fully graded candidates
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={reissueExisting}
                onCheckedChange={(checked) => setReissueExisting(Boolean(checked))}
              />
              Reissue if already generated (voids previous)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartBatch} disabled={batchStarting}>
              {batchStarting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileStack className="mr-1 h-4 w-4" />
              )}
              Start batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issueFormOpen} onOpenChange={setIssueFormOpen}>
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
              onClick={() => setIssueFormOpen(false)}
              disabled={issueFormLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleDownloadIssueForm} disabled={issueFormLoading}>
              {issueFormLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
