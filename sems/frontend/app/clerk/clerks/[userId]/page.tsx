"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  getClerkValidationStats,
  getCurrentUser,
  listClerks,
  listIssueBatches,
  listSubjects,
  releaseIssueBatches,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type {
  ClerkListItem,
  ClerkValidationStatsItem,
  Exam,
  IssueBatch,
  Subject,
} from "@/types/document";

function testTypeLabel(testType: number) {
  if (testType === 1) return "Paper 1";
  if (testType === 2) return "Paper 2";
  if (testType === 3) return "Paper 3";
  return `Type ${testType}`;
}

function examLabel(exam: Exam) {
  return `${exam.exam_type} · ${exam.series} ${exam.year}`;
}

export default function ClerkDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const userId = String(params.userId ?? "");

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [clerk, setClerk] = useState<ClerkListItem | null>(null);
  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [globalStats, setGlobalStats] = useState<ClerkValidationStatsItem | null>(null);
  const [scopedStats, setScopedStats] = useState<ClerkValidationStatsItem | null>(null);
  const [perExamStats, setPerExamStats] = useState<
    Array<{ exam_id: number; exam_label: string; stats: ClerkValidationStatsItem }>
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);

  const applyExamId = useCallback(
    (id: number | null) => {
      setExamId(id);
      const next = new URLSearchParams(searchParams.toString());
      if (id != null) next.set("exam_id", String(id));
      else next.delete("exam_id");
      const qs = next.toString();
      router.replace(qs ? `/clerk/clerks/${userId}?${qs}` : `/clerk/clerks/${userId}`);
    },
    [router, searchParams, userId]
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const [clerksData, batchesData, globalStatsData, scopedStatsData] =
        await Promise.all([
          listClerks(),
          listIssueBatches({
            assigned_to: userId,
            exam_id: examId || undefined,
          }),
          getClerkValidationStats(),
          examId != null
            ? getClerkValidationStats(examId)
            : Promise.resolve(null),
        ]);

      const found = clerksData.clerks.find((c) => c.user_id === userId) ?? null;
      setClerk(found);
      setBatches(batchesData.batches);
      setGlobalStats(
        globalStatsData.clerks.find((c) => c.user_id === userId) ?? null
      );
      setScopedStats(
        scopedStatsData?.clerks.find((c) => c.user_id === userId) ?? null
      );

      if (examId == null && found?.active_exams?.length) {
        const breakdown = await Promise.all(
          found.active_exams.map(async (exam) => {
            const stats = await getClerkValidationStats(exam.exam_id);
            const row = stats.clerks.find((c) => c.user_id === userId);
            return row
              ? {
                  exam_id: exam.exam_id,
                  exam_label: exam.exam_label,
                  stats: row,
                }
              : null;
          })
        );
        setPerExamStats(
          breakdown.filter(
            (
              item
            ): item is {
              exam_id: number;
              exam_label: string;
              stats: ClerkValidationStatsItem;
            } => item != null
          )
        );
      } else {
        setPerExamStats([]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userId, examId]);

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        const role = normalizeRole(user.role);
        if (role !== "SUPER_ADMIN" && role !== "REGISTRAR") {
          router.replace("/");
          return;
        }
        setAuthorized(true);

        const examsData = await getAllExams().catch(() => []);
        const allSubjects: Subject[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const chunk = await listSubjects(page, 100);
          allSubjects.push(...chunk);
          hasMore = chunk.length === 100;
          page++;
        }
        setExams(Array.isArray(examsData) ? examsData : []);
        setSubjects(allSubjects);

        const fromQuery = searchParams.get("exam_id");
        if (fromQuery) {
          const id = Number(fromQuery);
          if (!Number.isNaN(id)) setExamId(id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!authorized || !userId) return;
    void refresh().catch((err) =>
      toast.error(err instanceof Error ? err.message : "Failed to refresh")
    );
  }, [authorized, userId, refresh]);

  const examById = useMemo(() => {
    const map = new Map<number, Exam>();
    for (const e of exams) map.set(e.id, e);
    return map;
  }, [exams]);

  const subjectById = useMemo(() => {
    const map = new Map<number, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  const assignHref = useMemo(() => {
    const next = new URLSearchParams();
    next.set("clerk_id", userId);
    if (examId != null) next.set("exam_id", String(examId));
    return `/clerk/assign?${next.toString()}`;
  }, [userId, examId]);

  const handleReleaseAll = async () => {
    if (!clerk) return;
    setReleasing(true);
    try {
      const result = await releaseIssueBatches({ user_id: clerk.user_id });
      toast.success(`Released ${result.released_count} batch(es)`);
      setConfirmReleaseOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Clerk">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  const workStats = examId != null ? scopedStats : globalStats;
  const title = clerk?.full_name ?? "Clerk";

  return (
    <DashboardLayout title={title}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/clerk/clerks">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  All clerks
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={refreshing}
                onClick={() =>
                  void refresh().catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Refresh failed")
                  )
                }
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>

            {!clerk ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Data clerk not found or inactive.
              </div>
            ) : (
              <>
                <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight">
                      {clerk.full_name}
                    </h1>
                    <p className="text-muted-foreground">{clerk.email || "No email"}</p>
                    <div className="flex flex-wrap gap-2">
                      {(clerk.active_exams ?? []).map((exam) => (
                        <Badge key={exam.exam_id} variant="secondary" className="font-normal">
                          {exam.exam_label} · {exam.assigned_batches} batches
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link href={assignHref}>Assign work</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/users">Manage account</Link>
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={releasing || (clerk.active_exams?.length ?? 0) === 0}
                      onClick={() => setConfirmReleaseOpen(true)}
                    >
                      Release all batches
                    </Button>
                  </div>
                </header>

                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground">
                    Filter by examination
                  </Label>
                  <SearchableSelect
                    options={exams.map((e) => ({
                      value: e.id,
                      label: examLabel(e),
                    }))}
                    value={examId ?? "all"}
                    onValueChange={(v) =>
                      applyExamId(v === "all" || v === "" ? null : Number(v))
                    }
                    placeholder="All examinations"
                    allowAll
                    allLabel="All examinations"
                  />
                </div>

                <section className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-medium">Assignments</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current batches assigned to this clerk
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {batches.length} batch{batches.length === 1 ? "" : "es"}
                    </span>
                  </div>
                  {batches.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No current assignments
                      {examId != null ? " for this examination" : ""}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Batch</TableHead>
                            <TableHead>Exam</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Paper</TableHead>
                            <TableHead>Stream</TableHead>
                            <TableHead className="text-right">Issues</TableHead>
                            <TableHead>Assigned</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batches.map((b) => {
                            const exam = examById.get(b.exam_id);
                            const subject = subjectById.get(b.subject_id);
                            return (
                              <TableRow key={b.id}>
                                <TableCell className="font-medium">{b.name}</TableCell>
                                <TableCell>
                                  {exam ? examLabel(exam) : `Exam ${b.exam_id}`}
                                </TableCell>
                                <TableCell>
                                  {subject?.code ?? `Subject ${b.subject_id}`}
                                </TableCell>
                                <TableCell>{testTypeLabel(b.test_type)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-normal">
                                    {b.has_document ? "DOC" : "NOD"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {b.issue_count}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {b.assigned_at
                                    ? new Date(b.assigned_at).toLocaleString()
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/30">
                    <h2 className="font-medium">Work completed</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Attributed resolutions
                      {examId != null ? " for the selected examination" : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 p-4">
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-xl font-semibold tabular-nums">
                        {workStats?.resolved_today ?? clerk.resolved_today}
                      </p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">This week</p>
                      <p className="text-xl font-semibold tabular-nums">
                        {workStats?.resolved_week ?? 0}
                      </p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {examId != null ? "In exam" : "All time"}
                      </p>
                      <p className="text-xl font-semibold tabular-nums">
                        {workStats?.resolved_total ?? 0}
                      </p>
                    </div>
                  </div>
                  {examId == null && perExamStats.length > 0 ? (
                    <div className="border-t overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Examination</TableHead>
                            <TableHead className="text-right">Today</TableHead>
                            <TableHead className="text-right">Week</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {perExamStats.map((row) => (
                            <TableRow key={row.exam_id}>
                              <TableCell>
                                <button
                                  type="button"
                                  className="font-medium underline-offset-2 hover:underline"
                                  onClick={() => applyExamId(row.exam_id)}
                                >
                                  {row.exam_label}
                                </button>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.stats.resolved_today}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.stats.resolved_week}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.stats.resolved_total}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      <AlertDialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release all batches?</AlertDialogTitle>
            <AlertDialogDescription>
              Release all batches assigned to {clerk?.full_name ?? "this clerk"} across every
              examination? They will return to the unassigned pool.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={releasing}
              onClick={(e) => {
                e.preventDefault();
                void handleReleaseAll();
              }}
            >
              {releasing ? "Releasing…" : "Release all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
