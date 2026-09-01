"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Loader2,
  PartyPopper,
  Play,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AbsentReviewInspectPanel } from "@/components/AbsentReviewInspectPanel";
import { AbsentReviewWorkspace } from "@/components/AbsentReviewWorkspace";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { absentEntryKey, Kbd } from "@/components/absent-review-ui";
import { cn } from "@/lib/utils";
import {
  confirmAbsentReviewCandidate,
  getAbsentReviewCandidateGroups,
  getAbsentReviewEntries,
  getAbsentReviewStats,
  getAllExams,
  getAllSchools,
  getCurrentUser,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type {
  AbsentReviewBucket,
  AbsentReviewCandidateGroup,
  AbsentReviewEntry,
  AbsentReviewStatsResponse,
  Exam,
  School,
} from "@/types/document";

const PAPER_LABEL: Record<number, string> = {
  1: "Obj",
  2: "Essay",
  3: "Pract",
};

const PAPER_FILTER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "All" },
  { value: 1, label: "Obj" },
  { value: 2, label: "Essay" },
  { value: 3, label: "Pract" },
];

function formatScore(total: number | null | undefined, isFullyAbsent: boolean): string {
  if (isFullyAbsent) return "ABSENT";
  if (total == null) return "—";
  return String(total);
}

function sortPapersForPage(
  papers: AbsentReviewEntry[],
  pageCandidateIds: number[]
): AbsentReviewEntry[] {
  const order = new Map(pageCandidateIds.map((id, i) => [id, i]));
  return papers
    .filter((p) => order.has(p.candidate_id))
    .slice()
    .sort((a, b) => {
      const oa = order.get(a.candidate_id) ?? 9999;
      const ob = order.get(b.candidate_id) ?? 9999;
      if (oa !== ob) return oa - ob;
      if (a.subject_code !== b.subject_code) {
        return (a.subject_code || "").localeCompare(b.subject_code || "");
      }
      return a.test_type - b.test_type;
    });
}

