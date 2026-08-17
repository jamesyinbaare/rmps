"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Search, Upload } from "lucide-react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS,
  EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS,
  EXAMINERS_PANEL_CLASS,
  EXAMINERS_TABLE_INNER_SCROLL_CLASS,
  PAGE_SIZE_PRESETS,
} from "@/components/examiners/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  downloadManualMarkedScriptsTemplate,
  downloadSubjectOfficerManualMarkedScriptsTemplate,
  getMarkingScriptSource,
  getSubjectOfficerMarkingScriptSource,
  listAllSubjects,
  listExaminations,
  updateMarkingScriptSource,
  uploadManualMarkedScripts,
  uploadSubjectOfficerManualMarkedScripts,
  upsertManualMarkedScripts,
  upsertSubjectOfficerManualMarkedScripts,
  type Examination,
  type ManualMarkedScriptsUploadResponse,
  type MarkingScriptSourceExaminerRow,
  type MarkingScriptSourceResponse,
  type Subject,
} from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import {
  parseScriptControlSubjectTypeFilter,
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import {
  officialAccountsCommandBarControlClass,
  officialAccountsCommandBarSearchClass,
  officialAccountsPanelFooterClass,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

import {
  manualAllocationHref,
  scriptsAllocationHref,
} from "@/app/dashboard/admin/scripts-allocation/scripts-allocation-href";

const DEFAULT_PAGE_SIZE = 50;
const inputFocusRing = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const scriptsInputClass = `${formInputClass} h-8 w-[4.75rem] text-right tabular-nums [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
const filterTriggerClass =
  "h-9 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";
const filterSelectClass = cn(officialAccountsCommandBarControlClass, "h-9 w-full disabled:opacity-60");
const thClass = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const tdClass = "px-3 py-1.5 align-middle";
const hiddenOnSmClass = "hidden sm:table-cell";
const nameColClass = "w-[10.5rem] sm:w-[13rem]";
const indexColClass = "w-10 whitespace-nowrap text-right tabular-nums";
const numericColClass = "w-[7.25rem] whitespace-nowrap text-right";
const scriptsColClass = "w-[7.25rem] whitespace-nowrap text-right";

function HeaderWithTooltip({ label, description }: { label: string; description: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full cursor-help items-center justify-end gap-1 border-0 bg-transparent p-0 text-inherit underline decoration-muted-foreground/40 decoration-dotted underline-offset-2"
        >
          <span className="truncate">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left font-normal normal-case tracking-normal">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

type RoleFilter = "" | "chief_examiner" | "assistant_chief_examiner" | "team_leader" | "assistant_examiner";
type StatusFilter = "all" | "missing" | "has";

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "chief_examiner", label: "Chief" },
  { value: "assistant_chief_examiner", label: "Asst chief" },
  { value: "team_leader", label: "Team leader" },
  { value: "assistant_examiner", label: "Assistant" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing counts" },
  { value: "has", label: "Has counts" },
];

function formatExaminationLabel(x: Examination): string {
  return `${x.exam_type} ${x.year}${x.exam_series ? ` (${x.exam_series})` : ""} — #${x.id}`;
}

function examinerTypeLabel(t: string): string {
  if (t === "chief_examiner") return "Chief";
  if (t === "assistant_chief_examiner") return "Asst chief";
  if (t === "team_leader") return "Team leader";
  return "Assistant";
}

function manualCountsFromSource(examiners: MarkingScriptSourceExaminerRow[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const row of examiners) {
    next[row.examiner_id] = row.manual_count > 0 ? String(row.manual_count) : "";
  }
  return next;
}

function draftValue(draftCounts: Record<string, string>, row: MarkingScriptSourceExaminerRow): string {
  return draftCounts[row.examiner_id] ?? (row.manual_count > 0 ? String(row.manual_count) : "");
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export type ManualAllocationViewProps = {
  mode?: "admin" | "subject-officer";
  lockedExamId?: number;
  lockedSubjectId?: number;
  workspaceLabel?: string;
  embedded?: boolean;
};

export function ManualAllocationView({
  mode = "admin",
  lockedExamId,
  lockedSubjectId,
  workspaceLabel,
  embedded = false,
}: ManualAllocationViewProps) {
  const isSubjectOfficer = mode === "subject-officer";
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(lockedExamId ?? null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState<number | null>(lockedSubjectId ?? null);
  const [paper, setPaper] = useState<number | null>(null);
  const [gridSearch, setGridSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [sourceData, setSourceData] = useState<MarkingScriptSourceResponse | null>(null);
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ManualMarkedScriptsUploadResponse | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isSubjectOfficer) return;
    setExamId(lockedExamId ?? null);
    setSubjectId(lockedSubjectId ?? null);
  }, [isSubjectOfficer, lockedExamId, lockedSubjectId]);

  const scopeReady = examId != null && subjectId != null && paper != null && paper > 0;

  const examOptions = useMemo(
    () => exams.map((x) => ({ value: String(x.id), label: formatExaminationLabel(x) })),
    [exams],
  );

  const filteredSubjects = useMemo(() => {
    if (subjectTypeFilter === "all") return subjects;
    return subjects.filter((s) => s.subject_type === subjectTypeFilter);
  }, [subjects, subjectTypeFilter]);

  const subjectOptions = useMemo(
    () => filteredSubjects.map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` })),
    [filteredSubjects],
  );

  const paperOptions = useMemo(() => {
    const papers = sourceData?.available_papers ?? [];
    return papers.map((p) => ({ value: String(p), label: `Paper ${p}` }));
  }, [sourceData?.available_papers]);

  const filteredExaminers = useMemo(() => {
    const rows = sourceData?.examiners ?? [];
    const q = gridSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter && row.examiner_type !== roleFilter) return false;
      const raw = draftValue(draftCounts, row).trim();
      const hasCount = raw !== "" && Number(raw) > 0;
      if (statusFilter === "missing" && hasCount) return false;
      if (statusFilter === "has" && !hasCount) return false;
      if (!q) return true;
      const haystack = [row.name, examinerTypeLabel(row.examiner_type), row.phone_number ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sourceData?.examiners, gridSearch, roleFilter, statusFilter, draftCounts]);

  const totalFiltered = filteredExaminers.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredExaminers.slice(start, start + pageSize);
  }, [filteredExaminers, pageSize, safePage]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [gridSearch, roleFilter, statusFilter, pageSize, paper]);

  const stats = useMemo(() => {
    const rows = sourceData?.examiners ?? [];
    let filled = 0;
    let scriptSum = 0;
    let dirty = 0;
    for (const row of rows) {
      const raw = draftValue(draftCounts, row).trim();
      const baseline = row.manual_count > 0 ? String(row.manual_count) : "";
      if (raw !== baseline) dirty += 1;
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        filled += 1;
        scriptSum += n;
      }
    }
    return { total: rows.length, filled, scriptSum, dirty };
  }, [sourceData?.examiners, draftCounts]);

  const replaceUrl = useCallback(
    (next: {
      exam: number | null;
      subjectType?: ScriptControlSubjectTypeFilter;
      subject: number | null;
      paper: number | null;
    }) => {
      if (isSubjectOfficer) return;
      router.replace(
        manualAllocationHref({
          exam: next.exam,
          subjectType: next.subjectType ?? subjectTypeFilter,
          subjectId: next.subject,
          paper: next.paper,
        }),
      );
    },
    [isSubjectOfficer, router, subjectTypeFilter],
  );

  useEffect(() => {
    if (isSubjectOfficer) return;
    let cancelled = false;
    (async () => {
      try {
        const [examList, subjectList] = await Promise.all([listExaminations(), listAllSubjects()]);
        if (cancelled) return;
        setExams(examList);
        setSubjects(subjectList);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load reference data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSubjectOfficer]);

  useEffect(() => {
    if (isSubjectOfficer) return;
    const examParam = searchParams.get("exam");
    const subjectParam = searchParams.get("subject");
    const paperParam = searchParams.get("paper");
    setExamId(examParam && /^\d+$/.test(examParam) ? Number(examParam) : null);
    setSubjectTypeFilter(parseScriptControlSubjectTypeFilter(searchParams.get("stype")));
    setSubjectId(subjectParam && /^\d+$/.test(subjectParam) ? Number(subjectParam) : null);
    setPaper(paperParam && /^\d+$/.test(paperParam) ? Number(paperParam) : null);
  }, [isSubjectOfficer, searchParams]);

  useEffect(() => {
    if (isSubjectOfficer || subjectId == null) return;
    const selected = subjects.find((s) => s.id === subjectId);
    if (selected == null) return;
    if (subjectTypeFilter !== "all" && selected.subject_type !== subjectTypeFilter) {
      setSubjectId(null);
      setPaper(null);
      replaceUrl({ exam: examId, subject: null, paper: null });
    }
  }, [isSubjectOfficer, subjectId, subjects, subjectTypeFilter, examId, replaceUrl]);

  useEffect(() => {
    if (examId == null || subjectId == null) {
      setSourceData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadError(null);
      setListLoading(true);
      try {
        const data = isSubjectOfficer
          ? await getSubjectOfficerMarkingScriptSource(examId, subjectId, scopeReady ? paper : null)
          : await getMarkingScriptSource(examId, subjectId, scopeReady ? paper : null);
        if (cancelled) return;
        setSourceData(data);
        if (paper != null && !data.available_papers.includes(paper)) {
          setPaper(null);
          replaceUrl({ exam: examId, subject: subjectId, paper: null });
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load marking source");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, subjectId, paper, scopeReady, replaceUrl, isSubjectOfficer]);

  useEffect(() => {
    if (!scopeReady || !sourceData) {
      setDraftCounts({});
      return;
    }
    setDraftCounts(manualCountsFromSource(sourceData.examiners));
  }, [scopeReady, sourceData, paper]);

  function onExamChange(value: string) {
    const nextExam = value ? Number(value) : null;
    setExamId(nextExam);
    setSubjectId(null);
    setPaper(null);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    setPendingUploadFile(null);
    replaceUrl({ exam: nextExam, subject: null, paper: null });
  }

  function onSubjectTypeChange(value: ScriptControlSubjectTypeFilter) {
    setSubjectTypeFilter(value);
    setSubjectId(null);
    setPaper(null);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    setPendingUploadFile(null);
    replaceUrl({ exam: examId, subjectType: value, subject: null, paper: null });
  }

  function onSubjectChange(value: string) {
    const nextSubject = value ? Number(value) : null;
    setSubjectId(nextSubject);
    setPaper(null);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    setPendingUploadFile(null);
    replaceUrl({ exam: examId, subject: nextSubject, paper: null });
  }

  function onPaperChange(value: string) {
    const nextPaper = value ? Number(value) : null;
    setPaper(nextPaper);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    setPendingUploadFile(null);
    replaceUrl({ exam: examId, subject: subjectId, paper: nextPaper });
  }

  async function handleUseAllocation() {
    if (isSubjectOfficer || examId == null || subjectId == null) return;
    setBusy(true);
    setActionError(null);
    setSaveMessage(null);
    try {
      const data = await updateMarkingScriptSource(examId, subjectId, "allocation");
      setSourceData(data);
      setSaveMessage("This subject now uses MILP allocation counts for payouts.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update source mode");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGrid() {
    if (!scopeReady || examId == null || subjectId == null || paper == null || !sourceData) return;
    setBusy(true);
    setActionError(null);
    setSaveMessage(null);
    try {
      const items = sourceData.examiners
        .map((row) => {
          const raw = draftCounts[row.examiner_id]?.trim() ?? "";
          if (!raw) return null;
          const count = Number(raw);
          if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
            throw new Error(`Invalid script count for ${row.name}`);
          }
          return {
            examiner_id: row.examiner_id,
            paper_number: paper,
            script_count: count,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      const data = isSubjectOfficer
        ? await upsertSubjectOfficerManualMarkedScripts(examId, subjectId, paper, items)
        : await upsertManualMarkedScripts(examId, subjectId, paper, items);
      setSourceData(data);
      setDraftCounts(manualCountsFromSource(data.examiners));
      setSaveMessage(`Saved manual counts for paper ${paper}.`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadTemplate() {
    if (!scopeReady || examId == null || subjectId == null || paper == null) return;
    setBusy(true);
    setActionError(null);
    try {
      if (isSubjectOfficer) {
        await downloadSubjectOfficerManualMarkedScriptsTemplate(examId, subjectId, paper);
      } else {
        await downloadManualMarkedScriptsTemplate(examId, subjectId, paper);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Template download failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadFile(file: File, validateOnly: boolean) {
    if (!scopeReady || examId == null || subjectId == null || paper == null) return;
    setBusy(true);
    setActionError(null);
    setUploadResult(null);
    setSaveMessage(null);
    try {
      const result = isSubjectOfficer
        ? await uploadSubjectOfficerManualMarkedScripts(examId, subjectId, paper, file, { validateOnly })
        : await uploadManualMarkedScripts(examId, subjectId, paper, file, { validateOnly });
      setUploadResult(result);
      if (!validateOnly && result.errors.length === 0) {
        const data = isSubjectOfficer
          ? await getSubjectOfficerMarkingScriptSource(examId, subjectId, paper)
          : await getMarkingScriptSource(examId, subjectId, paper);
        setSourceData(data);
        setDraftCounts(manualCountsFromSource(data.examiners));
        setSaveMessage(`Upload applied ${result.applied_count} row(s) for paper ${paper}.`);
      }
      if (!validateOnly) setPendingUploadFile(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearPendingUpload() {
    setPendingUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function focusNextInput(index: number) {
    const next = inputRefs.current[index + 1];
    if (next) {
      next.focus();
      next.select();
    }
  }

  const workspace = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Top bar */}
      <div className={cn(EXAMINERS_COMMAND_BAR_EMBEDDED_CLASS, "gap-3")}>
        {!embedded ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                Manual scripts allocation
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                Enter script counts per examiner. Blank fields are not saved.
              </p>
            </div>
            {!isSubjectOfficer ? (
              <Link
                href={scriptsAllocationHref({ exam: examId })}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                ← Automatic allocation
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">Enter figures</p>
            {workspaceLabel ? <span className="text-xs text-muted-foreground">{workspaceLabel}</span> : null}
            {sourceData ? (
              <Badge variant={sourceData.source_mode === "manual" ? "secondary" : "outline"} className="font-normal">
                {sourceData.source_mode === "manual" ? "Manual source" : "From allocation"}
              </Badge>
            ) : null}
          </div>
        )}

        {isSubjectOfficer ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-end">
            <CommandBarBorderField label="Paper" htmlFor="manual-paper" className="min-w-0">
              <SearchableCombobox
                id="manual-paper"
                options={paperOptions}
                value={paper != null ? String(paper) : ""}
                onChange={onPaperChange}
                placeholder="Choose paper…"
                searchPlaceholder="Search paper…"
                widthClass="w-full"
                truncateTrigger
                triggerClassName={filterTriggerClass}
                showAllOption
                allOptionLabel="Choose paper…"
                disabled={subjectId == null || paperOptions.length === 0}
                emptyText={
                  subjectId != null ? "No papers configured for this subject." : "Workspace subject required."
                }
              />
            </CommandBarBorderField>
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <label htmlFor="manual-grid-search" className="sr-only">
                Search examiners
              </label>
              <input
                id="manual-grid-search"
                type="search"
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                placeholder="Search name, role, or phone…"
                className={cn(officialAccountsCommandBarSearchClass, "h-9 pl-8 lg:max-w-none")}
                disabled={!scopeReady}
                autoComplete="off"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <CommandBarBorderField label="Examination" htmlFor="manual-exam" className="min-w-0">
              <SearchableCombobox
                id="manual-exam"
                options={examOptions}
                value={examId != null ? String(examId) : ""}
                onChange={onExamChange}
                placeholder="Choose examination…"
                searchPlaceholder="Search examination…"
                widthClass="w-full"
                truncateTrigger
                triggerClassName={filterTriggerClass}
                showAllOption
                allOptionLabel="Choose examination…"
                emptyText={exams.length ? "No match." : "No examinations loaded."}
              />
            </CommandBarBorderField>
            <CommandBarBorderField label="Subject type" htmlFor="manual-subject-type" className="min-w-0">
              <select
                id="manual-subject-type"
                className={filterSelectClass}
                value={subjectTypeFilter}
                disabled={examId == null}
                onChange={(e) => onSubjectTypeChange(e.target.value as ScriptControlSubjectTypeFilter)}
              >
                {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CommandBarBorderField>
            <CommandBarBorderField label="Subject" htmlFor="manual-subject" className="min-w-0">
              <SearchableCombobox
                id="manual-subject"
                options={subjectOptions}
                value={subjectId != null ? String(subjectId) : ""}
                onChange={onSubjectChange}
                placeholder="Choose subject…"
                searchPlaceholder="Search subject…"
                widthClass="w-full"
                truncateTrigger
                triggerClassName={filterTriggerClass}
                showAllOption
                allOptionLabel="Choose subject…"
                disabled={examId == null}
                emptyText={
                  filteredSubjects.length === 0
                    ? subjectTypeFilter === "all"
                      ? "No subjects loaded."
                      : `No ${subjectTypeFilter.toLowerCase()} subjects.`
                    : "No match."
                }
              />
            </CommandBarBorderField>
            <CommandBarBorderField label="Paper" htmlFor="manual-paper" className="min-w-0">
              <SearchableCombobox
                id="manual-paper"
                options={paperOptions}
                value={paper != null ? String(paper) : ""}
                onChange={onPaperChange}
                placeholder="Choose paper…"
                searchPlaceholder="Search paper…"
                widthClass="w-full"
                truncateTrigger
                triggerClassName={filterTriggerClass}
                showAllOption
                allOptionLabel="Choose paper…"
                disabled={subjectId == null || paperOptions.length === 0}
                emptyText={subjectId != null ? "No papers configured for this subject." : "Select a subject first."}
              />
            </CommandBarBorderField>
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <label htmlFor="manual-grid-search" className="sr-only">
                Search examiners
              </label>
              <input
                id="manual-grid-search"
                type="search"
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                placeholder="Search name, role, or phone…"
                className={cn(officialAccountsCommandBarSearchClass, "h-9 pl-8 lg:max-w-none")}
                disabled={!scopeReady}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        {scopeReady ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {ROLE_FILTERS.map((f) => (
                <Chip key={f.value || "all"} active={roleFilter === f.value} onClick={() => setRoleFilter(f.value)}>
                  {f.label}
                </Chip>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" aria-hidden />
              {STATUS_FILTERS.map((f) => (
                <Chip key={f.value} active={statusFilter === f.value} onClick={() => setStatusFilter(f.value)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal tabular-nums">
                {stats.total.toLocaleString()} examiners
              </Badge>
              <Badge variant="outline" className="font-normal tabular-nums">
                {stats.filled}/{stats.total} filled
              </Badge>
              <Badge variant="outline" className="font-normal tabular-nums">
                Σ {stats.scriptSum.toLocaleString()} scripts
              </Badge>
              {sourceData && !embedded ? (
                <Badge
                  variant={sourceData.source_mode === "manual" ? "secondary" : "outline"}
                  className="font-normal"
                >
                  {sourceData.source_mode === "manual" ? "Manual source" : "From allocation"}
                </Badge>
              ) : null}
              {!isSubjectOfficer && subjectId != null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={busy}
                  onClick={() => void handleUseAllocation()}
                >
                  Use allocation
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Upload disclosure */}
        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setUploadOpen((o) => !o)}
            aria-expanded={uploadOpen}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", uploadOpen && "rotate-180")} aria-hidden />
            Upload spreadsheet
          </button>
          {uploadOpen ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                Template includes locked identity columns; only{" "}
                <span className="font-mono">total_allocation</span> is editable.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!scopeReady || busy}
                  onClick={() => void handleDownloadTemplate()}
                >
                  <Download className="mr-1.5 size-3.5" aria-hidden />
                  Template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!scopeReady || busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 size-3.5" aria-hidden />
                  Choose file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setUploadResult(null);
                    setSaveMessage(null);
                    setActionError(null);
                    setPendingUploadFile(file);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
              </div>
              {pendingUploadFile ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
                  <p className="font-medium text-foreground">Apply this file?</p>
                  <p className="mt-1 text-muted-foreground">
                    <span className="font-medium text-foreground">{pendingUploadFile.name}</span>
                    {paper != null ? (
                      <>
                        {" "}
                        → paper <span className="font-medium text-foreground">{paper}</span>
                      </>
                    ) : null}
                    . Matched examiner totals will be replaced.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      disabled={busy || !scopeReady}
                      onClick={() => void handleUploadFile(pendingUploadFile, false)}
                    >
                      Confirm upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy}
                      onClick={clearPendingUpload}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              {uploadResult ? (
                <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs">
                  <p>
                    Applied: {uploadResult.applied_count} · Skipped: {uploadResult.skipped_count}
                  </p>
                  {uploadResult.errors.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-destructive">
                      {uploadResult.errors.slice(0, 8).map((err) => (
                        <li key={`${err.row_number}-${err.message}`}>
                          Row {err.row_number}: {err.message}
                        </li>
                      ))}
                      {uploadResult.errors.length > 8 ? (
                        <li>…and {uploadResult.errors.length - 8} more</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {(loadError || actionError || saveMessage) && (
          <div className="space-y-1.5">
            {loadError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {loadError}
              </p>
            ) : null}
            {actionError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                {actionError}
              </p>
            ) : null}
            {saveMessage ? (
              <p className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-foreground">
                {saveMessage}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Table body */}
      <div className={cn(EXAMINERS_TABLE_INNER_SCROLL_CLASS, "min-h-0 flex-1")}>
        {!scopeReady ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-1 px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              {isSubjectOfficer ? "Choose a paper" : "Choose examination, subject, and paper"}
            </p>
            <p className="text-sm text-muted-foreground">Then enter script counts for each examiner.</p>
          </div>
        ) : listLoading && !sourceData ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            Loading examiners…
          </div>
        ) : (
          <TooltipProvider delayDuration={250}>
          <table className="w-full min-w-[32rem] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(thClass, indexColClass)} scope="col">
                  <span className="sr-only">#</span>
                  <span aria-hidden>#</span>
                </th>
                <th className={cn(thClass, nameColClass)}>Name</th>
                <th className={cn(thClass, hiddenOnSmClass)}>Role</th>
                <th className={cn(thClass, hiddenOnSmClass)}>Phone</th>
                <th className={cn(thClass, numericColClass)}>
                  <HeaderWithTooltip
                    label="System alloc"
                    description="What the system already assigned this examiner for this paper. Just for checking — you can’t change it here."
                  />
                </th>
                <th className={cn(thClass, scriptsColClass)}>
                  <HeaderWithTooltip
                    label="Manual alloc"
                    description="What you’re typing in yourself. Leave blank if you don’t have a figure yet; only filled rows are saved."
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length > 0 ? (
                pageItems.map((row, idx) => {
                  const scriptValue = draftValue(draftCounts, row);
                  const isDirty =
                    scriptValue.trim() !== (row.manual_count > 0 ? String(row.manual_count) : "");
                  const rowNumber = (safePage - 1) * pageSize + idx + 1;
                  return (
                    <tr
                      key={row.examiner_id}
                      className={cn(
                        "border-b border-border/50",
                        idx % 2 === 1 && "bg-muted/20",
                        isDirty && "bg-amber-500/5",
                      )}
                    >
                      <td className={cn(tdClass, indexColClass, "text-xs text-muted-foreground")}>
                        {rowNumber}
                      </td>
                      <td className={cn(tdClass, nameColClass, "min-w-0")}>
                        <p className="truncate font-medium text-foreground" title={row.name}>
                          {row.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground sm:hidden">
                          {examinerTypeLabel(row.examiner_type)}
                        </p>
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap text-xs text-muted-foreground", hiddenOnSmClass)}>
                        {examinerTypeLabel(row.examiner_type)}
                      </td>
                      <td
                        className={cn(
                          tdClass,
                          "whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground",
                          hiddenOnSmClass,
                        )}
                      >
                        {row.phone_number ?? "—"}
                      </td>
                      <td
                        className={cn(
                          tdClass,
                          numericColClass,
                          "tabular-nums text-muted-foreground",
                        )}
                      >
                        {row.allocation_count.toLocaleString()}
                      </td>
                      <td className={cn(tdClass, scriptsColClass)}>
                        <div className="flex justify-end">
                          <input
                            ref={(el) => {
                              inputRefs.current[idx] = el;
                            }}
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            enterKeyHint={idx < pageItems.length - 1 ? "next" : "done"}
                            className={cn(scriptsInputClass, inputFocusRing)}
                            value={scriptValue}
                            onChange={(e) =>
                              setDraftCounts((prev) => ({
                                ...prev,
                                [row.examiner_id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusNextInput(idx);
                              }
                            }}
                            placeholder="—"
                            disabled={busy}
                            aria-label={`Manual allocation for ${row.name}`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No examiners match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </TooltipProvider>
        )}
      </div>

      {scopeReady && totalFiltered > 0 ? (
        <OfficialAccountsPagination
          page={safePage}
          pageSize={pageSize}
          total={totalFiltered}
          busy={busy || listLoading}
          recordLabel="examiner"
          pageSizeOptions={[...PAGE_SIZE_PRESETS]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}

      {/* Sticky save bar */}
      {scopeReady ? (
        <div
          className={cn(
            officialAccountsPanelFooterClass,
            "sticky bottom-0 z-20 shrink-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
          )}
        >
          <div className="text-xs text-muted-foreground sm:text-sm">
            {stats.dirty > 0 ? (
              <span>
                <span className="font-medium text-foreground">{stats.dirty}</span> unsaved change
                {stats.dirty === 1 ? "" : "s"}
                <span className="mx-1.5 text-border">·</span>
                Σ {stats.scriptSum.toLocaleString()} scripts
              </span>
            ) : (
              <span>All changes saved · Σ {stats.scriptSum.toLocaleString()} scripts</span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || stats.dirty === 0}
            onClick={() => void handleSaveGrid()}
          >
            {busy ? "Saving…" : "Save counts"}
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{workspace}</div>;
  }

  return (
    <div className={cn(EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS, "min-h-[calc(100dvh-6rem)] p-3 md:p-4")}>
      <section className={cn(EXAMINERS_PANEL_CLASS, "flex min-h-0 flex-1 flex-col overflow-hidden p-0")}>
        {workspace}
      </section>
    </div>
  );
}
