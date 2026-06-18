"use client";

import Link from "next/link";
import { ArrowLeft, Download, Eye, FileText, Loader2, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  downloadAdminExaminerMarkingAttendanceSheet,
  downloadAdminExaminerMarkingAttendanceSheetsZip,
  fetchAdminExaminerMarkingAttendanceSheetBlob,
  getAdminExaminerMarkingAttendanceSheetSummary,
  getExaminationExaminerMarkingRates,
  listAdminExaminerMarkingAttendanceSheets,
  listAdminExaminerMarkingSubjectSummary,
  listAdminSubjectMarkingGroups,
  listExaminations,
  type AdminExaminerMarkingSubjectSummaryRow,
  type ExaminerAllowanceSubjectRef,
  type ExaminerMarkingAttendanceSheetAdmin,
  type ExaminerMarkingAttendanceSheetAdminSummary,
  type Examination,
  type SubjectMarkingGroupRow,
} from "@/lib/api";
import {
  buildExaminerAccountsBySubjectHref,
  officialAccountsBtnSecondary,
  officialAccountsCommandBarClass,
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPageLayoutClass,
  officialAccountsPanelFillClass,
  officialAccountsTableLayoutClass,
} from "@/lib/official-accounts-zone";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  parseScriptControlSubjectTypeFilter,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

const SECTION_ID = "examiner-paper-attendance";

const inputGroupShellClass =
  "flex w-full min-w-0 overflow-hidden rounded-lg border border-input-border bg-input shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30";

const inputGroupSelectClass = cn(
  officialAccountsCommandBarControlClass,
  "h-10 shrink-0 appearance-none rounded-none border-0 bg-input px-2.5 shadow-none hover:bg-input focus:ring-0 focus:ring-offset-0 disabled:bg-input",
);

const inputGroupSubjectTriggerClass =
  "h-10 max-h-10 min-w-0 flex-1 overflow-hidden rounded-none border-0 border-l border-input-border bg-input shadow-none hover:bg-input focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-input";

const standaloneTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";

const toolbarRowClass =
  "grid min-w-0 grid-cols-1 items-end gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,4fr)_minmax(0,2fr)_minmax(0,1.5fr)]";

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SheetGroup = {
  cohortId: string;
  cohortName: string;
  sheets: ExaminerMarkingAttendanceSheetAdmin[];
};

