"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Files,
  FolderOpen,
  LayoutList,
  Percent,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { compareSheetIds, getAllExams, listDocuments } from "@/lib/api";
import type { Exam, SheetIdComparisonResponse } from "@/types/document";
import { cn } from "@/lib/utils";

type DocStats = {
  total: number;
  pending: number;
  failed: number;
  loading: boolean;
};

function formatExamLabel(exam: Exam) {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${exam.year} ${exam.series} · ${typeLabel}`;
}

function docsHref(examId: number, status?: "pending" | "error") {
  const params = new URLSearchParams();
  params.set("exam_id", String(examId));
  if (status) params.set("id_extraction_status", status);
  return `/icm-studio/documents?${params.toString()}`;
}

function trackHref(examId: number, tab?: "expected" | "uploaded" | "missing" | "extra") {
  const params = new URLSearchParams();
  params.set("exam_id", String(examId));
  if (tab) params.set("tab", tab);
  return `/icm-studio/track-icms?${params.toString()}`;
}

export default function ICMStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examIdFromUrl = searchParams.get("exam_id");

  const [exams, setExams] = useState<Exam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(
    examIdFromUrl ? parseInt(examIdFromUrl, 10) : null
  );
  const [stats, setStats] = useState<DocStats>({
    total: 0,
    pending: 0,
    failed: 0,
    loading: true,
  });
  const [sheetComparison, setSheetComparison] = useState<SheetIdComparisonResponse | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadExams = async () => {
      setExamsLoading(true);
      try {
        const allExams = await getAllExams();
        if (cancelled) return;
        setExams(allExams);

        const urlId = examIdFromUrl ? parseInt(examIdFromUrl, 10) : NaN;
        if (!Number.isNaN(urlId) && allExams.some((e) => e.id === urlId)) {
          setSelectedExamId(urlId);
        } else if (allExams.length > 0) {
          const newestExam = allExams.reduce((newest, current) => {
            return new Date(current.created_at) > new Date(newest.created_at) ? current : newest;
          });
          setSelectedExamId((prev) => prev ?? newestExam.id);
        } else {
          setSelectedExamId(null);
        }
      } catch (error) {
        console.error("Error loading exams:", error);
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    };
    void loadExams();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep exam_id in the URL for refresh/share
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedExamId) params.set("exam_id", String(selectedExamId));
    const qs = params.toString();
    router.replace(`/icm-studio${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [selectedExamId, router]);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      if (!selectedExamId) {
        setStats({ total: 0, pending: 0, failed: 0, loading: false });
        setSheetComparison(null);
        setStatsError(null);
        setSheetLoading(false);
        return;
      }

      setStats((prev) => ({ ...prev, loading: true }));
      setSheetLoading(true);
      setStatsError(null);

      try {
        const [totalRes, pendingRes, failedRes, comparison] = await Promise.all([
          listDocuments({ exam_id: selectedExamId, page: 1, page_size: 1 }),
          listDocuments({
            exam_id: selectedExamId,
            id_extraction_status: "pending",
            page: 1,
            page_size: 1,
          }),
          listDocuments({
            exam_id: selectedExamId,
            id_extraction_status: "error",
            page: 1,
            page_size: 1,
          }),
          compareSheetIds(selectedExamId),
        ]);

        if (cancelled) return;

        setStats({
          total: totalRes.total,
          pending: pendingRes.total,
          failed: failedRes.total,
          loading: false,
        });
        setSheetComparison(comparison);
      } catch (error) {
        console.error("Error loading dashboard stats:", error);
        if (!cancelled) {
          setStats((prev) => ({ ...prev, loading: false }));
          setSheetComparison(null);
          setStatsError(
            error instanceof Error ? error.message : "Failed to load sheet coverage."
          );
        }
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId, retryToken]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);
  const examId = selectedExamId;

  const sheetMetrics = useMemo(() => {
    const expected = sheetComparison?.total_expected_sheets ?? 0;
    const uploaded = sheetComparison?.total_uploaded_sheets ?? 0;
    const missing =
      sheetComparison?.missing_sheet_ids_info?.length ??
      sheetComparison?.missing_sheet_ids?.length ??
      0;
    const extra =
      sheetComparison?.extra_sheet_ids_info?.length ??
      sheetComparison?.extra_sheet_ids?.length ??
      0;
    const coverage = expected > 0 ? (uploaded / expected) * 100 : 0;
    return { expected, uploaded, missing, extra, coverage };
  }, [sheetComparison]);

  const loading = stats.loading || sheetLoading;

  const kpiCards = examId
    ? [
        {
          title: "Coverage",
          value: `${sheetMetrics.coverage.toFixed(1)}%`,
          caption: `${sheetMetrics.uploaded.toLocaleString()} of ${sheetMetrics.expected.toLocaleString()} expected`,
          href: trackHref(examId),
          icon: Percent,
          accent: "border-l-[#00853f] bg-[#00853f]/5",
          iconWell: "bg-[#00853f]/15 text-[#00853f]",
          valueClass: "text-[#00853f]",
          progress: sheetMetrics.coverage,
          showProgress: true,
        },
        {
          title: "Missing",
          value: sheetMetrics.missing.toLocaleString(),
          caption: "Expected but not uploaded",
          href: trackHref(examId, "missing"),
          icon: AlertCircle,
          accent: "border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/40",
          iconWell: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          valueClass: "text-amber-800 dark:text-amber-300",
          emphasize: true,
        },
        {
          title: "Uploaded",
          value: sheetMetrics.uploaded.toLocaleString(),
          caption: "Matched sheet IDs",
          href: trackHref(examId, "uploaded"),
          icon: CheckCircle2,
          accent: "border-l-[#003764] bg-[#003764]/5",
          iconWell: "bg-[#003764]/15 text-[#003764] dark:text-[#5b9bd5]",
          valueClass: "text-[#003764] dark:text-[#5b9bd5]",
        },
        {
          title: "Extra",
          value: sheetMetrics.extra.toLocaleString(),
          caption: "Uploaded but not expected",
          href: trackHref(examId, "extra"),
          icon: TrendingUp,
          accent: "border-l-[#ff6c0c] bg-[#ff6c0c]/5",
          iconWell: "bg-[#ff6c0c]/15 text-[#ff6c0c]",
          valueClass: "text-[#c45500] dark:text-[#ff6c0c]",
        },
      ]
    : [];

  const nextStep =
    examId && !loading && !statsError
      ? sheetMetrics.missing > 0
        ? {
            label: "Review missing sheets",
            href: trackHref(examId, "missing"),
            variant: "default" as const,
          }
        : stats.failed > 0
          ? {
              label: "Fix failed extractions",
              href: docsHref(examId, "error"),
              variant: "default" as const,
            }
          : {
              label: null,
              href: null,
              variant: "default" as const,
              success: true as const,
            }
      : null;

  const quickActions = [
    {
      title: "Track ICMS",
      description: "Compare expected vs uploaded",
      href: examId ? trackHref(examId) : "/icm-studio/track-icms",
      icon: LayoutList,
      well: "bg-[#00853f]/12 text-[#00853f]",
    },
    {
      title: "All files",
      description: "Browse and upload",
      href: examId ? docsHref(examId) : "/icm-studio/documents",
      icon: Files,
      well: "bg-[#003764]/12 text-[#003764] dark:text-[#5b9bd5]",
    },
    {
      title: "Generate ICMs",
      description: "Score sheet PDFs",
      href: "/icm-studio/generate-icms",
      icon: FileSearch,
      well: "bg-[#ffcc00]/25 text-[#8a6d00]",
    },
    {
      title: "Folders",
      description: "By exam / school",
      href: examId ? `/icm-studio/folders?exam=${examId}` : "/icm-studio/folders",
      icon: FolderOpen,
      well: "bg-[#ff6c0c]/12 text-[#ff6c0c]",
    },
  ];

  return (
    <DashboardLayout title="ICM Studio">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="ICM Studio" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
            <div className="overflow-hidden rounded-xl border border-primary/10 bg-primary/5">
              <div className="flex flex-wrap items-end justify-between gap-3 border-l-4 border-l-primary px-4 py-4 sm:px-5">
                <div className="min-w-0 space-y-1">
                  {selectedExam ? (
                    <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                      {formatExamLabel(selectedExam)}
                    </h1>
                  ) : (
                    <>
                      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                        Overview
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        Sheet coverage for one examination
                      </p>
                    </>
                  )}
                </div>
                <Select
                  value={selectedExamId?.toString() || ""}
                  onValueChange={(value) => setSelectedExamId(parseInt(value, 10))}
                  disabled={examsLoading || exams.length === 0}
                >
                  <SelectTrigger className="h-9 w-full border-primary/20 bg-background sm:w-75">
                    <SelectValue placeholder="Select examination" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {formatExamLabel(exam)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!examsLoading && exams.length === 0 ? (
              <div className="rounded-xl border bg-muted/30 px-4 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No examinations yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create an examination to start tracking ICM coverage.
                </p>
                <Button asChild className="mt-4" size="sm">
                  <Link href="/examinations">Go to Examinations</Link>
                </Button>
              </div>
            ) : !examId ? (
              <div className="rounded-xl border bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
                Select an examination to see sheet coverage.
              </div>
            ) : (
              <>
                {statsError ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3">
                    <div className="flex min-w-0 items-start gap-2 text-sm">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-destructive">{statsError}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setRetryToken((n) => n + 1)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {loading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <KpiCardSkeleton key={i} />
                          ))
                        : kpiCards.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
                    </section>

                    {nextStep?.success ? (
                      <div className="flex items-center gap-2 rounded-xl border border-[#00853f]/20 bg-[#00853f]/5 px-4 py-2.5 text-sm text-[#00853f]">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        All expected sheets uploaded
                      </div>
                    ) : nextStep?.label && nextStep.href ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button asChild className="gap-2">
                          <Link href={nextStep.href}>
                            {nextStep.label}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Recommended next step for this examination
                        </p>
                      </div>
                    ) : null}

                    <DocAttentionStrip
                      examId={examId}
                      total={stats.total}
                      pending={stats.pending}
                      failed={stats.failed}
                      loading={stats.loading}
                    />
                  </>
                )}
              </>
            )}

            <section className="space-y-2.5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                Quick actions
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.title}
                      href={action.href}
                      className="group flex items-start gap-3 rounded-xl border bg-card px-3.5 py-3 transition-all hover:-translate-y-px hover:border-primary/30 hover:bg-primary/3 hover:shadow-sm"
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          action.well
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{action.title}</p>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-l-4 border-l-muted bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="mt-2 h-3 w-36" />
    </div>
  );
}