export default function AbsentReviewPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [groups, setGroups] = useState<AbsentReviewCandidateGroup[]>([]);
  const [stats, setStats] = useState<AbsentReviewStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [examIdFilter, setExamIdFilter] = useState<number | null>(null);
  const [schoolIdFilter, setSchoolIdFilter] = useState<number | null>(null);
  const [testTypeFilter, setTestTypeFilter] = useState<number | null>(null);
  const [bucketTab, setBucketTab] = useState<AbsentReviewBucket>("fully_absent");
  const defaultedExamRef = useRef<number | null>(null);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [confirmingIds, setConfirmingIds] = useState<Set<number>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmingPage, setConfirmingPage] = useState(false);

  const [inspectGroup, setInspectGroup] = useState<AbsentReviewCandidateGroup | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceEntries, setWorkspaceEntries] = useState<AbsentReviewEntry[]>([]);
  const [currentEntryIndex, setCurrentEntryIndex] = useState<number | null>(null);
  const [sessionConfirmed, setSessionConfirmed] = useState(0);
  const [sessionCorrected, setSessionCorrected] = useState(0);
  const [loadingReview, setLoadingReview] = useState(false);

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.series !== b.series) return a.series.localeCompare(b.series);
          return (a.exam_type || "").localeCompare(b.exam_type || "");
        })
        .map((exam) => {
          const typeLabel =
            exam.exam_type === "Certificate II Examination" ? "Certificate II" : exam.exam_type;
          return {
            value: exam.id,
            label: `${exam.year} ${exam.series} ${typeLabel}`,
          };
        }),
    [exams]
  );

  const loadData = useCallback(async () => {
    if (!examIdFilter) {
      setGroups([]);
      setStats(null);
      setTotal(0);
      setTotalPages(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [groupsRes, statsRes] = await Promise.all([
        getAbsentReviewCandidateGroups({
          exam_id: examIdFilter,
          school_id: schoolIdFilter ?? undefined,
          test_type: testTypeFilter ?? undefined,
          bucket: bucketTab,
          page,
          page_size: pageSize,
        }),
        getAbsentReviewStats({
          exam_id: examIdFilter,
          school_id: schoolIdFilter ?? undefined,
          test_type: testTypeFilter ?? undefined,
        }),
      ]);
      setGroups(groupsRes.items);
      setTotal(groupsRes.total);
      setTotalPages(groupsRes.total_pages);
      setStats(statsRes);
      setSelectedIndex((idx) =>
        groupsRes.items.length === 0 ? 0 : Math.min(idx, groupsRes.items.length - 1)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load absent review");
      console.error("Error loading absent review:", err);
    } finally {
      setLoading(false);
    }
  }, [examIdFilter, schoolIdFilter, testTypeFilter, bucketTab, page, pageSize]);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        if (normalizeRole(user.role) === "DATACLERK") {
          router.replace("/clerk");
          return;
        }
        setAuthorized(true);
      } catch {
        router.replace("/login");
      } finally {
        setAuthChecked(true);
      }
    };
    void checkAccess();
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    void loadData();
  }, [authorized, loadData]);

  useEffect(() => {
    if (!authorized) return;
    setLoadingFilterOptions(true);
    void Promise.all([getAllExams().catch(() => []), getAllSchools().catch(() => [])])
      .then(([examsData, schoolsData]) => {
        setExams(Array.isArray(examsData) ? examsData : []);
        setSchools(Array.isArray(schoolsData) ? schoolsData : []);
      })
      .catch(() => toast.error("Failed to load filter options"))
      .finally(() => setLoadingFilterOptions(false));
  }, [authorized]);

  useEffect(() => {
    if (!stats || !examIdFilter) return;
    if (defaultedExamRef.current === examIdFilter) return;
    defaultedExamRef.current = examIdFilter;
    if (stats.candidates_fully_absent > 0) setBucketTab("fully_absent");
    else if (stats.candidates_mixed > 0) setBucketTab("mixed");
  }, [stats, examIdFilter]);

  const resetPage = () => {
    setPage(1);
    setSelectedIndex(0);
  };

  const toggleExpanded = (candidateId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const applyConfirmOptimistic = useCallback(
    (group: AbsentReviewCandidateGroup, confirmedCount: number) => {
      setGroups((prev) => {
        const idx = prev.findIndex((g) => g.candidate_id === group.candidate_id);
        const next = prev.filter((g) => g.candidate_id !== group.candidate_id);
        setSelectedIndex((sel) => {
          if (next.length === 0) return 0;
          if (idx < 0) return Math.min(sel, next.length - 1);
          return Math.min(idx, next.length - 1);
        });
        return next;
      });
      setTotal((t) => Math.max(0, t - 1));
      setStats((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidates_fully_absent: Math.max(0, prev.candidates_fully_absent - 1),
          pending_papers: Math.max(0, prev.pending_papers - group.pending_paper_count),
          confirmed_papers: prev.confirmed_papers + confirmedCount,
          subjects_fully_absent: Math.max(
            0,
            prev.subjects_fully_absent - group.fully_absent_subject_count
          ),
        };
      });
      setSessionConfirmed((n) => n + confirmedCount);
    },
    []
  );

  const handleConfirmCandidate = useCallback(
    async (group: AbsentReviewCandidateGroup, opts?: { silent?: boolean }) => {
      if (group.bucket !== "fully_absent") return false;
      setConfirmingIds((prev) => new Set(prev).add(group.candidate_id));
      try {
        const result = await confirmAbsentReviewCandidate({
          candidate_id: group.candidate_id,
          exam_id: group.exam_id,
        });
        applyConfirmOptimistic(group, result.confirmed_count);
        if (!opts?.silent) {
          toast.success(
            `Confirmed · ${result.confirmed_count} for ${group.candidate_index_number}`
          );
        }
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to confirm absences");
        return false;
      } finally {
        setConfirmingIds((prev) => {
          const next = new Set(prev);
          next.delete(group.candidate_id);
          return next;
        });
      }
    },
    [applyConfirmOptimistic]
  );

  const handleConfirmPage = useCallback(async () => {
    if (bucketTab !== "fully_absent" || groups.length === 0) return;
    setConfirmingPage(true);
    let confirmedCandidates = 0;
    let confirmedPapers = 0;
    try {
      for (const group of [...groups]) {
        if (group.bucket !== "fully_absent") continue;
        setConfirmingIds((prev) => new Set(prev).add(group.candidate_id));
        try {
          const result = await confirmAbsentReviewCandidate({
            candidate_id: group.candidate_id,
            exam_id: group.exam_id,
          });
          applyConfirmOptimistic(group, result.confirmed_count);
          confirmedCandidates += 1;
          confirmedPapers += result.confirmed_count;
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : `Stopped at ${group.candidate_index_number}`
          );
          break;
        } finally {
          setConfirmingIds((prev) => {
            const next = new Set(prev);
            next.delete(group.candidate_id);
            return next;
          });
        }
      }
      if (confirmedCandidates > 0) {
        toast.success(
          `Confirmed page · ${confirmedCandidates} candidate${confirmedCandidates === 1 ? "" : "s"} · ${confirmedPapers} papers`
        );
      }
      void loadData();
    } finally {
      setConfirmingPage(false);
    }
  }, [bucketTab, groups, applyConfirmOptimistic, loadData]);

  const openInspect = (group: AbsentReviewCandidateGroup) => {
    setInspectGroup(group);
    setInspectOpen(true);
  };

  const buildQueue = useCallback(
    async (fromCandidateId?: number) => {
      if (!examIdFilter || groups.length === 0) return [];
      const pageIds = groups.map((g) => g.candidate_id);
      const pendingSum = groups.reduce((sum, g) => sum + g.pending_paper_count, 0);
      // Fetch enough exam papers that page candidates are included (API sorts by index).
      const fetchSize = Math.min(
        1000,
        Math.max(pendingSum + 50, stats?.pending_papers ?? 0, 200)
      );
      const response = await getAbsentReviewEntries({
        exam_id: examIdFilter,
        school_id: schoolIdFilter ?? undefined,
        test_type: testTypeFilter ?? undefined,
        page: 1,
        page_size: fetchSize,
      });
      let queue = sortPapersForPage(response.items, pageIds);
      if (fromCandidateId != null) {
        const start = queue.findIndex((e) => e.candidate_id === fromCandidateId);
        if (start >= 0) queue = queue.slice(start);
        else if (queue.length === 0) {
          // Fall back: load this candidate's papers directly
          const solo = await getAbsentReviewEntries({
            exam_id: examIdFilter,
            school_id: schoolIdFilter ?? undefined,
            test_type: testTypeFilter ?? undefined,
            candidate_id: fromCandidateId,
            page: 1,
            page_size: 500,
          });
          return solo.items;
        }
      }
      return queue;
    },
    [examIdFilter, schoolIdFilter, testTypeFilter, groups, stats?.pending_papers]
  );

  const openWorkspaceQueue = useCallback(
    async (fromCandidateId?: number) => {
      if (!examIdFilter) return;
      setLoadingReview(true);
      try {
        const queue = await buildQueue(fromCandidateId);
        if (queue.length === 0) {
          toast.info("No pending papers in this queue");
          await loadData();
          return;
        }
        setInspectOpen(false);
        setWorkspaceEntries(queue);
        setCurrentEntryIndex(0);
        setWorkspaceOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load papers");
      } finally {
        setLoadingReview(false);
      }
    },
    [examIdFilter, buildQueue, loadData]
  );

  const handleOpenSheetsForCandidate = useCallback(
    async (group: AbsentReviewCandidateGroup) => {
      if (!examIdFilter) return;
      setLoadingReview(true);
      try {
        const response = await getAbsentReviewEntries({
          exam_id: examIdFilter,
          school_id: schoolIdFilter ?? undefined,
          test_type: testTypeFilter ?? undefined,
          candidate_id: group.candidate_id,
          page: 1,
          page_size: 500,
        });
        if (response.items.length === 0) {
          toast.info("No pending papers for this candidate");
          await loadData();
          return;
        }
        setInspectOpen(false);
        setWorkspaceEntries(response.items);
        setCurrentEntryIndex(0);
        setWorkspaceOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load papers");
      } finally {
        setLoadingReview(false);
      }
    },
    [examIdFilter, schoolIdFilter, testTypeFilter, loadData]
  );

  const handleEntryHandled = (key: string, action: "confirmed" | "corrected") => {
    setWorkspaceEntries((prev) => {
      const idx = prev.findIndex((entry) => absentEntryKey(entry) === key);
      const next = prev.filter((entry) => absentEntryKey(entry) !== key);
      if (next.length === 0) {
        setCurrentEntryIndex(null);
      } else if (idx >= 0) {
        setCurrentEntryIndex((ci) => {
          if (ci === null) return 0;
          return Math.min(ci > idx ? ci - 1 : ci, next.length - 1);
        });
      }
      return next;
    });
    if (action === "confirmed") setSessionConfirmed((n) => n + 1);
    else setSessionCorrected((n) => n + 1);
  };

  const handleEntryUpdated = (updated: AbsentReviewEntry) => {
    setWorkspaceEntries((prev) =>
      prev.map((entry) => (absentEntryKey(entry) === absentEntryKey(updated) ? updated : entry))
    );
  };

  const handleWorkspaceOpenChange = (open: boolean) => {
    setWorkspaceOpen(open);
    if (!open) {
      setWorkspaceEntries([]);
      setCurrentEntryIndex(null);
      void loadData();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (workspaceOpen || inspectOpen) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (typing) return;
      if (!examIdFilter || groups.length === 0 || loading) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(groups.length - 1, i + 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }

      const selected = groups[selectedIndex];
      if (!selected) return;

      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        openInspect(selected);
        return;
      }

      if (e.key === "Enter" && e.shiftKey && bucketTab === "fully_absent") {
        e.preventDefault();
        if (!confirmingPage) void handleConfirmPage();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (bucketTab === "fully_absent") {
          if (!confirmingIds.has(selected.candidate_id)) {
            void handleConfirmCandidate(selected);
          }
        } else {
          void openWorkspaceQueue(selected.candidate_id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    workspaceOpen,
    inspectOpen,
    examIdFilter,
    groups,
    loading,
    selectedIndex,
    bucketTab,
    confirmingPage,
    confirmingIds,
    handleConfirmPage,
    handleConfirmCandidate,
    openWorkspaceQueue,
  ]);

  useEffect(() => {
    const el = document.querySelector(`[data-candidate-row="${groups[selectedIndex]?.candidate_id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, groups]);

  if (!authChecked || !authorized) {
    return null;
  }

  const queueReady = !!examIdFilter && !loading && !error && total > 0;
  const queueClear =
    !!examIdFilter &&
    !loading &&
    !error &&
    (stats?.candidates_fully_absent ?? 0) + (stats?.candidates_mixed ?? 0) === 0;
  const tabEmpty = !!examIdFilter && !loading && !error && total === 0 && !queueClear;
  const selectedGroup = groups[selectedIndex] ?? null;

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col bg-linear-to-b from-amber-50/40 to-background">
        <TopBar
          title="Absent Review"
          showSearch={false}
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-52 w-64">
                <SearchableSelect
                  options={examOptions}
                  value={examIdFilter ?? ""}
                  onValueChange={(value) => {
                    if (value === "" || value === "all") setExamIdFilter(null);
                    else
                      setExamIdFilter(
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
                    defaultedExamRef.current = null;
                    resetPage();
                  }}
                  placeholder="Select examination"
                  disabled={loadingFilterOptions}
                  searchPlaceholder="Search examinations..."
                  emptyMessage="No examinations found"
                  triggerClassName="h-8"
                />
              </div>
              <div className="min-w-44 w-56">
                <SearchableSelect
                  options={schools.map((school) => ({
                    value: school.id,
                    label: `${school.code} - ${school.name}`,
                  }))}
                  value={schoolIdFilter ? schoolIdFilter : "all"}
                  onValueChange={(value) => {
                    if (value === "all" || value === "") setSchoolIdFilter(null);
                    else
                      setSchoolIdFilter(
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
                    resetPage();
                  }}
                  placeholder="All schools"
                  disabled={loadingFilterOptions || !examIdFilter}
                  allowAll
                  allLabel="All schools"
                  searchPlaceholder="Search schools..."
                  emptyMessage="No schools found"
                  triggerClassName="h-8"
                />
              </div>
              <div
                className="inline-flex h-8 items-center rounded-md border bg-background p-0.5"
                role="group"
                aria-label="Paper type"
              >
                {PAPER_FILTER_OPTIONS.map((opt) => {
                  const active = testTypeFilter === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={!examIdFilter}
                      onClick={() => {
                        setTestTypeFilter(opt.value);
                        resetPage();
                      }}
                      className={cn(
                        "rounded px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                        active
                          ? "bg-amber-100 text-amber-900 shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          }
          trailing={
            <div className="flex flex-wrap items-center gap-2">
              {sessionConfirmed > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 tabular-nums">
                  <ShieldCheck className="h-3 w-3" />
                  {sessionConfirmed} confirmed
                </span>
              ) : null}
              {sessionCorrected > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 tabular-nums">
                  <CheckCircle2 className="h-3 w-3" />
                  {sessionCorrected} corrected
                </span>
              ) : null}
              {workspaceOpen && workspaceEntries.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums">
                  {workspaceEntries.length} in queue
                </span>
              ) : null}
              {bucketTab === "fully_absent" && queueReady ? (
                <Button
                  size="sm"
                  className="h-8 bg-amber-600 hover:bg-amber-700"
                  disabled={confirmingPage || groups.length === 0}
                  onClick={() => void handleConfirmPage()}
                >
                  {confirmingPage ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Confirm page
                </Button>
              ) : null}
              {bucketTab === "mixed" && queueReady ? (
                <Button
                  size="sm"
                  className="h-8"
                  disabled={loadingReview || groups.length === 0}
                  onClick={() => void openWorkspaceQueue()}
                >
                  {loadingReview ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Start review
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4 gap-3">
          {!examIdFilter ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-background/70 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-inner">
                <Inbox className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Pick an exam to start</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Review absences by candidate — bulk-confirm when every subject is absent.
              </p>
            </div>
          ) : (
            <>
              {stats ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard
                    label="Fully absent"
                    value={stats.candidates_fully_absent}
                    icon={<UserX className="h-3.5 w-3.5" />}
                    tone="amber"
                  />
                  <StatCard
                    label="Needs review"
                    value={stats.candidates_mixed}
                    icon={<Users className="h-3.5 w-3.5" />}
                    tone="slate"
                  />
                  <StatCard
                    label="Pending papers"
                    value={stats.pending_papers}
                    icon={<Inbox className="h-3.5 w-3.5" />}
                    tone="slate"
                  />
                  <StatCard
                    label="Confirmed"
                    value={stats.confirmed_papers}
                    icon={<UserCheck className="h-3.5 w-3.5" />}
                    tone="emerald"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="inline-flex rounded-md border bg-muted/40 p-0.5"
                  role="tablist"
                  aria-label="Candidate bucket"
                >
                  <TabButton
                    active={bucketTab === "fully_absent"}
                    onClick={() => {
                      setBucketTab("fully_absent");
                      resetPage();
                    }}
                    count={stats?.candidates_fully_absent}
                  >
                    Likely true (all subjects absent)
                  </TabButton>
                  <TabButton
                    active={bucketTab === "mixed"}
                    onClick={() => {
                      setBucketTab("mixed");
                      resetPage();
                    }}
                    count={stats?.candidates_mixed}
                  >
                    Needs review (mixed)
                  </TabButton>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <p className="max-w-md text-right">
                    {bucketTab === "fully_absent"
                      ? "Absent on every registered subject — safe to confirm."
                      : "Has scores on some subjects and absences on others — check before confirming."}
                  </p>
                  {queueReady ? (
                    <span className="hidden items-center gap-1.5 lg:inline-flex">
                      <Kbd>j</Kbd>
                      <Kbd>k</Kbd>
                      {bucketTab === "fully_absent" ? (
                        <>
                          <Kbd>Enter</Kbd> confirm
                          <Kbd>i</Kbd> inspect
                        </>
                      ) : (
                        <>
                          <Kbd>Enter</Kbd> review
                        </>
                      )}
                    </span>
                  ) : null}
                </div>
              </div>

              {queueClear ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border bg-background/80 px-6 py-16 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                    <PartyPopper className="h-7 w-7" />
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight">Queue clear</h2>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Every absent mark for this exam has been confirmed or corrected.
                  </p>
                </div>
              ) : loading && groups.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-background/80">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                </div>
              ) : error ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border bg-background/80">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => void loadData()}>
                    Retry
                  </Button>
                </div>
              ) : tabEmpty ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border bg-background/80 px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {bucketTab === "fully_absent"
                      ? "No fully-absent candidates in this queue."
                      : "No mixed candidates need review."}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
                  <div className="min-h-0 flex-1 overflow-auto">
                    <ul className="divide-y">
                      {groups.map((group, index) => {
                        const expanded = expandedIds.has(group.candidate_id);
                        const confirming = confirmingIds.has(group.candidate_id);
                        const selected = index === selectedIndex;
                        return (
                          <li
                            key={group.candidate_id}
                            data-candidate-row={group.candidate_id}
                            className={cn(
                              "px-4 py-3 transition-colors",
                              selected && "bg-amber-50/70 ring-1 ring-inset ring-amber-200"
                            )}
                            onClick={() => setSelectedIndex(index)}
                          >
                            <div className="flex flex-wrap items-start gap-3">
                              <button
                                type="button"
                                className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  toggleExpanded(group.candidate_id);
                                }}
                                aria-expanded={expanded}
                                aria-label={expanded ? "Collapse" : "Expand"}
                              >
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-sm font-medium tabular-nums">
                                    {group.candidate_index_number}
                                  </span>
                                  <span className="font-medium">{group.candidate_name}</span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] uppercase tracking-wide",
                                      group.bucket === "fully_absent"
                                        ? "border-amber-300 bg-amber-50 text-amber-900"
                                        : "border-slate-300 bg-slate-50 text-slate-700"
                                    )}
                                  >
                                    {group.bucket === "fully_absent" ? "Fully absent" : "Mixed"}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {group.school_code ? `${group.school_code} · ` : ""}
                                  {group.school_name ?? "—"}
                                  {" · "}
                                  {group.registered_subject_count}{" "}
                                  {group.registered_subject_count === 1 ? "subject" : "subjects"}
                                  {" · "}
                                  {group.pending_paper_count}{" "}
                                  {group.pending_paper_count === 1
                                    ? "pending paper"
                                    : "pending papers"}
                                </p>
                                {expanded ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {group.subjects.map((subject) => (
                                      <span
                                        key={subject.subject_id}
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                                          subject.is_fully_absent
                                            ? "border-amber-200 bg-amber-50/80 text-amber-900"
                                            : subject.total_score != null
                                              ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                                              : "border-muted bg-muted/40 text-muted-foreground"
                                        )}
                                        title={
                                          subject.pending_papers.length
                                            ? subject.pending_papers
                                                .map(
                                                  (p) =>
                                                    `${PAPER_LABEL[p.test_type] ?? p.test_type}:${p.absent_marker}`
                                                )
                                                .join(", ")
                                            : undefined
                                        }
                                      >
                                        <span className="font-medium">{subject.subject_code}</span>
                                        <span className="tabular-nums opacity-80">
                                          {formatScore(
                                            subject.total_score,
                                            subject.is_fully_absent
                                          )}
                                          {subject.grade ? ` ${subject.grade}` : ""}
                                        </span>
                                        {subject.pending_papers.length > 0 ? (
                                          <span className="text-[10px] opacity-70">
                                            (
                                            {subject.pending_papers
                                              .map((p) => PAPER_LABEL[p.test_type] ?? "?")
                                              .join("/")}
                                            )
                                          </span>
                                        ) : null}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {group.bucket === "fully_absent" ? (
                                  <>
                                    <Button
                                      size="sm"
                                      className="h-8 bg-amber-600 hover:bg-amber-700"
                                      disabled={confirming || confirmingPage}
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        void handleConfirmCandidate(group);
                                      }}
                                    >
                                      {confirming ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                      )}
                                      Confirm all absences
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        openInspect(group);
                                      }}
                                    >
                                      Inspect
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    disabled={loadingReview}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      void openWorkspaceQueue(group.candidate_id);
                                    }}
                                  >
                                    {loadingReview && selectedGroup?.candidate_id === group.candidate_id ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    Review
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                    <span>
                      {total} candidate{total === 1 ? "" : "s"}
                      {totalPages > 0 ? ` · page ${page} of ${totalPages}` : ""}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span>Show</span>
                        <Select
                          value={String(pageSize)}
                          onValueChange={(value) => {
                            setPageSize(parseInt(value, 10));
                            setPage(1);
                            setSelectedIndex(0);
                          }}
                        >
                          <SelectTrigger className="h-7 w-[4.5rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[25, 50, 100, 200, 500].map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span>per page</span>
                      </div>
                      {totalPages > 1 ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={page <= 1}
                            onClick={() => {
                              setPage((p) => Math.max(1, p - 1));
                              setSelectedIndex(0);
                            }}
                          >
                            Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={page >= totalPages}
                            onClick={() => {
                              setPage((p) => p + 1);
                              setSelectedIndex(0);
                            }}
                          >
                            Next
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <AbsentReviewInspectPanel
          open={inspectOpen}
          onOpenChange={setInspectOpen}
          group={inspectGroup}
          confirming={
            inspectGroup ? confirmingIds.has(inspectGroup.candidate_id) : false
          }
          openingSheets={loadingReview}
          onConfirmAll={
            inspectGroup?.bucket === "fully_absent"
              ? () => {
                  void handleConfirmCandidate(inspectGroup).then((ok) => {
                    if (ok) setInspectOpen(false);
                  });
                }
              : undefined
          }
          onOpenSheets={
            inspectGroup
              ? () => void handleOpenSheetsForCandidate(inspectGroup)
              : undefined
          }
        />

        <AbsentReviewWorkspace
          open={workspaceOpen}
          onOpenChange={handleWorkspaceOpenChange}
          entries={workspaceEntries}
          currentIndex={currentEntryIndex}
          onCurrentIndexChange={setCurrentEntryIndex}
          onHandled={handleEntryHandled}
          onEntryUpdated={handleEntryUpdated}
          sessionConfirmed={sessionConfirmed}
          sessionCorrected={sessionCorrected}
        />
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "amber" | "slate" | "emerald";
}) {
  const tones = {
    amber: "border-amber-200/80 bg-amber-50/50 text-amber-900",
    slate: "border-border bg-background text-foreground",
    emerald: "border-emerald-200/80 bg-emerald-50/40 text-emerald-900",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2", tones[tone])}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-70">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      role="tab"
      aria-selected={active}
      variant={active ? "secondary" : "ghost"}
      className="h-8 gap-1.5 px-3 text-xs"
      onClick={onClick}
    >
      {children}
      {count != null ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
      ) : null}
    </Button>
  );
}
