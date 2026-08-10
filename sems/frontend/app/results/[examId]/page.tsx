"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllExams, listExamResultSchools } from "@/lib/api";
import type { Exam, ExamSchoolSummary } from "@/types/document";
import { ArrowLeft, ChevronRight, Loader2, Search } from "lucide-react";

function examLabel(exam: Exam): string {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${typeLabel} — ${exam.series} ${exam.year}`;
}

export default function ResultsExamSchoolsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params.examId);

  const [exam, setExam] = useState<Exam | null>(null);
  const [schools, setSchools] = useState<ExamSchoolSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadExam() {
      try {
        const exams = await getAllExams();
        setExam(exams.find((e) => e.id === examId) ?? null);
      } catch {
        setExam(null);
      }
    }
    if (examId) loadExam();
  }, [examId]);

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
    <DashboardLayout title="Results & Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={exam ? examLabel(exam) : "Schools"} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/results">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Examinations
              </Link>
            </Button>
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search schools..."
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
          ) : schools.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              No schools with registrations for this examination.
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
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schools.map((school) => (
                      <TableRow
                        key={school.school_id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(`/results/${examId}/schools/${school.school_id}`)
                        }
                      >
                        <TableCell className="font-mono text-sm">{school.school_code}</TableCell>
                        <TableCell className="font-medium">{school.school_name}</TableCell>
                        <TableCell>{school.region ?? "—"}</TableCell>
                        <TableCell className="text-right">{school.candidate_count}</TableCell>
                        <TableCell className="text-right">{school.fully_graded_count}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link href={`/results/${examId}/schools/${school.school_id}`}>
                              Results
                              <ChevronRight className="ml-1 h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