function KpiCard({
  title,
  value,
  caption,
  href,
  icon: Icon,
  accent,
  iconWell,
  valueClass,
  emphasize,
  progress,
  showProgress,
}: {
  title: string;
  value: string;
  caption: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconWell: string;
  valueClass: string;
  emphasize?: boolean;
  progress?: number;
  showProgress?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "animate-in fade-in-0 rounded-xl border border-transparent border-l-4 bg-card p-4 shadow-sm duration-200 transition-all hover:-translate-y-px hover:shadow-md",
        accent,
        emphasize && "ring-1 ring-amber-500/20"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className={cn("rounded-md p-1.5", iconWell)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", valueClass)}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      {showProgress ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#00853f]/15">
          <div
            className="h-full rounded-full bg-[#00853f] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }}
          />
        </div>
      ) : null}
    </Link>
  );
}

function DocAttentionStrip({
  examId,
  total,
  pending,
  failed,
  loading,
}: {
  examId: number;
  total: number;
  pending: number;
  failed: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/20 px-4 py-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/20 px-4 py-2.5 text-sm duration-200">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Documents
      </span>
      <Link
        href={docsHref(examId)}
        className="tabular-nums text-muted-foreground transition-colors hover:text-foreground"
      >
        Total <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
      </Link>
      <span className="hidden text-border sm:inline">·</span>
      <Link
        href={docsHref(examId, "pending")}
        className="tabular-nums text-muted-foreground transition-colors hover:text-foreground"
      >
        Pending <span className="font-semibold text-foreground">{pending.toLocaleString()}</span>
      </Link>
      <span className="hidden text-border sm:inline">·</span>
      <Link
        href={docsHref(examId, "error")}
        className={cn(
          "tabular-nums transition-colors",
          failed > 0
            ? "font-medium text-red-700 hover:text-red-800 dark:text-red-400"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Failed <span className="font-semibold">{failed.toLocaleString()}</span>
      </Link>
    </div>
  );
}