function groupSheetsByCohort(items: ExaminerMarkingAttendanceSheetAdmin[]): SheetGroup[] {
  const map = new Map<string, SheetGroup>();
  for (const sheet of items) {
    const existing = map.get(sheet.cohort_id);
    if (existing) {
      existing.sheets.push(sheet);
    } else {
      map.set(sheet.cohort_id, {
        cohortId: sheet.cohort_id,
        cohortName: sheet.cohort_name,
        sheets: [sheet],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.cohortName.localeCompare(b.cohortName));
}

export function ExaminerPaperAttendancePanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState("");
  const [cohortFilter, setCohortFilter] = useState("");
  const [cohorts, setCohorts] = useState<SubjectMarkingGroupRow[]>([]);
  const [cohortsBusy, setCohortsBusy] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState("");
  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<AdminExaminerMarkingSubjectSummaryRow[]>([]);
  const [subjectRefs, setSubjectRefs] = useState<ExaminerAllowanceSubjectRef[]>([]);
  const [items, setItems] = useState<ExaminerMarkingAttendanceSheetAdmin[]>([]);
  const [summary, setSummary] = useState<ExaminerMarkingAttendanceSheetAdminSummary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [urlHydrated, setUrlHydrated] = useState(false);

  const pendingSubjectFromUrlRef = useRef<string | null>(null);
  const pendingCohortFromUrlRef = useRef<string | null>(null);
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
      filteredSummaries.map((row) => ({
        value: String(row.subject_id),
        label: `${row.subject_code} — ${row.subject_name}`,
      })),
    [filteredSummaries],
  );

  const cohortOptions = useMemo(
    () =>
      cohorts.map((cohort) => ({
        value: cohort.id,
        label: `${cohort.name} (${cohort.examiner_ids.length} examiner${cohort.examiner_ids.length === 1 ? "" : "s"})`,
      })),
    [cohorts],
  );

  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === cohortFilter) ?? null,
    [cohorts, cohortFilter],
  );

  const selectedSummary = useMemo(
    () => summaries.find((row) => String(row.subject_id) === subjectId) ?? null,
    [summaries, subjectId],
  );

  const selectedExam = useMemo(() => exams.find((exam) => exam.id === examId) ?? null, [examId, exams]);

  const sheetGroups = useMemo(() => {
    if (cohortFilter) return null;
    return groupSheetsByCohort(items);
  }, [cohortFilter, items]);

  const backToAccountsHref = useMemo(() => {
    if (examId == null || !subjectId.trim()) return null;
    return buildExaminerAccountsBySubjectHref({
      examId,
      subjectId,
      cohortId: cohortFilter || undefined,
      subjectType: subjectTypeFilter,
    });
  }, [cohortFilter, examId, subjectId, subjectTypeFilter]);

  useEffect(() => {
    void listExaminations()
      .then(setExams)
      .catch(() => setExams([]));
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlHydrated) return;
    const rawExam = searchParams.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((exam) => exam.id === n)) setExamId(n);
    } else {
      setExamId(exams[0]!.id);
    }
    setSubjectTypeFilter(parseScriptControlSubjectTypeFilter(searchParams.get("stype")));
    const subjectFromUrl = searchParams.get("subject")?.trim() ?? "";
    pendingSubjectFromUrlRef.current = subjectFromUrl || null;
    setSubjectId(subjectFromUrl);
    const cohortFromUrl = searchParams.get("cohort")?.trim() ?? "";
    pendingCohortFromUrlRef.current = cohortFromUrl || null;
    setCohortFilter(cohortFromUrl);
    setAttendanceDate(searchParams.get("date")?.trim() ?? "");
    setSearch(searchParams.get("q")?.trim() ?? "");
    setUrlHydrated(true);
  }, [exams, searchParams, urlHydrated]);

  const syncUrl = useCallback(
    (patch: {
      examId?: number | null;
      subjectType?: ScriptControlSubjectTypeFilter;
      subjectId?: string;
      cohort?: string;
      date?: string;
      q?: string;
    }) => {
      const p = new URLSearchParams();
      const nextExam = patch.examId !== undefined ? patch.examId : examId;
      const nextSubjectType = patch.subjectType ?? subjectTypeFilter;
      const nextSubject = patch.subjectId !== undefined ? patch.subjectId : subjectId;
      const nextCohort = patch.cohort !== undefined ? patch.cohort : cohortFilter;
      const nextDate = patch.date !== undefined ? patch.date : attendanceDate;
      const nextSearch = patch.q !== undefined ? patch.q : search;
      if (nextExam != null) p.set("exam", String(nextExam));
      if (nextSubjectType !== "all") p.set("stype", nextSubjectType);
      if (nextSubject.trim()) p.set("subject", nextSubject.trim());
      if (nextCohort.trim()) p.set("cohort", nextCohort.trim());
      if (nextDate.trim()) p.set("date", nextDate.trim());
      if (nextSearch.trim()) p.set("q", nextSearch.trim());
      const nextQuery = p.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) return;
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [
      attendanceDate,
      cohortFilter,
      examId,
      pathname,
      router,
      search,
      searchParams,
      subjectId,
      subjectTypeFilter,
    ],
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
        if (prev && summaryData.items.some((row) => String(row.subject_id) === prev)) return prev;
        if (pendingSubject && summaryData.items.some((row) => String(row.subject_id) === pendingSubject)) {
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
      if (prev && filteredSummaries.some((row) => String(row.subject_id) === prev)) return prev;
      return String(filteredSummaries[0]!.subject_id);
    });
  }, [filteredSummaries, summaryBusy, urlHydrated]);

  useEffect(() => {
    if (!urlHydrated || examId == null || !subjectId.trim() || parsedSubjectId == null) {
      setCohorts([]);
      return;
    }
    let cancelled = false;
    setCohortsBusy(true);
    void (async () => {
      try {
        const rows = await listAdminSubjectMarkingGroups(examId, parsedSubjectId);
        if (cancelled) return;
        setCohorts(rows);
        const pendingCohort = pendingCohortFromUrlRef.current;
        pendingCohortFromUrlRef.current = null;
        setCohortFilter((prev) => {
          if (prev && rows.some((row) => row.id === prev)) return prev;
          if (pendingCohort && rows.some((row) => row.id === pendingCohort)) return pendingCohort;
          return "";
        });
      } catch (e) {
        if (!cancelled) {
          setCohorts([]);
          setLoadError(e instanceof Error ? e.message : "Failed to load cohorts.");
        }
      } finally {
        if (!cancelled) setCohortsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlHydrated, examId, subjectId, parsedSubjectId]);

  useEffect(() => {
    if (!urlHydrated || cohortsBusy) return;
    if (!cohortFilter) return;
    if (!cohorts.some((cohort) => cohort.id === cohortFilter)) {
      setCohortFilter("");
      loadedListKeyRef.current = "";
      syncUrl({ cohort: "" });
    }
  }, [cohorts, cohortFilter, cohortsBusy, urlHydrated, syncUrl]);

  const listQueryKey = useMemo(
    () => `${examId}:${subjectId}:${cohortFilter}:${attendanceDate}:${search.trim()}`,
    [attendanceDate, cohortFilter, examId, search, subjectId],
  );

  const fetchSheets = useCallback(
    async (force = false) => {
      if (examId == null || !subjectId.trim()) {
        setItems([]);
        setSummary(null);
        return;
      }
      if (!force && loadedListKeyRef.current === listQueryKey) return;

      setListBusy(true);
      setLoadError(null);
      try {
        const [list, sum] = await Promise.all([
          listAdminExaminerMarkingAttendanceSheets(examId, {
            subjectId: Number.parseInt(subjectId, 10),
            groupId: cohortFilter || null,
            attendanceDate: attendanceDate || null,
            q: search.trim() || null,
            page: 1,
            pageSize: 200,
          }),
          getAdminExaminerMarkingAttendanceSheetSummary(examId, {
            subjectId: Number.parseInt(subjectId, 10),
            attendanceDate: attendanceDate || null,
          }),
        ]);
        setItems(list.items);
        setSummary(sum);
        loadedListKeyRef.current = listQueryKey;
      } catch (e) {
        setItems([]);
        setSummary(null);
        setLoadError(e instanceof Error ? e.message : "Failed to load attendance sheets.");
      } finally {
        setListBusy(false);
      }
    },
    [attendanceDate, cohortFilter, examId, listQueryKey, search, subjectId],
  );

  useEffect(() => {
    if (!urlHydrated) return;
    void fetchSheets();
  }, [urlHydrated, fetchSheets]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handlePreview(sheet: ExaminerMarkingAttendanceSheetAdmin) {
    if (examId == null) return;
    setBusy(true);
    setLoadError(null);
    try {
      const blob = await fetchAdminExaminerMarkingAttendanceSheetBlob(examId, sheet.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewTitle(sheet.original_filename);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleZipDownload() {
    if (examId == null || parsedSubjectId == null) return;
    setBusy(true);
    setLoadError(null);
    try {
      await downloadAdminExaminerMarkingAttendanceSheetsZip({
        examId,
        subjectId: parsedSubjectId,
        groupId: cohortFilter || null,
        attendanceDate: attendanceDate || null,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Zip download failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadedListKeyRef.current = "";
      syncUrl({ q: value });
    }, 300);
  }

  const subjectEmptyText = summaryBusy
    ? "Loading subjects…"
    : filteredSummaries.length
      ? "No match."
      : subjectTypeFilter !== "all"
        ? "No subjects for this type."
        : "No subjects with marking data.";

  const cohortEmptyText = cohortsBusy
    ? "Loading cohorts…"
    : cohorts.length
      ? "No match."
      : "No cohorts for this subject.";

  const initialLoading = summaryBusy && summaries.length === 0;
  const loading = summaryBusy || listBusy;
  const tableMeta = loading
    ? "Loading sheets…"
    : items.length === 0
      ? "No uploads yet"
      : `${items.length} upload${items.length === 1 ? "" : "s"}${selectedCohort ? ` · ${selectedCohort.name}` : sheetGroups ? ` · ${sheetGroups.length} cohort${sheetGroups.length === 1 ? "" : "s"}` : ""}`;

  const emptyLabel = !canLoad
    ? "Select an examination and subject to view signed paper attendance."
    : cohortFilter && items.length === 0
      ? `No signed sheets uploaded for ${selectedCohort?.name ?? "this cohort"} yet.`
      : items.length === 0
        ? "No signed paper attendance sheets have been uploaded for this subject yet."
        : search.trim()
          ? "No uploads match your search."
          : "";

  function renderSheetRow(sheet: ExaminerMarkingAttendanceSheetAdmin, showCohort: boolean) {
    return (
      <tr key={sheet.id} className="border-b border-border/70 align-middle">
        <td className="px-4 py-3 whitespace-nowrap">{formatDateLabel(sheet.attendance_date)}</td>
        {showCohort ? <td className="px-4 py-3">{sheet.cohort_name}</td> : null}
        <td className="px-4 py-3">
          <div className="max-w-xs truncate font-medium">{sheet.original_filename}</div>
          <div className="text-xs text-muted-foreground">
            {formatFileSize(sheet.size_bytes)}
            {sheet.notes ? ` · ${sheet.notes}` : ""}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{sheet.uploader_full_name ?? "—"}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={busy || examId == null}
              onClick={() => void handlePreview(sheet)}
            >
              <Eye className="size-4" />
              Preview
            </button>
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={busy || examId == null}
              onClick={() => void downloadAdminExaminerMarkingAttendanceSheet(examId!, sheet)}
            >
              <Download className="size-4" />
              Download
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className={officialAccountsPageLayoutClass}>
      <div className={officialAccountsPanelFillClass}>
        {backToAccountsHref ? (
          <div className="shrink-0 border-b border-border/60 px-4 py-2.5 sm:px-5">
            <Link
              href={backToAccountsHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              Bank accounts by subject
            </Link>
          </div>
        ) : null}

        <div className={cn(officialAccountsCommandBarClass, "overflow-visible")}>
          <div className={toolbarRowClass}>
            <CommandBarBorderField label="Examination" htmlFor={`${SECTION_ID}-exam`} className="min-w-0">
              <SearchableCombobox
                id={`${SECTION_ID}-exam`}
                options={exams.map((exam) => ({
                  value: String(exam.id),
                  label: formatExamLabel(exam),
                }))}
                value={examId != null ? String(examId) : ""}
                onChange={(value) => {
                  const id = value ? Number(value) : null;
                  setExamId(id);
                  setSubjectId("");
                  setCohortFilter("");
                  setCohorts([]);
                  setSummaries([]);
                  setSubjectRefs([]);
                  pendingSubjectFromUrlRef.current = null;
                  pendingCohortFromUrlRef.current = null;
                  loadedListKeyRef.current = "";
                  syncUrl({ examId: id, subjectId: "", cohort: "" });
                }}
                placeholder="Select examination…"
                searchPlaceholder="Examination…"
                emptyText="No examination found."
                widthClass="w-full"
                truncateTrigger
                triggerClassName={standaloneTriggerClass}
                showAllOption={false}
                disabled={exams.length === 0}
              />
            </CommandBarBorderField>

            <CommandBarBorderField label="Subject" htmlFor={`${SECTION_ID}-subject`} className="min-w-0">
              <div className={inputGroupShellClass}>
                <select
                  id={`${SECTION_ID}-subject-type`}
                  aria-label="Subject type"
                  className={cn(
                    inputGroupSelectClass,
                    "w-[28%] min-w-28 max-w-40 shrink-0 border-r border-input-border",
                  )}
                  value={subjectTypeFilter}
                  disabled={examId == null || (summaryBusy && subjectOptions.length === 0)}
                  onChange={(e) => {
                    const stype = e.target.value as ScriptControlSubjectTypeFilter;
                    setSubjectTypeFilter(stype);
                    setSubjectId("");
                    setCohortFilter("");
                    setCohorts([]);
                    loadedListKeyRef.current = "";
                    syncUrl({ subjectType: stype, subjectId: "", cohort: "" });
                  }}
                >
                  {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <SearchableCombobox
                    id={`${SECTION_ID}-subject`}
                    options={subjectOptions}
                    value={subjectId}
                    onChange={(id) => {
                      setSubjectId(id);
                      setCohortFilter("");
                      loadedListKeyRef.current = "";
                      syncUrl({ subjectId: id, cohort: "" });
                    }}
                    placeholder="Select subject…"
                    searchPlaceholder="Code or name…"
                    emptyText={subjectEmptyText}
                    widthClass="w-full max-w-full"
                    popoverWidthClass="min-w-[var(--radix-popover-trigger-width)]"
                    truncateTrigger
                    triggerClassName={inputGroupSubjectTriggerClass}
                    showAllOption={false}
                    disabled={examId == null || (summaryBusy && subjectOptions.length === 0)}
                  />
                </div>
              </div>
            </CommandBarBorderField>

            <CommandBarBorderField label="Cohort" htmlFor={`${SECTION_ID}-cohort`} className="min-w-0">
              <SearchableCombobox
                id={`${SECTION_ID}-cohort`}
                options={cohortOptions}
                value={cohortFilter}
                onChange={(cohort) => {
                  setCohortFilter(cohort);
                  loadedListKeyRef.current = "";
                  syncUrl({ cohort });
                }}
                placeholder="All cohorts"
                searchPlaceholder="Cohort…"
                emptyText={cohortEmptyText}
                widthClass="w-full"
                truncateTrigger
                triggerClassName={standaloneTriggerClass}
                allOptionLabel="All cohorts"
                disabled={!canLoad || cohortsBusy}
              />
            </CommandBarBorderField>

            <CommandBarBorderField label="Attendance date" htmlFor={`${SECTION_ID}-date`} className="min-w-0">
              <input
                id={`${SECTION_ID}-date`}
                type="date"
                className={cn(standaloneTriggerClass, "px-3")}
                value={attendanceDate}
                disabled={!canLoad}
                onChange={(e) => {
                  setAttendanceDate(e.target.value);
                  loadedListKeyRef.current = "";
                  syncUrl({ date: e.target.value });
                }}
              />
            </CommandBarBorderField>
          </div>
        </div>

        {loadError ? (
          <div
            className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive sm:mx-5 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p>{loadError}</p>
            {canLoad ? (
              <button type="button" className={officialAccountsBtnSecondary} onClick={() => void fetchSheets(true)}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!canLoad && !initialLoading ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center sm:px-5">
            <FileText className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-foreground">Choose a subject</p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Select an examination and subject above. Optionally narrow to one cohort or attendance date to review
              signed paper sheets uploaded by subject officers.
            </p>
          </div>
        ) : null}

        {canLoad && selectedSummary ? (
          <div className="grid shrink-0 gap-3 border-b border-border/60 px-4 py-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {selectedSummary.subject_code} — {selectedSummary.subject_name}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uploads</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {summary?.total_uploads ?? (loading ? "…" : "0")}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cohorts with sheets</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {summary?.cohorts_with_uploads ?? (loading ? "…" : "0")}
                {summary?.cohorts_expected != null ? ` / ${summary.cohorts_expected}` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing cohorts</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {summary?.cohorts_missing ?? (loading ? "…" : "—")}
              </p>
            </div>
          </div>
        ) : null}

        {canLoad ? (
          <div className={cn(officialAccountsTableLayoutClass, "border-t border-border/60")}>
            <div className={cn(officialAccountsCommandBarClass, "shrink-0 border-b border-border/60 py-3")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 max-w-xl">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={`${SECTION_ID}-search`}>
                    Search uploads
                  </label>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id={`${SECTION_ID}-search`}
                      type="search"
                      className={cn(officialAccountsCommandBarSearchClass, "w-full max-w-none pl-9")}
                      placeholder="Cohort, filename, uploader…"
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      disabled={loading && items.length === 0}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={officialAccountsBtnSecondary}
                    disabled={busy || items.length === 0}
                    onClick={() => void handleZipDownload()}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Download zip
                  </button>
                  <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
                    {tableMeta}
                  </p>
                </div>
              </div>
            </div>

            {selectedCohort ? (
              <div className="shrink-0 border-b border-border/60 bg-primary/4 px-4 py-2.5 text-sm sm:px-5">
                Showing signed sheets for cohort{" "}
                <span className="font-semibold text-foreground">{selectedCohort.name}</span>
                {selectedExam ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {selectedExam.exam_type} {selectedExam.year}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto">
              {loading && items.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Loading signed sheets…</p>
              ) : emptyLabel ? (
                <p className="p-6 text-sm text-muted-foreground">{emptyLabel}</p>
              ) : sheetGroups && sheetGroups.length > 0 ? (
                <div className="divide-y divide-border/70">
                  {sheetGroups.map((group) => (
                    <section key={group.cohortId}>
                      <div className="sticky top-0 z-10 border-b border-border/60 bg-muted/40 px-4 py-2.5 sm:px-5">
                        <h3 className="text-sm font-semibold text-foreground">{group.cohortName}</h3>
                        <p className="text-xs text-muted-foreground">
                          {group.sheets.length} upload{group.sheets.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <table className="min-w-full text-sm">
                        <thead className="border-b border-border bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">File</th>
                            <th className="px-4 py-3">Uploaded by</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>{group.sheets.map((sheet) => renderSheetRow(sheet, false))}</tbody>
                      </table>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Cohort</th>
                        <th className="px-4 py-3">File</th>
                        <th className="px-4 py-3">Uploaded by</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>{items.map((sheet) => renderSheetRow(sheet, true))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {previewUrl ? (
        <div className="fixed inset-0 z-120 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0 bg-foreground/50"
            onClick={() => {
              setPreviewUrl(null);
              setPreviewTitle(null);
            }}
          />
          <div className="relative z-10 flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="truncate text-sm font-semibold">{previewTitle}</h2>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={() => {
                  setPreviewUrl(null);
                  setPreviewTitle(null);
                }}
              >
                Close
              </button>
            </div>
            <iframe title={previewTitle ?? "Preview"} src={previewUrl} className="min-h-0 flex-1 bg-muted/20" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
