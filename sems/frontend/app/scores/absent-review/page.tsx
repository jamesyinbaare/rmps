"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Inbox,
  Loader2,
  PartyPopper,
  Play,
  ShieldCheck,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AbsentReviewDataTable } from "@/components/AbsentReviewDataTable";
import { AbsentReviewWorkspace } from "@/components/AbsentReviewWorkspace";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  getAbsentReviewCandidates,
  getAllExams,
  getCurrentUser,
  listSchools,
  listSubjects,
} from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type { AbsentReviewEntry, Exam, School, Subject } from "@/types/document";
import { absentEntryKey } from "@/components/absent-review-ui";

const PAPER_PILLS: { value: number | null; label: string }[] = [
  { value: null, label: "All" },
  { value: 1, label: "Obj" },
  { value: 2, label: "Essay" },
  { value: 3, label: "Pract" },
];

export default function AbsentReviewPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [entries, setEntries] = useState<AbsentReviewEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [examIdFilter, setExamIdFilter] = useState<number | null>(null);
  const [schoolIdFilter, setSchoolIdFilter] = useState<number | null>(null);
  const [subjectIdFilter, setSubjectIdFilter] = useState<number | null>(null);
  const [testTypeFilter, setTestTypeFilter] = useState<number | null>(null);

  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [currentEntryIndex, setCurrentEntryIndex] = useState<number | null>(null);
  const [sessionConfirmed, setSessionConfirmed] = useState(0);
  const [sessionCorrected, setSessionCorrected] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const hasOptionalFilters =
    schoolIdFilter != null || subjectIdFilter != null || testTypeFilter != null;

  const loadEntries = useCallback(async () => {
    if (!examIdFilter) {
      setEntries([]);
      setTotal(0);
      setTotalPages(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getAbsentReviewCandidates({
        exam_id: examIdFilter,
        school_id: schoolIdFilter ?? undefined,
        subject_id: subjectIdFilter ?? undefined,
        test_type: testTypeFilter ?? undefined,
        page,
        page_size: pageSize,
      });
      setEntries(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setCurrentEntryIndex((idx) => {
        if (idx !== null && idx >= response.items.length) {
          setWorkspaceOpen(false);
          return null;
        }
        return idx;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load absent review entries");
      console.error("Error loading absent review:", err);
    } finally {
      setLoading(false);
    }
  }, [
    examIdFilter,
    schoolIdFilter,
    subjectIdFilter,
    testTypeFilter,
    page,
    pageSize,
  ]);

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
    void loadEntries();
  }, [authorized, loadEntries]);

  const loadFilterOptions = useCallback(async () => {
    setLoadingFilterOptions(true);
    try {
      const allSubjects: Subject[] = [];
      let subjectsPage = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const subjectsData = await listSubjects(subjectsPage, 100);
          allSubjects.push(...subjectsData);
          hasMore = subjectsData.length === 100;
          subjectsPage++;
        } catch (err) {
          console.error("Error loading subjects page:", err);
          hasMore = false;
        }
      }

      const [examsData, schoolsData] = await Promise.all([
        getAllExams().catch(() => []),
        listSchools(1, 100).catch(() => []),
      ]);

      setExams(Array.isArray(examsData) ? examsData : []);
      setSchools(Array.isArray(schoolsData) ? schoolsData : []);
      setSubjects(allSubjects);
    } catch (err) {
      console.error("Error loading filter options:", err);
      toast.error("Failed to load filter options");
    } finally {
      setLoadingFilterOptions(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadFilterOptions();
  }, [authorized, loadFilterOptions]);

  const handleOpenWorkspace = (_entry: AbsentReviewEntry, index: number) => {
    setCurrentEntryIndex(index);
    setWorkspaceOpen(true);
  };

  const startReview = useCallback(() => {
    if (entries.length === 0) return;
    setCurrentEntryIndex(0);
    setWorkspaceOpen(true);
  }, [entries.length]);

  const handleEntryHandled = (key: string, action: "confirmed" | "corrected") => {
    setEntries((prev) => prev.filter((entry) => absentEntryKey(entry) !== key));
    setTotal((prev) => Math.max(0, prev - 1));
    if (action === "confirmed") setSessionConfirmed((n) => n + 1);
    else setSessionCorrected((n) => n + 1);
  };

  const handleEntryUpdated = (updated: AbsentReviewEntry) => {
    setEntries((prev) =>
      prev.map((entry) => (absentEntryKey(entry) === absentEntryKey(updated) ? updated : entry))
    );
  };

  const resetPage = () => setPage(1);

  const clearOptionalFilters = () => {
    setSchoolIdFilter(null);
    setSubjectIdFilter(null);
    setTestTypeFilter(null);
    resetPage();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !typing &&
        !workspaceOpen &&
        entries.length > 0
      ) {
        e.preventDefault();
        startReview();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries.length, startReview, workspaceOpen]);

  if (!authChecked || !authorized) {
    return null;
  }

  const queueReady = !!examIdFilter && !loading && !error && total > 0;
  const queueClear = !!examIdFilter && !loading && !error && total === 0;

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col bg-linear-to-b from-amber-50/40 to-background">
        <header className="shrink-0 border-b bg-background/80 px-6 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <UserX className="h-4 w-4" />
                </div>
                <h1 className="text-lg font-semibold tracking-tight">Absent Review</h1>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Confirm real absences or correct scores from the sheet.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {examIdFilter ? (
                <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium tabular-nums">
                  {total} in queue
                </span>
              ) : null}
              {sessionConfirmed > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 tabular-nums">
                  <ShieldCheck className="h-3 w-3" />
                  {sessionConfirmed} confirmed
                </span>
              ) : null}
              {sessionCorrected > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 tabular-nums">
                  <CheckCircle2 className="h-3 w-3" />
                  {sessionCorrected} corrected
                </span>
              ) : null}
              <Button
                onClick={startReview}
                disabled={!queueReady}
                className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-700"
              >
                <Play className="h-3.5 w-3.5" />
                Start review
              </Button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4 gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background/90 p-2 shadow-sm">
            <div className="min-w-56 flex-1">
              <SearchableSelect
                options={examOptions}
                value={examIdFilter ?? ""}
                onValueChange={(value) => {
                  if (value === "" || value === "all") {
                    setExamIdFilter(null);
                  } else {
                    setExamIdFilter(
                      typeof value === "number" ? value : parseInt(String(value), 10)
                    );
                  }
                  resetPage();
                }}
                placeholder="Select an examination"
                disabled={loadingFilterOptions}
                searchPlaceholder="Search examinations..."
                emptyMessage="No examinations found"
                triggerClassName="h-8"
              />
            </div>
            <div className="min-w-44 flex-1">
              <SearchableSelect
                options={schools.map((school) => ({
                  value: school.id,
                  label: `${school.code} - ${school.name}`,
                }))}
                value={schoolIdFilter ? schoolIdFilter : "all"}
                onValueChange={(value) => {
                  if (value === "all" || value === "") {
                    setSchoolIdFilter(null);
                  } else {
                    setSchoolIdFilter(
                      typeof value === "number" ? value : parseInt(String(value), 10)
                    );
                  }
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
            <div className="min-w-44 flex-1">
              <SearchableSelect
                options={subjects.map((subject) => ({
                  value: subject.id,
                  label: `${subject.code} - ${subject.name}`,
                }))}
                value={subjectIdFilter ? subjectIdFilter : "all"}
                onValueChange={(value) => {
                  if (value === "all" || value === "") {
                    setSubjectIdFilter(null);
                  } else {
                    setSubjectIdFilter(
                      typeof value === "number" ? value : parseInt(String(value), 10)
                    );
                  }
                  resetPage();
                }}
                placeholder="All subjects"
                disabled={loadingFilterOptions || !examIdFilter}
                allowAll
                allLabel="All subjects"
                searchPlaceholder="Search subjects..."
                emptyMessage="No subjects found"
                triggerClassName="h-8"
              />
            </div>

            <div
              className="inline-flex rounded-md border bg-muted/40 p-0.5"
              role="group"
              aria-label="Paper type"
            >
              {PAPER_PILLS.map((pill) => (
                <Button
                  key={String(pill.value)}
                  type="button"
                  size="sm"
                  variant={testTypeFilter === pill.value ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  disabled={!examIdFilter}
                  onClick={() => {
                    setTestTypeFilter(pill.value);
                    resetPage();
                  }}
                >
                  {pill.label}
                </Button>
              ))}
            </div>

            {hasOptionalFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={clearOptionalFilters}
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            ) : null}
          </div>

          {!examIdFilter ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-background/70 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-inner">
                <Inbox className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Pick an exam to start</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Clearing absent marks is fastest once you scope to an examination.
              </p>
              <div className="mt-5 w-full max-w-sm">
                <SearchableSelect
                  options={examOptions}
                  value={examIdFilter ?? ""}
                  onValueChange={(value) => {
                    if (value === "" || value === "all") {
                      setExamIdFilter(null);
                    } else {
                      setExamIdFilter(
                        typeof value === "number" ? value : parseInt(String(value), 10)
                      );
                    }
                    resetPage();
                  }}
                  placeholder="Select an examination"
                  disabled={loadingFilterOptions}
                  searchPlaceholder="Search examinations..."
                  emptyMessage="No examinations found"
                />
              </div>
            </div>
          ) : queueClear ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border bg-background/80 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                <PartyPopper className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">Queue clear</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {hasOptionalFilters
                  ? "No absent marks match these filters. Clear filters to see the rest of the exam."
                  : "Every absent mark for this exam has been confirmed or corrected."}
              </p>
              {sessionConfirmed + sessionCorrected > 0 ? (
                <p className="mt-3 text-sm font-medium tabular-nums">
                  This session · {sessionConfirmed} confirmed · {sessionCorrected} corrected
                </p>
              ) : null}
              {hasOptionalFilters ? (
                <Button variant="outline" className="mt-4" onClick={clearOptionalFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : loading && entries.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
              <AbsentReviewDataTable
                entries={entries}
                loading={loading}
                error={error}
                onRetry={() => void loadEntries()}
                onRowClick={handleOpenWorkspace}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  resetPage();
                }}
                currentPage={page}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
                searchInputRef={searchInputRef}
              />
            </div>
          )}
        </div>

        <AbsentReviewWorkspace
          open={workspaceOpen}
          onOpenChange={setWorkspaceOpen}
          entries={entries}
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
