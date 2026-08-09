"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { CreateUserDialog } from "@/components/CreateUserDialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DataEntryOpsHeader } from "@/components/DataEntryOpsHeader";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getBatchSummary,
  getClerkValidationStats,
  listClerks,
} from "@/lib/api";
import { useDataEntryExamScope } from "@/hooks/useDataEntryExamScope";
import type {
  BatchSummaryClerkItem,
  BatchSummaryResponse,
  ClerkListItem,
  ClerkValidationStatsItem,
} from "@/types/document";

type ExamClerkRow = {
  user_id: string;
  full_name: string;
  email?: string | null;
  assigned_batches: number;
  assigned_pending_issues: number;
  resolved_today: number;
  resolved_week: number;
  resolved_total: number;
};

export default function ManageClerksPage() {
  const router = useRouter();
  const { loading, authorized, currentRole, exams, examId, applyExamId } =
    useDataEntryExamScope({ path: "/clerk/clerks" });
  const [summary, setSummary] = useState<BatchSummaryResponse | null>(null);
  const [clerks, setClerks] = useState<ClerkListItem[]>([]);
  const [resolutions, setResolutions] = useState<ClerkValidationStatsItem[]>([]);
  const [createClerkOpen, setCreateClerkOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summaryData, clerksData, statsData] = await Promise.all([
        getBatchSummary(examId || undefined),
        listClerks(),
        examId != null
          ? getClerkValidationStats(examId)
          : Promise.resolve({ clerks: [] as ClerkValidationStatsItem[] }),
      ]);
      setSummary(summaryData);
      setClerks(clerksData.clerks);
      setResolutions(statsData.clerks);
    } finally {
      setRefreshing(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!authorized) return;
    void refresh().catch((err) =>
      toast.error(err instanceof Error ? err.message : "Failed to refresh")
    );
  }, [authorized, refresh]);

  const loadByUser = useMemo(() => {
    const map = new Map<string, BatchSummaryClerkItem>();
    for (const c of summary?.clerks ?? []) map.set(c.user_id, c);
    return map;
  }, [summary]);

  const clerkByUser = useMemo(() => {
    const map = new Map<string, ClerkListItem>();
    for (const c of clerks) map.set(c.user_id, c);
    return map;
  }, [clerks]);

  const directoryRows = useMemo(() => {
    return [...clerks].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [clerks]);

  const examRows = useMemo(() => {
    if (examId == null) return [] as ExamClerkRow[];
    const byId = new Map<string, ExamClerkRow>();

    for (const load of summary?.clerks ?? []) {
      if (load.assigned_batches <= 0 && load.assigned_pending_issues <= 0) continue;
      const clerk = clerkByUser.get(load.user_id);
      byId.set(load.user_id, {
        user_id: load.user_id,
        full_name: load.full_name,
        email: clerk?.email,
        assigned_batches: load.assigned_batches,
        assigned_pending_issues: load.assigned_pending_issues,
        resolved_today: 0,
        resolved_week: 0,
        resolved_total: 0,
      });
    }

    for (const stats of resolutions) {
      if (
        stats.resolved_today <= 0 &&
        stats.resolved_week <= 0 &&
        stats.resolved_total <= 0
      ) {
        continue;
      }
      const existing = byId.get(stats.user_id);
      const load = loadByUser.get(stats.user_id);
      const clerk = clerkByUser.get(stats.user_id);
      if (existing) {
        existing.resolved_today = stats.resolved_today;
        existing.resolved_week = stats.resolved_week;
        existing.resolved_total = stats.resolved_total;
      } else {
        byId.set(stats.user_id, {
          user_id: stats.user_id,
          full_name: stats.full_name,
          email: clerk?.email,
          assigned_batches: load?.assigned_batches ?? 0,
          assigned_pending_issues: load?.assigned_pending_issues ?? 0,
          resolved_today: stats.resolved_today,
          resolved_week: stats.resolved_week,
          resolved_total: stats.resolved_total,
        });
      }
    }

    return [...byId.values()].sort(
      (a, b) =>
        b.assigned_pending_issues - a.assigned_pending_issues ||
        b.resolved_total - a.resolved_total ||
        a.full_name.localeCompare(b.full_name)
    );
  }, [examId, summary, resolutions, loadByUser, clerkByUser]);

  const openClerk = (userId: string) => {
    const href =
      examId != null
        ? `/clerk/clerks/${userId}?exam_id=${examId}`
        : `/clerk/clerks/${userId}`;
    router.push(href);
  };

  if (loading) {
    return (
      <DashboardLayout title="Manage Clerks">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  const examMode = examId != null;

  return (
    <DashboardLayout title="Manage Clerks">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Manage Clerks" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6">
            <DataEntryOpsHeader
              title="Manage Clerks"
              description={
                examMode
                  ? "Clerks with assignments or resolutions for the selected examination. Clear the filter to see every dataclerk."
                  : "Directory of data entry clerks. Filter by examination to see that exam’s roster and work completed."
              }
              exams={exams}
              examId={examId}
              onExamIdChange={applyExamId}
              examAllLabel="All examinations"
              examPlaceholder="All examinations"
              actions={
                <>
                  <Button variant="outline" asChild>
                    <Link href="/users">Users</Link>
                  </Button>
                  <Button className="gap-2" onClick={() => setCreateClerkOpen(true)}>
                    <UserPlus className="h-4 w-4" />
                    Create dataclerk
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
                </>
              }
            />

            {!examMode ? (
              <section className="rounded-xl border overflow-hidden">
                {directoryRows.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    No active data clerks.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => setCreateClerkOpen(true)}
                    >
                      Create one
                    </button>{" "}
                    to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Clerk</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Active exams</TableHead>
                          <TableHead className="text-right">Batches</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead className="text-right">Resolved today</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {directoryRows.map((q) => {
                          const load = loadByUser.get(q.user_id);
                          const activeExams =
                            q.active_exams ??
                            load?.active_exams ??
                            (q.active_exam_label
                              ? [
                                  {
                                    exam_id: q.active_exam_id ?? 0,
                                    exam_label: q.active_exam_label,
                                    assigned_batches: 0,
                                    assigned_pending_issues: 0,
                                  },
                                ]
                              : []);
                          return (
                            <TableRow
                              key={q.user_id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => openClerk(q.user_id)}
                            >
                              <TableCell className="font-medium">{q.full_name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {q.email || "—"}
                              </TableCell>
                              <TableCell>
                                {activeExams.length === 0 ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {activeExams.map((exam) => (
                                      <Badge
                                        key={exam.exam_id}
                                        variant="secondary"
                                        className="font-normal"
                                      >
                                        {exam.exam_label}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {load?.assigned_batches ?? 0}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {load?.assigned_pending_issues ?? 0}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {q.resolved_today}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            ) : examRows.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground space-y-2">
                <p>
                  No clerks have assignments or resolutions for this examination yet.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/clerk/assign?exam_id=${examId}`}>Assign work</Link>
                </Button>
              </div>
            ) : (
              <section className="rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h2 className="font-medium">Exam roster</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clerks with current assignments or attributed resolutions for this exam
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clerk</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Batches</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead className="text-right">Resolved today</TableHead>
                        <TableHead className="text-right">Week</TableHead>
                        <TableHead className="text-right">Total in exam</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {examRows.map((row) => (
                        <TableRow
                          key={row.user_id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => openClerk(row.user_id)}
                        >
                          <TableCell className="font-medium">{row.full_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.email || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.assigned_batches}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.assigned_pending_issues}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.resolved_today}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.resolved_week}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.resolved_total}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      <CreateUserDialog
        open={createClerkOpen}
        onOpenChange={setCreateClerkOpen}
        currentUserRole={currentRole}
        lockedRole="DATACLERK"
        onSuccess={() => {
          void refresh();
        }}
      />
    </DashboardLayout>
  );
}
