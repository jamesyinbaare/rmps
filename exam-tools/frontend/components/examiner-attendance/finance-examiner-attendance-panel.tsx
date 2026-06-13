"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildExaminerAttendanceGrid,
  ExaminerAttendanceGridTable,
  filterAttendanceGridRows,
} from "@/components/examiner-attendance/examiner-attendance-grid-table";
import { ExaminerSubjectFilterCommandBar } from "@/components/examiner-attendance/examiner-subject-filter-command-bar";
import {
  apiJson,
  getExaminationExaminerMarkingRates,
  listAdminExaminerAllowances,
  listAdminExaminerMarkingSubjectSummary,
  listExaminerAttendanceAll,
  type AdminExaminerAllowanceRow,
  type AdminExaminerMarkingSubjectSummaryRow,
  type ExaminerAllowanceSubjectRef,
  type ExaminerAttendanceRow,
  type Examination,
} from "@/lib/api";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPageLayoutClass,
  officialAccountsPanelFillClass,
  officialAccountsTableLayoutClass,
} from "@/lib/official-accounts-zone";
import {
  parseScriptControlSubjectTypeFilter,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

const SECTION_ID = "examiner-attendance-finance";
const ROSTER_PAGE_SIZE = 500;

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

export function FinanceExaminerAttendancePanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState("");
  const [summaries, setSummaries] = useState<AdminExaminerMarkingSubjectSummaryRow[]>([]);
  const [subjectRefs, setSubjectRefs] = useState<ExaminerAllowanceSubjectRef[]>([]);
  const [items, setItems] = useState<ExaminerAttendanceRow[]>([]);
  const [roster, setRoster] = useState<AdminExaminerAllowanceRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);

  const pendingSubjectFromUrlRef = useRef<string | null>(null);
  const loadedListKeyRef = useRef("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsedSubjectId = subjectId ? Number.parseInt(subjectId, 10) : null;
  const canLoad = examId != null && !!subjectId.trim();

  const subjectRefById = useMemo(() => {
    const map = new Map<number, ExaminerAllowanceSubjectRef>();
    for (const ref of subjectRefs) map.set(ref.id, ref);
    return map;
  }, [subjectRefs]);

  const filteredSummaries = useMemo(() => {
    return summaries.filter((row) => {
      const ref = subjectRefById.get(row.subject_id);
      if (!ref) return true;
      if (subjectTypeFilter === "all") return true;
      return ref.subject_type === subjectTypeFilter;
    });
  }, [summaries, subjectRefById, subjectTypeFilter]);

  const subjectOptions = useMemo(
    () =>
      filteredSummaries.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} — ${s.subject_name}`,
      })),
    [filteredSummaries],
  );

  const grid = useMemo(() => buildExaminerAttendanceGrid(roster, items), [roster, items]);
  const filteredGrid = useMemo(
    () => filterAttendanceGridRows(grid, searchQuery),
    [grid, searchQuery],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (!cancelled) setExams(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load examinations.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlHydrated) return;
    const rawExam = searchParams.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) setExamId(n);
    } else {
      setExamId(exams[0]!.id);
    }
    setSubjectTypeFilter(parseScriptControlSubjectTypeFilter(searchParams.get("stype")));
    const subjectFromUrl = searchParams.get("subject")?.trim() ?? "";
    pendingSubjectFromUrlRef.current = subjectFromUrl || null;
    setSubjectId(subjectFromUrl);
    setSearchQuery(searchParams.get("search")?.trim() ?? "");
    setUrlHydrated(true);
  }, [exams, searchParams, urlHydrated]);

  const syncUrl = useCallback(
    (patch: {
      examId?: number | null;
      subjectType?: ScriptControlSubjectTypeFilter;
      subjectId?: string;
      search?: string;
    }) => {
      const p = new URLSearchParams();
      const nextExam = patch.examId !== undefined ? patch.examId : examId;
      const nextSubjectType = patch.subjectType ?? subjectTypeFilter;
      const nextSubject = patch.subjectId !== undefined ? patch.subjectId : subjectId;
      const nextSearch = patch.search !== undefined ? patch.search : searchQuery;
      if (nextExam != null) p.set("exam", String(nextExam));
      if (nextSubjectType !== "all") p.set("stype", nextSubjectType);
      if (nextSubject.trim()) p.set("subject", nextSubject.trim());
      if (nextSearch.trim()) p.set("search", nextSearch.trim());
      const nextQuery = p.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) return;
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [examId, pathname, router, searchParams, searchQuery, subjectId, subjectTypeFilter],
  );

  const fetchExamData = useCallback(async () => {
    if (examId == null) return;
    setSummaryBusy(true);
    setLoadError(null);
    try {
      const [summaryData, markingRates] = await Promise.all([
        listAdminExaminerMarkingSubjectSummary(examId),
        getExaminationExaminerMarkingRates(examId),
      ]);
      setSummaries(summaryData.items);
      setSubjectRefs(markingRates.subjects);

      const pendingSubject = pendingSubjectFromUrlRef.current;
      pendingSubjectFromUrlRef.current = null;

      if (summaryData.items.length === 0) {
        setSubjectId("");
        return;
      }

      setSubjectId((prev) => {
        if (prev && summaryData.items.some((s) => String(s.subject_id) === prev)) return prev;
        if (pendingSubject && summaryData.items.some((s) => String(s.subject_id) === pendingSubject)) {
          return pendingSubject;
        }
        return String(summaryData.items[0]!.subject_id);
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load subjects.");
      setSummaries([]);
      setSubjectRefs([]);
      setSubjectId("");
    } finally {
      setSummaryBusy(false);
    }
  }, [examId]);

  useEffect(() => {
    if (!urlHydrated || examId == null) return;
    void fetchExamData();
  }, [urlHydrated, examId, fetchExamData]);

  useEffect(() => {
    if (!urlHydrated || summaryBusy) return;
    if (filteredSummaries.length === 0) {
      setSubjectId((prev) => (prev ? "" : prev));
      return;
    }
    setSubjectId((prev) => {
      if (prev && filteredSummaries.some((s) => String(s.subject_id) === prev)) return prev;
      return String(filteredSummaries[0]!.subject_id);
    });
  }, [filteredSummaries, summaryBusy, urlHydrated]);

  const listQueryKey = useMemo(
    () => `${examId}:${subjectId}`,
    [examId, subjectId],
  );

  const fetchAttendance = useCallback(async () => {
    if (examId == null || !subjectId.trim() || parsedSubjectId == null || summaryBusy) {
      if (!summaryBusy) {
        setItems([]);
        setRoster([]);
      }
      return;
    }
    const key = listQueryKey;
    if (loadedListKeyRef.current === key) return;

    setListBusy(true);
    setLoadError(null);
    try {
      const [attendanceData, rosterData] = await Promise.all([
        listExaminerAttendanceAll({
          admin: true,
          examinationId: examId,
          subjectId: parsedSubjectId,
        }),
        listAdminExaminerAllowances({
          examination_id: examId,
          subject_id: parsedSubjectId,
          limit: ROSTER_PAGE_SIZE,
        }),
      ]);
      setItems(attendanceData.items);
      setRoster(rosterData.items);
      loadedListKeyRef.current = key;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load attendance.");
      setItems([]);
      setRoster([]);
    } finally {
      setListBusy(false);
    }
  }, [examId, listQueryKey, parsedSubjectId, subjectId, summaryBusy]);

  useEffect(() => {
    if (!urlHydrated || summaryBusy) return;
    loadedListKeyRef.current = "";
    void fetchAttendance();
  }, [urlHydrated, summaryBusy, fetchAttendance]);

  useEffect(() => {
    if (!urlHydrated) return;
    syncUrl({});
  }, [urlHydrated, examId, subjectTypeFilter, subjectId, searchQuery, syncUrl]);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      syncUrl({ search: q });
    }, 300);
  }

  const subjectEmptyText = summaryBusy
    ? "Loading subjects…"
    : filteredSummaries.length
      ? "No match."
      : subjectTypeFilter !== "all"
        ? "No subjects for this type."
        : "No subjects with data.";

  const busy = summaryBusy || listBusy;
  const tableMeta = busy
    ? "Loading attendance…"
    : filteredGrid.dates.length > 0
      ? `${filteredGrid.rows.length.toLocaleString()} examiner${filteredGrid.rows.length === 1 ? "" : "s"} · ${filteredGrid.dates.length} day${filteredGrid.dates.length === 1 ? "" : "s"}`
      : `${filteredGrid.rows.length.toLocaleString()} examiner${filteredGrid.rows.length === 1 ? "" : "s"}`;

  const emptyLabel = !canLoad
    ? "Select an examination and subject to view attendance."
    : searchQuery.trim() && filteredGrid.rows.length === 0 && grid.rows.length > 0
      ? "No examiners match your search."
      : grid.dates.length === 0
        ? "No attendance has been recorded for this subject yet."
        : "No examiners on this subject roster.";

  return (
    <div className={officialAccountsPageLayoutClass}>
      <div className={officialAccountsPanelFillClass}>
        <ExaminerSubjectFilterCommandBar
          sectionId={SECTION_ID}
          exams={exams}
          examId={examId}
          onExamChange={(id) => {
            setExamId(id);
            setSubjectId("");
            setSummaries([]);
            setSubjectRefs([]);
            setItems([]);
            setRoster([]);
            pendingSubjectFromUrlRef.current = null;
            loadedListKeyRef.current = "";
            syncUrl({ examId: id, subjectId: "" });
          }}
          formatExamLabel={formatExamLabel}
          subjectTypeFilter={subjectTypeFilter}
          onSubjectTypeFilterChange={(stype) => {
            setSubjectTypeFilter(stype);
            setSubjectId("");
            loadedListKeyRef.current = "";
            syncUrl({ subjectType: stype, subjectId: "" });
          }}
          subjectId={subjectId}
          onSubjectChange={(id) => {
            setSubjectId(id);
            loadedListKeyRef.current = "";
            syncUrl({ subjectId: id });
          }}
          subjectOptions={subjectOptions}
          subjectsDisabled={summaryBusy && subjectOptions.length === 0}
          subjectEmptyText={subjectEmptyText}
        />

        <div className={cn(officialAccountsTableLayoutClass, "border-t border-border/60")}>
          {canLoad ? (
            <div className={cn(officialAccountsCommandBarClass, "shrink-0 border-b border-border/60 py-3")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="examiner-attendance-search">
                    Search examiners
                  </label>
                  <input
                    id="examiner-attendance-search"
                    type="search"
                    className={cn(officialAccountsCommandBarSearchClass, "mt-1 max-w-none")}
                    placeholder="Name, reference code, or phone…"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    disabled={listBusy && roster.length === 0}
                  />
                </div>
                <p className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
                  {tableMeta}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Attendance grid</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Examiners by row; each column is a day marking attendance was taken.
                </p>
              </div>
            </div>
          )}

          {loadError ? (
            <p className="shrink-0 px-4 py-3 text-sm text-destructive sm:px-5">{loadError}</p>
          ) : null}

          <ExaminerAttendanceGridTable
            rows={canLoad ? filteredGrid.rows : []}
            dates={canLoad ? filteredGrid.dates : []}
            busy={busy && canLoad}
            emptyLabel={emptyLabel}
          />
        </div>
      </div>
    </div>
  );
}
