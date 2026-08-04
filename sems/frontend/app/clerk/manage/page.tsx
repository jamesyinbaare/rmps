"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ClerkManageSheet } from "@/components/ClerkManageSheet";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PrepareBatchesPanel } from "@/components/PrepareBatchesPanel";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
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
  getBatchSummary,
  getClerkDigitalEntrySetting,
  getClerkValidationStats,
  getCurrentUser,
  listClerkQuotas,
  listSubjects,
  setClerkDigitalEntrySetting,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import type {
  BatchSummaryClerkItem,
  BatchSummaryResponse,
  ClerkQuotaItem,
  ClerkValidationStatsItem,
  Exam,
  Subject,
  UserRole,
} from "@/types/document";

const EXAM_STORAGE_KEY = "sems.dataEntry.examId";

export default function OperationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole | undefined>();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [summary, setSummary] = useState<BatchSummaryResponse | null>(null);
  const [quotas, setQuotas] = useState<ClerkQuotaItem[]>([]);
  const [resolutions, setResolutions] = useState<ClerkValidationStatsItem[]>([]);
  const [clerkDigitalEntryEnabled, setClerkDigitalEntryEnabled] = useState(false);
  const [savingDigitalEntry, setSavingDigitalEntry] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [createClerkOpen, setCreateClerkOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageClerk, setManageClerk] = useState<ClerkQuotaItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const applyExamId = useCallback((id: number | null) => {
    setExamId(id);
    if (id != null) {
      try {
        localStorage.setItem(EXAM_STORAGE_KEY, String(id));
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("exam_id", String(id));
      router.replace(`/clerk/manage?${params.toString()}`);
    }
  }, [router, searchParams]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summaryData, quotasData, statsData] = await Promise.all([
        getBatchSummary(examId || undefined),
        listClerkQuotas(),
        getClerkValidationStats(examId || undefined),
      ]);
      setSummary(summaryData);
      setQuotas(quotasData.clerks);
      setResolutions(statsData.clerks);
      setManageClerk((prev) => {
        if (!prev) return null;
        return quotasData.clerks.find((c) => c.user_id === prev.user_id) ?? null;
      });
    } finally {
      setRefreshing(false);
    }
  }, [examId]);

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
        setCurrentRole(role as UserRole);

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
        let initial: number | null = fromQuery ? Number(fromQuery) : null;
        if (initial == null || Number.isNaN(initial)) {
          try {
            const stored = localStorage.getItem(EXAM_STORAGE_KEY);
            if (stored) initial = Number(stored);
          } catch {
            /* ignore */
          }
        }
        if (initial != null && !Number.isNaN(initial)) {
          setExamId(initial);
        }

        const digital = await getClerkDigitalEntrySetting().catch(() => ({
          enabled: false,
        }));
        setClerkDigitalEntryEnabled(digital.enabled);
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

  const clerkRows = useMemo(() => {
    return [...quotas].sort((a, b) => {
      const loadA = loadByUser.get(a.user_id)?.assigned_pending_issues ?? 0;
      const loadB = loadByUser.get(b.user_id)?.assigned_pending_issues ?? 0;
      return loadA - loadB || a.full_name.localeCompare(b.full_name);
    });
  }, [quotas, loadByUser]);

  const handleToggleDigital = async (enabled: boolean) => {
    const previous = clerkDigitalEntryEnabled;
    setClerkDigitalEntryEnabled(enabled);
    setSavingDigitalEntry(true);
    try {
      const updated = await setClerkDigitalEntrySetting(enabled);
      setClerkDigitalEntryEnabled(updated.enabled);
      toast.success(
        updated.enabled
          ? "Dataclerks can use digital entry"
          : "Digital entry disabled for dataclerks"
      );
    } catch (err) {
      setClerkDigitalEntryEnabled(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSavingDigitalEntry(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Operations">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!authorized) return null;

  const kpis = [
    {
      label: "Unbatched pending",
      value: summary?.pending_unbatched ?? 0,
    },
    {
      label: "Unassigned batches",
      value: summary?.batch_count_unassigned ?? 0,
    },
    {
      label: "Assigned pending",
      value: summary?.pending_assigned ?? 0,
    },
    {
      label: "Resolved in exam",
      value: summary?.resolved_in_exam ?? 0,
    },
    {
      label: "Clerks with work",
      value: summary?.clerks_with_work ?? 0,
    },
  ];

  return (
    <DashboardLayout title="Operations">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Operations" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-6 space-y-6">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3 min-w-0 flex-1">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
                  <p className="text-muted-foreground mt-1">
                    Run validation, prepare batches, and monitor clerks for one examination.
                  </p>
                </div>
                <div className="max-w-md">
                  <Label className="text-xs text-muted-foreground">Examination</Label>
                  <SearchableSelect
                    options={exams.map((e) => ({
                      value: e.id,
                      label: `${e.exam_type} · ${e.series} ${e.year}`,
                    }))}
                    value={examId ?? "all"}
                    onValueChange={(v) =>
                      applyExamId(v === "all" || v === "" ? null : Number(v))
                    }
                    placeholder="Select examination"
                    allowAll
                    allLabel="Select examination"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link
                    href={
                      examId
                        ? `/clerk/assign?exam_id=${examId}`
                        : "/clerk/assign"
                    }
                  >
                    Assign work
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => setCreateClerkOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Create dataclerk
                </Button>
                <Button
                  onClick={() => setPrepareOpen((v) => !v)}
                  disabled={!examId}
                >
                  {prepareOpen ? "Hide prepare" : "Prepare batches"}
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
            </header>

            {!examId ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select an examination to see KPIs, clerk load, and resolutions.
              </div>
            ) : (
              <>
                <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {kpis.map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-xl border bg-muted/20 px-4 py-3"
                    >
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className="text-2xl font-semibold tabular-nums mt-1">
                        {kpi.value}
                      </p>
                    </div>
                  ))}
                </section>

                <section className="rounded-xl border bg-muted/20 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label htmlFor="clerk-digital-entry" className="text-sm font-medium">
                      Allow dataclerks digital entry
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When on, clerks see Digital and can edit scores on assigned sheets.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingDigitalEntry && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      id="clerk-digital-entry"
                      checked={clerkDigitalEntryEnabled}
                      disabled={savingDigitalEntry}
                      onCheckedChange={(checked) => {
                        void handleToggleDigital(checked);
                      }}
                    />
                  </div>
                </section>

                {prepareOpen && (
                  <PrepareBatchesPanel
                    exams={exams}
                    subjects={subjects}
                    examId={examId}
                    onExamIdChange={applyExamId}
                    unbatched={summary?.unbatched ?? []}
                    onChanged={refresh}
                  />
                )}

                <section className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-medium">Clerk overview</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Load and quotas for the selected exam
                      </p>
                    </div>
                  </div>
                  {clerkRows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                      No active data clerks. Create one to get started.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Clerk</TableHead>
                            <TableHead>Active exam</TableHead>
                            <TableHead className="text-right">Batches</TableHead>
                            <TableHead className="text-right">Pending</TableHead>
                            <TableHead className="text-right">Quota left</TableHead>
                            <TableHead className="w-[120px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clerkRows.map((q) => {
                            const load = loadByUser.get(q.user_id);
                            const examLabel =
                              q.active_exam_label || load?.active_exam_label || null;
                            return (
                              <TableRow key={q.user_id}>
                                <TableCell className="font-medium">{q.full_name}</TableCell>
                                <TableCell>
                                  {examLabel ? (
                                    <Badge variant="secondary" className="font-normal">
                                      {examLabel}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {load?.assigned_batches ?? 0}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {load?.assigned_pending_issues ?? 0}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right tabular-nums",
                                    q.remaining <= 0 && "text-destructive font-medium"
                                  )}
                                >
                                  {q.remaining}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setManageClerk(q);
                                      setManageOpen(true);
                                    }}
                                  >
                                    Manage
                                  </Button>
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
                    <h2 className="font-medium">Resolutions</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Entries resolved by each clerk for this examination
                    </p>
                  </div>
                  {resolutions.length === 0 ? (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                      No resolution activity yet for this exam.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Clerk</TableHead>
                            <TableHead className="text-right">Today</TableHead>
                            <TableHead className="text-right">This week</TableHead>
                            <TableHead className="text-right">Total in exam</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resolutions.map((r) => (
                            <TableRow key={r.user_id}>
                              <TableCell className="font-medium">{r.full_name}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.resolved_today}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.resolved_week}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.resolved_total}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      <ClerkManageSheet
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (!open) setManageClerk(null);
        }}
        clerk={manageClerk}
        load={manageClerk ? loadByUser.get(manageClerk.user_id) : undefined}
        onUpdated={refresh}
      />

      <CreateUserDialog
        open={createClerkOpen}
        onOpenChange={setCreateClerkOpen}
        currentUserRole={currentRole}
        onSuccess={() => {
          void refresh();
        }}
      />
    </DashboardLayout>
  );
}
