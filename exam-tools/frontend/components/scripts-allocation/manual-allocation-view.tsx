"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

import { CommandBarBorderField } from "@/components/command-bar-border-field";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS,
  EXAMINERS_PANEL_SCROLL_CLASS,
  EXAMINERS_TAB_PANEL_SCROLL_CLASS,
  EXAMINERS_TABLE_SCROLL_CONTAINER_CLASS,
} from "@/components/examiners/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  downloadManualMarkedScriptsTemplate,
  getMarkingScriptSource,
  listAllSubjects,
  listExaminations,
  updateMarkingScriptSource,
  uploadManualMarkedScripts,
  upsertManualMarkedScripts,
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
import { officialAccountsCommandBarClass, officialAccountsCommandBarControlClass } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

import {
  manualAllocationHref,
  scriptsAllocationHref,
} from "@/app/dashboard/admin/scripts-allocation/scripts-allocation-href";

const inputFocusRing = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const scriptsInputClass = `${formInputClass} w-16 sm:w-24 text-right tabular-nums [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
const sectionBodyClass = "px-4 py-4 sm:px-5 sm:py-5";
const filterTriggerClass =
  "h-10 w-full border-input-border bg-input shadow-sm hover:bg-input focus-visible:ring-2 focus-visible:ring-ring/30";
const filterSelectClass = cn(officialAccountsCommandBarControlClass, "h-10 w-full disabled:opacity-60");
const filterSearchClass = cn(officialAccountsCommandBarControlClass, "h-10 w-full");
const hiddenOnMobileCellClass = "hidden sm:table-cell";

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

export function ManualAllocationView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [paper, setPaper] = useState<number | null>(null);
  const [gridSearch, setGridSearch] = useState("");
  const [sourceData, setSourceData] = useState<MarkingScriptSourceResponse | null>(null);
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<ManualMarkedScriptsUploadResponse | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  const filteredExaminers = useMemo(() => {
    const rows = sourceData?.examiners ?? [];
    const q = gridSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.name,
        examinerTypeLabel(row.examiner_type),
        row.phone_number ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sourceData?.examiners, gridSearch]);

  const paperOptions = useMemo(() => {
    const papers = sourceData?.available_papers ?? [];
    return papers.map((p) => ({ value: String(p), label: `Paper ${p}` }));
  }, [sourceData?.available_papers]);

  const replaceUrl = useCallback(
    (next: {
      exam: number | null;
      subjectType?: ScriptControlSubjectTypeFilter;
      subject: number | null;
      paper: number | null;
    }) => {
      router.replace(
        manualAllocationHref({
          exam: next.exam,
          subjectType: next.subjectType ?? subjectTypeFilter,
          subjectId: next.subject,
          paper: next.paper,
        }),
      );
    },
    [router, subjectTypeFilter],
  );

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const examParam = searchParams.get("exam");
    const subjectParam = searchParams.get("subject");
    const paperParam = searchParams.get("paper");
    setExamId(examParam && /^\d+$/.test(examParam) ? Number(examParam) : null);
    setSubjectTypeFilter(parseScriptControlSubjectTypeFilter(searchParams.get("stype")));
    setSubjectId(subjectParam && /^\d+$/.test(subjectParam) ? Number(subjectParam) : null);
    setPaper(paperParam && /^\d+$/.test(paperParam) ? Number(paperParam) : null);
  }, [searchParams]);

  useEffect(() => {
    if (subjectId == null) return;
    const selected = subjects.find((s) => s.id === subjectId);
    if (selected == null) return;
    if (subjectTypeFilter !== "all" && selected.subject_type !== subjectTypeFilter) {
      setSubjectId(null);
      setPaper(null);
      replaceUrl({ exam: examId, subject: null, paper: null });
    }
  }, [subjectId, subjects, subjectTypeFilter, examId, replaceUrl]);

  useEffect(() => {
    if (examId == null || subjectId == null) {
      setSourceData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const data = await getMarkingScriptSource(examId, subjectId, scopeReady ? paper : null);
        if (cancelled) return;
        setSourceData(data);
        if (paper != null && !data.available_papers.includes(paper)) {
          setPaper(null);
          replaceUrl({ exam: examId, subject: subjectId, paper: null });
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load marking source");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, subjectId, paper, scopeReady, replaceUrl]);

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
    replaceUrl({ exam: nextExam, subject: null, paper: null });
  }

  function onSubjectTypeChange(value: ScriptControlSubjectTypeFilter) {
    setSubjectTypeFilter(value);
    setSubjectId(null);
    setPaper(null);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    replaceUrl({ exam: examId, subjectType: value, subject: null, paper: null });
  }

  function onSubjectChange(value: string) {
    const nextSubject = value ? Number(value) : null;
    setSubjectId(nextSubject);
    setPaper(null);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    replaceUrl({ exam: examId, subject: nextSubject, paper: null });
  }

  function onPaperChange(value: string) {
    const nextPaper = value ? Number(value) : null;
    setPaper(nextPaper);
    setUploadResult(null);
    setSaveMessage(null);
    setGridSearch("");
    replaceUrl({ exam: examId, subject: subjectId, paper: nextPaper });
  }

  async function handleUseAllocation() {
    if (examId == null || subjectId == null) return;
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

      const data = await upsertManualMarkedScripts(examId, subjectId, paper, items);
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
      await downloadManualMarkedScriptsTemplate(examId, subjectId, paper);
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
      const result = await uploadManualMarkedScripts(examId, subjectId, paper, file, { validateOnly });
      setUploadResult(result);
      if (!validateOnly && result.errors.length === 0) {
        const data = await getMarkingScriptSource(examId, subjectId, paper);
        setSourceData(data);
        setDraftCounts(manualCountsFromSource(data.examiners));
        setSaveMessage(`Upload applied ${result.applied_count} row(s) for paper ${paper}.`);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function renderExaminerRow(row: MarkingScriptSourceExaminerRow) {
    const scriptValue =
      draftCounts[row.examiner_id] ?? (row.manual_count > 0 ? String(row.manual_count) : "");
    return (
      <tr key={row.examiner_id} className="border-b border-border/60">
        <td className="max-w-36 truncate px-2 py-2.5 text-sm sm:max-w-none sm:px-3 sm:py-2">{row.name}</td>
        <td className={cn("px-3 py-2 text-sm text-muted-foreground", hiddenOnMobileCellClass)}>
          {examinerTypeLabel(row.examiner_type)}
        </td>
        <td className={cn("px-3 py-2 text-sm font-mono text-muted-foreground", hiddenOnMobileCellClass)}>
          {row.phone_number ?? "—"}
        </td>
        <td className="px-2 py-2.5 text-sm text-right tabular-nums text-muted-foreground sm:px-3 sm:py-2">
          {row.allocation_count}
        </td>
        <td className="px-2 py-2.5 text-right sm:px-3 sm:py-2">
          <input
            type="number"
            min={0}
            step={1}
            className={`${scriptsInputClass} ${inputFocusRing}`}
            value={scriptValue}
            onChange={(e) =>
              setDraftCounts((prev) => ({
                ...prev,
                [row.examiner_id]: e.target.value,
              }))
            }
            placeholder="—"
            disabled={!scopeReady || busy}
            aria-label={`Scripts for ${row.name}`}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className={cn(EXAMINERS_PAGE_SCROLL_LAYOUT_CLASS, "p-3 md:p-4")}>
      <section className={EXAMINERS_PANEL_SCROLL_CLASS}>
        <div className="relative z-20 shrink-0 rounded-t-2xl border-b border-border/80 bg-linear-to-b from-muted/35 to-muted/10">
          <div className={officialAccountsCommandBarClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  Manual scripts allocation
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Enter marked script counts per examiner for payout. This does not change MILP allocation runs — use
                  automatic allocation for envelope assignment.
                </p>
              </div>
              <Link
                href={scriptsAllocationHref({ exam: examId })}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                ← Automatic allocation
              </Link>
            </div>
          </div>
        </div>

        <div className={EXAMINERS_TAB_PANEL_SCROLL_CLASS}>
          {loadError ? (
            <p className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-5">
              {loadError}
            </p>
          ) : null}
          {actionError ? (
            <p className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-5">
              {actionError}
            </p>
          ) : null}
          {saveMessage ? (
            <p className="mx-4 mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground sm:mx-5">
              {saveMessage}
            </p>
          ) : null}

          <section className={cn(sectionBodyClass, "border-b border-border/80")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-card-foreground">Scope</h2>
              {sourceData ? (
                <Badge variant={sourceData.source_mode === "manual" ? "secondary" : "outline"}>
                  {sourceData.source_mode === "manual" ? "Manual payout source" : "From allocation"}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            </div>

            {subjectId != null ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleUseAllocation()}>
                  Use allocation for this subject
                </Button>
              </div>
            ) : null}
          </section>

          <section
            className={cn(sectionBodyClass, "border-b border-border/80", !scopeReady && "opacity-80")}
            aria-disabled={!scopeReady}
          >
            <h2 className="text-base font-semibold text-card-foreground">Grid entry</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter script counts for the selected paper. Allocation column is read-only reference from MILP runs. Blank
              fields are not saved.
            </p>

            {!scopeReady ? (
              <p className="mt-4 text-sm text-muted-foreground">Select examination, subject, and paper to edit counts.</p>
            ) : (
              <>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <CommandBarBorderField label="Search examiners" htmlFor="manual-grid-search" className="min-w-0 w-full sm:max-w-sm">
                    <input
                      id="manual-grid-search"
                      type="search"
                      value={gridSearch}
                      onChange={(e) => setGridSearch(e.target.value)}
                      placeholder="Name, role, or phone…"
                      className={filterSearchClass}
                    />
                  </CommandBarBorderField>
                  <p className="shrink-0 pb-2 text-xs text-muted-foreground sm:pb-0">
                    {filteredExaminers.length} of {sourceData?.examiners.length ?? 0} examiner
                    {(sourceData?.examiners.length ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className={cn("mt-3 rounded-lg border border-border", EXAMINERS_TABLE_SCROLL_CONTAINER_CLASS)}>
                  <table className="min-w-full text-left">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-medium sm:px-3">Name</th>
                        <th className={cn("px-3 py-2 font-medium", hiddenOnMobileCellClass)}>Role</th>
                        <th className={cn("px-3 py-2 font-medium", hiddenOnMobileCellClass)}>Phone</th>
                        <th className="px-2 py-2 text-right font-medium sm:px-3">Alloc.</th>
                        <th className="px-2 py-2 text-right font-medium sm:px-3">Scripts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExaminers.length > 0 ? (
                        filteredExaminers.map(renderExaminerRow)
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No examiners match your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void handleSaveGrid()}>
                    Save manual counts
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className={cn(sectionBodyClass, !scopeReady && "opacity-80")}>
            <h2 className="text-base font-semibold text-card-foreground">Upload</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV or XLSX with columns <span className="font-mono">phone_number</span> and{" "}
          <span className="font-mono">total</span>. Applies to the selected paper only; zero or blank totals are
          skipped.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!scopeReady || busy}
            onClick={() => void handleDownloadTemplate()}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Download template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!scopeReady || busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden />
            Upload file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadFile(file, false);
            }}
          />
        </div>

        {uploadResult ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <p>
              Applied: {uploadResult.applied_count} · Skipped: {uploadResult.skipped_count}
              {uploadResult.validate_only ? " (validate only)" : ""}
            </p>
            {uploadResult.errors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                {uploadResult.errors.map((err) => (
                  <li key={`${err.row_number}-${err.message}`}>
                    Row {err.row_number}: {err.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}
