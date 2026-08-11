"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CertificateBreadcrumbs } from "@/components/certificates/CertificateBreadcrumbs";
import { TableSkeleton } from "@/components/certificates/TableSkeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { examLabel } from "@/components/results/exam-label";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getExam, listExamResultSchools } from "@/lib/api";
import type { Exam, ExamSchoolSummary } from "@/types/document";
import { Search } from "lucide-react";

export default function ManageCertificatesExamSchoolsPage() {
  const params = useParams();
  const examId = Number(params.examId);

  const [exam, setExam] = useState<Exam | null>(null);
  const [schools, setSchools] = useState<ExamSchoolSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadExam() {
      try {
        setExam(await getExam(examId));
      } catch {
        setExam(null);
      }
    }
    if (examId) loadExam();
  }, [examId]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadSchools = useCallback(async () => {
    if (!examId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listExamResultSchools(examId, {
        page,
        page_size: pageSize,
        search: search || undefined,
      });
      setSchools(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schools");
    } finally {
      setLoading(false);
    }
  }, [examId, page, pageSize, search]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={exam ? examLabel(exam) : "Schools"} showSearch={false} />
        <div className="flex-1 overflow-y-auto p-6">
          <CertificateBreadcrumbs
            items={[
              { label: "Certificates", href: "/results/certificates" },
              { label: exam ? examLabel(exam) : "Examination" },
            ]}
          />
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search schools..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/results/certificates/issuances">Issuance ledger</Link>
            </Button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <TableSkeleton rows={10} cols={5} />
          ) : schools.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              {search
                ? "No schools match this search."
                : "No schools with registrations for this examination."}
            </div>
          ) : (
            <>
              <div className="mb-2 text-sm text-muted-foreground">
                {total} school{total === 1 ? "" : "s"}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead className="text-right">Candidates</TableHead>
                      <TableHead className="text-right">Fully graded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schools.map((school) => {
                      const href = `/results/certificates/${examId}/schools/${school.school_id}`;
                      return (
                        <TableRow key={school.school_id} className="relative">
                          <TableCell className="font-mono text-sm">
                            <Link
                              href={href}
                              className="hover:underline after:absolute after:inset-0"
                              aria-label={`${school.school_code} — ${school.school_name}`}
                            >
                              {school.school_code}
                            </Link>
                          </TableCell>
                          <TableCell className="font-medium">{school.school_name}</TableCell>
                          <TableCell>{school.region ?? "—"}</TableCell>
                          <TableCell className="text-right">{school.candidate_count}</TableCell>
                          <TableCell className="text-right">{school.fully_graded_count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
