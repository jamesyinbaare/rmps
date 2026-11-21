"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  listAvailableExams,
  listSchoolCandidates,
  getSchoolDashboard,
} from "@/lib/api";
import type {
  RegistrationCandidate,
  RegistrationExam,
  SchoolDashboardData,
  SchoolExamExpectations,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Upload,
  Search,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { RegistrationExpectationsPanel } from "@/components/school/RegistrationExpectationsPanel";
import {
  primaryRegistrationType,
  registrationTypeLabel,
} from "@/lib/school-registration";
import {
  registrationStatusBadgeClass,
  registrationStatusLabel,
} from "@/lib/registration-status";
import { cn } from "@/lib/utils";

type SortKey = "name" | "status" | "type" | "programme";
type SortDir = "asc" | "desc";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "INCOMPLETE", label: "Incomplete" },
  { value: "COMPLETE", label: "Complete" },
  { value: "DRAFT", label: "Draft" },
] as const;

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

export default function ExamRegistrationWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const examIdParam = params.examId as string | undefined;
  const examId = examIdParam ? parseInt(examIdParam, 10) : NaN;
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedCandidate, setSelectedCandidate] =
    useState<RegistrationCandidate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expectations, setExpectations] =
    useState<SchoolExamExpectations | null>(null);

  const loadCandidates = useCallback(async (id: number) => {
    setLoadingCandidates(true);
    try {
      const data = await listSchoolCandidates(id);
      setCandidates(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load candidates");
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    if (!Number.isInteger(examId) || examId <= 0) {
      toast.error("Invalid examination");
      router.replace("/dashboard/my-school/register");
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        const [examsData, dashboard] = await Promise.all([
          listAvailableExams(),
          getSchoolDashboard(),
        ]);
        setSchoolData(dashboard);
        const found = examsData.find((e) => e.id === examId);
        if (!found) {
          toast.error("Examination not available for your school");
          router.replace("/dashboard/my-school/register");
          return;
        }
        setExam(found);
        await loadCandidates(examId);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load registration data");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [examId, router, loadCandidates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stats = useMemo(() => {
    const total = candidates.length;
    const complete = candidates.filter(
      (c) => c.registration_status === "COMPLETE"
    ).length;
    const incomplete = candidates.filter(
      (c) => c.registration_status === "INCOMPLETE"
    ).length;
    return { total, complete, incomplete };
  }, [candidates]);

  const filtered = useMemo(() => {
    let rows = [...candidates];
    if (statusFilter !== "all") {
      rows = rows.filter((c) => c.registration_status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) => {
        const name =
          `${c.firstname} ${c.lastname} ${c.othername || ""}`.toLowerCase();
        return (
          name.includes(q) ||
          (c.registration_number || "").toLowerCase().includes(q) ||
          (c.index_number || "").toLowerCase().includes(q) ||
          (c.programme_code || "").toLowerCase().includes(q)
        );
      });
    }
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = `${a.firstname} ${a.lastname}`.localeCompare(
          `${b.firstname} ${b.lastname}`
        );
      } else if (sortKey === "status") {
        cmp = (a.registration_status || "").localeCompare(
          b.registration_status || ""
        );
      } else if (sortKey === "type") {
        cmp = (a.registration_type || "").localeCompare(
          b.registration_type || ""
        );
      } else {
        cmp = (a.programme_code || "").localeCompare(b.programme_code || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [candidates, statusFilter, searchQuery, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 h-3.5 w-3.5" />
    );
  };

  const periodOpen =
    exam?.registration_period &&
    exam.registration_period.is_active &&
    new Date() <=
      new Date(exam.registration_period.registration_end_date) &&
    new Date() >=
      new Date(exam.registration_period.registration_start_date);

  const querySuffix = `?exam_id=${examId}`;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Examination not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/my-school/register">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All examinations
            </Link>
          </Button>
        }
        title={examTitle(exam)}
        subtitle={
          schoolData?.school
            ? `${schoolData.school.code} — ${schoolData.school.name}`
            : "Register candidates for this examination"
        }
        actions={
          <>
            <Button variant="outline" asChild disabled={!periodOpen}>
              <Link href={`/dashboard/my-school/register/bulk${querySuffix}`}>
                <Upload className="mr-2 h-4 w-4" />
                Bulk upload
              </Link>
            </Button>
            <Button asChild disabled={!periodOpen}>
              <Link href={`/dashboard/my-school/register/new${querySuffix}`}>
                <Plus className="mr-2 h-4 w-4" />
                Register candidate
              </Link>
            </Button>
          </>
        }
      />

      <div className="rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={periodOpen ? "default" : "secondary"}>
            {periodOpen ? "Registration open" : "Registration closed"}
          </Badge>
          {exam.exam_kind === "private" ? (
            <Badge variant="outline">Private exam</Badge>
          ) : (
            <Badge variant="outline">
              Default: {registrationTypeLabel(primaryRegistrationType(exam))}
            </Badge>
          )}
        </div>
        {exam.registration_period && (
          <p className="mt-3 text-xs text-muted-foreground">
            Period:{" "}
            {new Date(
              exam.registration_period.registration_start_date
            ).toLocaleDateString()}{" "}
            –{" "}
            {new Date(
              exam.registration_period.registration_end_date
            ).toLocaleDateString()}
          </p>
        )}
      </div>

      {!periodOpen && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Registration is closed for this examination. You can still review
            candidates below.
          </AlertDescription>
        </Alert>
      )}

      <StatStrip
        items={[
          {
            label: "Registered",
            value: loadingCandidates ? "—" : stats.total,
            hint: (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> Candidates
              </span>
            ),
          },
          {
            label: "Complete",
            value: loadingCandidates ? "—" : stats.complete,
            hint: (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Photo + fee OK
              </span>
            ),
          },
          {
            label: "Incomplete",
            value: loadingCandidates ? "—" : stats.incomplete,
            hint: (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> Missing photo or fee
              </span>
            ),
          },
          {
            label: "Expected",
            value:
              expectations?.expected_total != null
                ? expectations.expected_total.toLocaleString()
                : "—",
            hint: (
              <span className="inline-flex items-center gap-1">
                <Target className="h-3 w-3" />
                {!expectations?.has_declaration ||
                expectations.expected_total == null
                  ? "Not set"
                  : expectations.total_over
                    ? "Over expected"
                    : expectations.total_under
                      ? "Under expected"
                      : "On target"}
              </span>
            ),
          },
        ]}
      />

      <RegistrationExpectationsPanel
        examId={examId}
        onUpdated={(next) => {
          setExpectations(next);
          setExam((prev) =>
            prev ? { ...prev, expected_total: next.expected_total } : prev
          );
        }}
      />

      <div>
        <SectionLabel>Registered candidates</SectionLabel>
        <div className="rounded-lg border border-border bg-card shadow-none">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, reg no, programme…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={statusFilter === f.value ? "default" : "outline"}
                  className="shadow-none"
                  onClick={() => {
                    setStatusFilter(f.value);
                    setPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("name")}
                    >
                      Name
                      <SortIcon column="name" />
                    </button>
                  </TableHead>
                  <TableHead>Reg. number</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("programme")}
                    >
                      Programme
                      <SortIcon column="programme" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("type")}
                    >
                      Type
                      <SortIcon column="type" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium"
                      onClick={() => toggleSort("status")}
                    >
                      Status
                      <SortIcon column="status" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCandidates ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Loading candidates…
                    </TableCell>
                  </TableRow>
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No candidates match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedCandidate(c);
                        setDetailOpen(true);
                      }}
                    >
                      <TableCell className="font-medium">
                        {c.firstname} {c.lastname}
                        {c.othername ? ` ${c.othername}` : ""}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {c.registration_number || "—"}
                      </TableCell>
                      <TableCell>{c.programme_code || "—"}</TableCell>
                      <TableCell>
                        {registrationTypeLabel(c.registration_type)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "shadow-none",
                            registrationStatusBadgeClass(c.registration_status || "")
                          )}
                        >
                          {registrationStatusLabel(c.registration_status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filtered.length > pageSize && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CandidateDetailModal
        candidate={selectedCandidate}
        candidates={filtered}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCandidateChange={(updated) => {
          setSelectedCandidate(updated);
          setCandidates((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
        }}
      />
    </div>
  );
}
