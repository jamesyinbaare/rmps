"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  listAvailableExams,
  listSchoolCandidates,
} from "@/lib/api";
import type {
  RegistrationCandidate,
  RegistrationExam,
  SchoolExamExpectations,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Upload,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  ExamRegistrationWorkspace,
  type WorkbenchTab,
} from "@/components/school/ExamRegistrationWorkspace";
import { CompletionConfirmationPanel } from "@/components/school/CompletionConfirmationPanel";
import {
  CANDIDATE_TABLE_PAGE_SIZES,
  type CandidateTablePageSize,
} from "@/components/school/SchoolExamCandidatesTable";

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

function parseWorkbenchTab(value: string | null): WorkbenchTab {
  return value === "candidates" ? "candidates" : "programme";
}

function parsePageSize(value: string | null): CandidateTablePageSize {
  const n = value ? parseInt(value, 10) : NaN;
  return (CANDIDATE_TABLE_PAGE_SIZES as readonly number[]).includes(n)
    ? (n as CandidateTablePageSize)
    : 20;
}

function parsePageIndex(value: string | null): number {
  const n = value ? parseInt(value, 10) : NaN;
  if (!Number.isInteger(n) || n < 1) return 0;
  return n - 1;
}

export default function ExamRegistrationWorkspacePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const examIdParam = params.examId as string | undefined;
  const examId = examIdParam ? parseInt(examIdParam, 10) : NaN;

  const workbenchTab = parseWorkbenchTab(searchParams.get("tab"));
  const candidatePageIndex = parsePageIndex(searchParams.get("page"));
  const candidatePageSize = parsePageSize(searchParams.get("pageSize"));

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<
    RegistrationCandidate[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [selectedCandidate, setSelectedCandidate] =
    useState<RegistrationCandidate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [registrationLocked, setRegistrationLocked] = useState(false);

  const loadCandidates = useCallback(async (id: number) => {
    setLoadingCandidates(true);
    try {
      const data = await listSchoolCandidates(id);
      setCandidates(data);
      setFilteredCandidates(data);
      setCandidatesLoaded(true);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load candidates");
      setCandidates([]);
      setFilteredCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  const pushHubParams = useCallback(
    (patch: {
      tab?: WorkbenchTab;
      pageIndex?: number;
      pageSize?: number;
    }) => {
      const next = new URLSearchParams(searchParams.toString());
      const tab = patch.tab ?? parseWorkbenchTab(next.get("tab"));
      const pageIndex =
        patch.pageIndex ?? parsePageIndex(next.get("page"));
      const pageSize =
        patch.pageSize ?? parsePageSize(next.get("pageSize"));

      if (tab === "programme") {
        next.delete("tab");
        next.delete("page");
        next.delete("pageSize");
      } else {
        next.set("tab", "candidates");
        if (pageIndex > 0) next.set("page", String(pageIndex + 1));
        else next.delete("page");
        if (pageSize !== 20) next.set("pageSize", String(pageSize));
        else next.delete("pageSize");
      }

      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      const current = searchParams.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      if (href === current) return;
      router.push(href, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleTabChange = useCallback(
    (tab: WorkbenchTab) => {
      pushHubParams({
        tab,
        pageIndex: tab === "candidates" ? candidatePageIndex : 0,
        pageSize: candidatePageSize,
      });
    },
    [pushHubParams, candidatePageIndex, candidatePageSize]
  );

  const handleCandidatePaginationChange = useCallback(
    (pageIndex: number, pageSize: number) => {
      pushHubParams({
        tab: "candidates",
        pageIndex,
        pageSize,
      });
    },
    [pushHubParams]
  );

  const handleCandidatesTabOpen = useCallback(() => {
    if (
      !candidatesLoaded &&
      !loadingCandidates &&
      Number.isInteger(examId) &&
      examId > 0
    ) {
      void loadCandidates(examId);
    }
  }, [candidatesLoaded, loadingCandidates, examId, loadCandidates]);

  useEffect(() => {
    if (workbenchTab === "candidates") {
      handleCandidatesTabOpen();
    }
  }, [workbenchTab, handleCandidatesTabOpen]);

  useEffect(() => {
    if (!Number.isInteger(examId) || examId <= 0) {
      toast.error("Invalid examination");
      router.replace("/dashboard/my-school/register");
      return;
    }

    const init = async () => {
      setLoading(true);
      setCandidates([]);
      setFilteredCandidates([]);
      setCandidatesLoaded(false);
      try {
        const examsData = await listAvailableExams();
        const found = examsData.find((e) => e.id === examId);
        if (!found) {
          toast.error("Examination not available for your school");
          router.replace("/dashboard/my-school/register");
          return;
        }
        setExam(found);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load registration data");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [examId, router]);

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

  const periodOpen =
    exam?.registration_period &&
    exam.registration_period.is_active &&
    new Date() <=
      new Date(exam.registration_period.registration_end_date) &&
    new Date() >=
      new Date(exam.registration_period.registration_start_date);

  const querySuffix = `?exam_id=${examId}`;

  const handleExpectationsUpdated = useCallback(
    (next: SchoolExamExpectations) => {
      setExam((prev) =>
        prev ? { ...prev, expected_total: next.expected_total } : prev
      );
    },
    []
  );

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

  const endDate = exam.registration_period
    ? new Date(
        exam.registration_period.registration_end_date
      ).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const statusLine = periodOpen
    ? endDate
      ? `Open · ends ${endDate}`
      : "Registration open"
    : endDate
      ? `Closed · ended ${endDate}`
      : "Registration closed";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/my-school/register">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Examinations
            </Link>
          </Button>
        }
        title={examTitle(exam)}
        subtitle={statusLine}
        actions={
          <>
            <Button
              variant="outline"
              asChild
              disabled={!periodOpen || registrationLocked}
            >
              <Link href={`/dashboard/my-school/register/bulk${querySuffix}`}>
                <Upload className="mr-2 h-4 w-4" />
                Bulk upload
              </Link>
            </Button>
            <Button asChild disabled={!periodOpen || registrationLocked}>
              <Link href={`/dashboard/my-school/register/new${querySuffix}`}>
                <Plus className="mr-2 h-4 w-4" />
                Register candidate
              </Link>
            </Button>
          </>
        }
      />

      <CompletionConfirmationPanel
        examId={examId}
        enabled={Boolean(exam.requires_completion_confirmation)}
        onLockedChange={setRegistrationLocked}
      />

      <ExamRegistrationWorkspace
        examId={examId}
        onExpectationsUpdated={handleExpectationsUpdated}
        candidates={candidates}
        loadingCandidates={loadingCandidates}
        candidatesLoaded={candidatesLoaded}
        candidateStats={stats}
        tab={workbenchTab}
        onTabChange={handleTabChange}
        candidatePageIndex={candidatePageIndex}
        candidatePageSize={candidatePageSize}
        onCandidatePaginationChange={handleCandidatePaginationChange}
        onCandidatesTabOpen={handleCandidatesTabOpen}
        onCandidateRowClick={(c) => {
          setSelectedCandidate(c);
          setDetailOpen(true);
        }}
        onFilteredChange={setFilteredCandidates}
      />

      <CandidateDetailModal
        candidate={selectedCandidate}
        candidates={filteredCandidates}
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
