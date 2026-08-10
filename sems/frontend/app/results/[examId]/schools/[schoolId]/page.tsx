"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAllExams,
  listExamSchoolProgrammes,
  listSchoolResults,
} from "@/lib/api";
import type {
  CandidateResultSummary,
  Exam,
  ExamProgrammeSummary,
} from "@/types/document";
import { ArrowLeft, ChevronRight, Loader2, Search } from "lucide-react";

function examLabel(exam: Exam): string {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${typeLabel} — ${exam.series} ${exam.year}`;
}

export default function SchoolResultsPage() {
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
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [examId, schoolId, page, pageSize, programmeId, search]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardLayout title="Results & Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            schoolCode
              ? `${schoolCode} — ${schoolName}`
              : "School results"
          }
        />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/results/${examId}`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {exam ? examLabel(exam) : "Schools"}
              </Link>
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
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Index number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Programme</TableHead>
                      <TableHead className="text-right">Subjects</TableHead>
                      <TableHead className="text-right">Graded</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => (
                      <TableRow
                        key={c.exam_registration_id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/results/${examId}/registrations/${c.exam_registration_id}`
                          )
                        }
                      >
                        <TableCell className="font-mono text-sm">{c.index_number}</TableCell>
                        <TableCell className="font-medium">{c.candidate_name}</TableCell>
                        <TableCell>
                          {c.programme_code
                            ? `${c.programme_code} — ${c.programme_name}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">{c.subjects_registered}</TableCell>
                        <TableCell className="text-right">{c.subjects_graded}</TableCell>
                        <TableCell className="text-right">{c.subjects_pending}</TableCell>
                        <TableCell>
                          {c.is_fully_graded ? (
                            <Badge variant="default">Complete</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={`/results/${examId}/registrations/${c.exam_registration_id}`}
                            >
                              Detail
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
