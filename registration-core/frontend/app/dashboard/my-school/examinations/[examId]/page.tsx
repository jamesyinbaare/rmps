"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  listAllSchoolExams,
  listSchoolCandidates,
  getSchoolDashboard,
  downloadRegistrationSummary,
  downloadRegistrationDetailed,
} from "@/lib/api";
import type {
  RegistrationCandidate,
  RegistrationExam,
  SchoolDashboardData,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { ExamCandidateStats } from "@/components/school/ExamCandidateStats";
import { SchoolExamCandidatesTable } from "@/components/school/SchoolExamCandidatesTable";
import { isExamRegistrationOpen } from "@/components/school/SchoolExamRegisterCard";
import {
  primaryRegistrationType,
  registrationTypeLabel,
} from "@/lib/school-registration";

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

export default function SchoolExaminationHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const examIdParam = params.examId as string | undefined;
  const examId = examIdParam ? parseInt(examIdParam, 10) : NaN;

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<
    RegistrationCandidate[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(
    null
  );

  const [selectedCandidate, setSelectedCandidate] =
    useState<RegistrationCandidate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  const [downloadingDetailed, setDownloadingDetailed] = useState(false);

  const loadCandidates = useCallback(async (id: number) => {
    setLoadingCandidates(true);
    try {
      const data = await listSchoolCandidates(id);
      setCandidates(data);
      setFilteredCandidates(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load candidates");
      setCandidates([]);
      setFilteredCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    if (!Number.isInteger(examId) || examId <= 0) {
      toast.error("Invalid examination");
      router.replace("/dashboard/my-school/examinations");
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        const [examsData, dashboard] = await Promise.all([
          listAllSchoolExams(),
          getSchoolDashboard(),
        ]);
        setSchoolData(dashboard);
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Examination`;
        }
        const found = examsData.find((e) => e.id === examId);
        if (!found) {
          toast.error("Examination not found for your school");
          router.replace("/dashboard/my-school/examinations");
          return;
        }
        setExam(found);
        await loadCandidates(examId);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load examination");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [examId, router, loadCandidates]);

  const handleFilteredChange = useCallback(
    (rows: RegistrationCandidate[]) => {
      setFilteredCandidates(rows);
    },
    []
  );

  const periodOpen = exam ? isExamRegistrationOpen(exam) : false;

  const handleDownloadSummary = async () => {
    if (!exam) return;
    setDownloadingSummary(true);
    try {
      await downloadRegistrationSummary(exam.id);
      toast.success("Summary PDF downloaded");
    } catch (error) {
      console.error(error);
      toast.error("Failed to download summary PDF");
    } finally {
      setDownloadingSummary(false);
    }
  };

  const handleDownloadDetailed = async () => {
    if (!exam) return;
    setDownloadingDetailed(true);
    try {
      await downloadRegistrationDetailed(exam.id);
      toast.success("Detailed PDF downloaded");
    } catch (error) {
      console.error(error);
      toast.error("Failed to download detailed PDF");
    } finally {
      setDownloadingDetailed(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
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
            <Link href="/dashboard/my-school/examinations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All examinations
            </Link>
          </Button>
        }
        title={examTitle(exam)}
        subtitle={
          schoolData?.school
            ? `${schoolData.school.code} — ${schoolData.school.name}`
            : "Review candidates for this examination"
        }
        actions={
          <>
            <Button
              variant="outline"
              className="shadow-none"
              disabled={downloadingSummary}
              onClick={handleDownloadSummary}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloadingSummary ? "Downloading…" : "Summary PDF"}
            </Button>
            <Button
              variant="outline"
              className="shadow-none"
              disabled={downloadingDetailed}
              onClick={handleDownloadDetailed}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloadingDetailed ? "Downloading…" : "Detailed PDF"}
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
        <Alert className="shadow-none">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Registration is closed for this examination. You can still review
            candidates and download registration lists.
          </AlertDescription>
        </Alert>
      )}

      <ExamCandidateStats
        candidates={candidates}
        loading={loadingCandidates}
      />

      <div>
        <SectionLabel>Registered candidates</SectionLabel>
        <SchoolExamCandidatesTable
          candidates={candidates}
          loading={loadingCandidates}
          onRowClick={(candidate) => {
            setSelectedCandidate(candidate);
            setDetailOpen(true);
          }}
          onFilteredChange={handleFilteredChange}
        />
      </div>

      <CandidateDetailModal
        candidate={selectedCandidate}
        candidates={filteredCandidates}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (open && Number.isInteger(examId) && examId > 0) {
            loadCandidates(examId);
          }
        }}
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
