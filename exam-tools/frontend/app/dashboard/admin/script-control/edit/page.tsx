"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ConfirmActionModal,
  saveScriptControlConfirmMessages,
  SCRIPT_CONTROL_SAVE_CONFIRM_REMEMBER_LABEL,
  SCRIPT_CONTROL_SAVE_CONFIRM_TITLE,
} from "@/components/confirm-action-modal";
import { ScriptControlSchoolFilters } from "@/components/script-control/script-control-school-filters";
import { ScriptControlEditContextBar } from "@/components/script-control/script-control-edit-context-bar";
import { ScriptControlSchoolIdentity } from "@/components/script-control/script-control-school-identity";
import { ScriptControlMobileSchoolPicker } from "@/components/script-control/script-control-mobile-school-picker";
import { ScriptControlMobileSubjectPicker } from "@/components/script-control/script-control-mobile-subject-picker";
import { seriesNavKey, type SeriesNavItem } from "@/components/script-control/script-control-edit-series-nav";
import { ScriptControlSubjectEditor, emptyDraft, initialDraftForEdit, seriesSlotKey } from "@/components/script-control/script-control-subject-editor";
import type { SeriesEditHandlers } from "@/components/script-control/script-control-series-form";
import { buildScriptControlQuery, parseScriptControlRecordType } from "@/components/script-control/script-control-shell";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  deleteAdminIrregularScriptSeries,
  deleteAdminScriptSeries,
  getAdminSchoolIrregularScriptControl,
  getAdminSchoolScriptControl,
  getExaminationScriptSeriesConfig,
  upsertAdminIrregularScriptSeries,
  upsertAdminScriptSeries,
  type ExaminationScriptSeriesConfigRow,
  type MySchoolScriptControlResponse,
  type School,
  type SchoolListResponse,
  type ScriptControlSchoolOverallStatus,
  type ScriptSeriesPackingResponse,
} from "@/lib/api";
import { apiJson } from "@/lib/api";
import { displaySubjectCode } from "@/lib/script-control-completion";
import { draftIsNoScripts, envelopesToPersist, type ScriptControlDraft } from "@/lib/script-control-editor";
import { findNextSeriesKey } from "@/lib/script-control-queue";
import {
  isScriptControlSaveConfirmSkipped,
  setScriptControlSaveConfirmSkipped,
} from "@/lib/script-control-save-confirm";
import { pushRecentSchool, readRecentSchools, type RecentSchoolEntry } from "@/lib/script-control-recent-schools";
import {
  filterSeriesConfigBySubjectType,
  parseScriptControlSubjectTypeFilter,
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

function buildNavItems(
  schoolData: MySchoolScriptControlResponse,
  saveSubjectId: number,
  savePaperNumber: number,
): SeriesNavItem[] {
  const subject = schoolData.subjects.find((s) => s.subject_id === saveSubjectId);
  const paper = subject?.papers.find((p) => p.paper_number === savePaperNumber);
  if (!paper) return [];
  return paper.series.map((slot) => ({ paperNumber: savePaperNumber, slot }));
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminScriptControlEditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const examId = useMemo(() => {
    const raw = searchParams.get("exam");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const recordType = parseScriptControlRecordType(searchParams.get("type"));
  const schoolId = searchParams.get("school") ?? "";
  const region = searchParams.get("region") ?? "";
  const subjectIdStr = searchParams.get("subject") ?? "";
  const paperNumberStr = searchParams.get("paper") ?? "";
  const subjectTypeFilter = parseScriptControlSubjectTypeFilter(searchParams.get("subject_type"));
  const statusFilter = (searchParams.get("status") ?? "missing") as ScriptControlSchoolOverallStatus | "all";

  const subjectId = subjectIdStr.trim() ? parseInt(subjectIdStr, 10) : NaN;
  const paperNumber = paperNumberStr.trim() ? parseInt(paperNumberStr, 10) : NaN;
  const hasSubject = Number.isFinite(subjectId);
  const hasPaper = Number.isFinite(paperNumber);
  const canEdit = examId !== null && schoolId.trim() && hasSubject;

  const [seriesConfig, setSeriesConfig] = useState<ExaminationScriptSeriesConfigRow[]>([]);
  const [schoolSearch, setSchoolSearch] = useState("");
  const debouncedSchoolSearch = useDebounced(schoolSearch, 350);
  const [schoolOptions, setSchoolOptions] = useState<School[]>([]);
  const [schoolSearchLoading, setSchoolSearchLoading] = useState(false);

  const [data, setData] = useState<MySchoolScriptControlResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScriptControlDraft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);

  type PendingSave = {
    saveSubjectId: number;
    savePaperNumber: number;
    seriesNumber: number;
    draftState: ScriptControlDraft;
    meta: { hadVerified: boolean; hadEnvelopes: boolean };
    advanceSeries?: boolean;
  };
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  type PendingClear = {
    saveSubjectId: number;
    savePaperNumber: number;
    seriesNumber: number;
    hadVerified: boolean;
  };
  const [pendingClear, setPendingClear] = useState<PendingClear | null>(null);

  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [highlightedSeriesKey, setHighlightedSeriesKey] = useState<string | null>(null);
  const [successFlashKey, setSuccessFlashKey] = useState<string | null>(null);
  const [suggestedNextSeriesKey, setSuggestedNextSeriesKey] = useState<string | null>(null);
  const [mobileOpenSeriesKey, setMobileOpenSeriesKey] = useState<string | null>(null);
  const advanceAfterSaveRef = useRef(false);
  const successFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtersComplete = hasSubject && hasPaper && Boolean(schoolId.trim());

  useEffect(() => {
    if (!filtersComplete) setFiltersExpanded(true);
  }, [filtersComplete]);

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") q.delete(k);
        else q.set(k, v);
      }
      router.replace(`/dashboard/admin/script-control/edit?${q.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const viewBackHref = useMemo(
    () =>
      `/dashboard/admin/script-control${buildScriptControlQuery({
        exam: examId,
        type: recordType,
        extra: {
          subject: subjectIdStr || undefined,
          paper: paperNumberStr || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        },
      })}`,
    [examId, paperNumberStr, statusFilter, recordType, subjectIdStr],
  );

  useEffect(() => {
    if (examId === null) {
      setSeriesConfig([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getExaminationScriptSeriesConfig(examId);
        if (!cancelled) setSeriesConfig(cfg.items);
      } catch {
        if (!cancelled) setSeriesConfig([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const filteredSeriesConfig = useMemo(
    () => filterSeriesConfigBySubjectType(seriesConfig, subjectTypeFilter),
    [seriesConfig, subjectTypeFilter],
  );

  const subjectOptions = useMemo(
    () =>
      filteredSeriesConfig.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} — ${s.subject_name}`,
      })),
    [filteredSeriesConfig],
  );

  useEffect(() => {
    if (!subjectIdStr.trim() || subjectTypeFilter === "all") return;
    const match = seriesConfig.find((s) => String(s.subject_id) === subjectIdStr);
    if (match && match.subject_type !== subjectTypeFilter) {
      patchParams({ subject: undefined });
    }
  }, [patchParams, seriesConfig, subjectIdStr, subjectTypeFilter]);

  const loadData = useCallback(async () => {
    if (!canEdit) return null;
    setLoadError(null);
    setBusy(true);
    try {
      const res =
        recordType === "regular"
          ? await getAdminSchoolScriptControl(examId!, schoolId)
          : await getAdminSchoolIrregularScriptControl(examId!, schoolId);
      setData(res);
      return res;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load school data");
      setData(null);
      return null;
    } finally {
      setBusy(false);
    }
  }, [canEdit, examId, recordType, schoolId]);

  useEffect(() => {
    if (canEdit) void loadData();
    else setData(null);
  }, [canEdit, loadData]);

  useEffect(() => {
    setSuggestedNextSeriesKey(null);
    setHighlightedSeriesKey(null);
    setSuccessFlashKey(null);
    setMobileOpenSeriesKey(null);
  }, [schoolId, subjectId, paperNumber]);

  useEffect(() => {
    return () => {
      if (successFlashTimerRef.current) clearTimeout(successFlashTimerRef.current);
    };
  }, []);

  function flashSeriesSuccess(navKey: string) {
    setHighlightedSeriesKey(navKey);
    setSuccessFlashKey(navKey);
    if (successFlashTimerRef.current) clearTimeout(successFlashTimerRef.current);
    successFlashTimerRef.current = setTimeout(() => setSuccessFlashKey(null), 2000);
  }

  function handleSchoolPicked(id: string, entry: RecentSchoolEntry) {
    setEditingKey(null);
    setFiltersExpanded(false);
    pushRecentSchool(examId!, subjectId, paperNumber, entry);
    patchParams({ school: id });
  }

  function openSchoolPicker() {
    if (!hasSubject || !hasPaper) return;
    setSchoolPickerOpen(true);
  }

  function openSubjectPicker() {
    if (examId === null) return;
    setSubjectPickerOpen(true);
  }

  useEffect(() => {
    if (debouncedSchoolSearch.trim().length < 2) {
      setSchoolOptions([]);
      return;
    }
    let cancelled = false;
    setSchoolSearchLoading(true);
    const q = new URLSearchParams({ skip: "0", limit: "30", q: debouncedSchoolSearch.trim() });
    if (region.trim()) q.set("region", region.trim());
    (async () => {
      try {
        const res = await apiJson<SchoolListResponse>(`/schools?${q}`);
        if (!cancelled) setSchoolOptions(res.items);
      } catch {
        if (!cancelled) setSchoolOptions([]);
      } finally {
        if (!cancelled) setSchoolSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSchoolSearch, region]);

  const schoolComboboxOptions = useMemo(() => {
    const opts = schoolOptions.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));
    if (schoolId && data?.school_id === schoolId) {
      const label = data.school_code;
      if (!opts.some((o) => o.value === schoolId)) opts.unshift({ value: schoolId, label });
    }
    return opts;
  }, [data, schoolId, schoolOptions]);

  const selectedSubject = useMemo(
    () => (data && hasSubject ? data.subjects.find((s) => s.subject_id === subjectId) : null),
    [data, hasSubject, subjectId],
  );

  const paperProgress = useMemo(() => {
    if (!selectedSubject || !hasPaper) return null;
    const paper = selectedSubject.papers.find((p) => p.paper_number === paperNumber);
    if (!paper) return { recordedSeries: 0, totalSeries: 0 };
    let totalSeries = 0;
    let recordedSeries = 0;
    for (const slot of paper.series) {
      totalSeries += 1;
      if (slot.packing != null) recordedSeries += 1;
    }
    return { recordedSeries, totalSeries };
  }, [hasPaper, paperNumber, selectedSubject]);

  const goToNextSeries = useCallback(() => {
    if (!suggestedNextSeriesKey) return;
    setMobileOpenSeriesKey(suggestedNextSeriesKey);
    setSaveNotice(null);
  }, [suggestedNextSeriesKey]);

  const executeSave = useCallback(
    async ({
      saveSubjectId,
      savePaperNumber,
      seriesNumber,
      draftState,
    }: Omit<PendingSave, "meta" | "advanceSeries">) => {
      if (!canEdit) return;
      setBusy(true);
      setFormError(null);
      setSaveNotice(null);
      try {
        const payload =
          recordType === "regular" && draftIsNoScripts(draftState)
            ? {
                subject_id: saveSubjectId,
                paper_number: savePaperNumber,
                series_number: seriesNumber,
                no_scripts: true,
                envelopes: [{ envelope_number: 1, booklet_count: 0 }],
              }
            : {
                subject_id: saveSubjectId,
                paper_number: savePaperNumber,
                series_number: seriesNumber,
                no_scripts: false,
                envelopes: envelopesToPersist(draftState).map((e) => ({
                  envelope_number: e.envelope_number,
                  booklet_count: e.booklet_count,
                })),
              };
        if (recordType === "regular") await upsertAdminScriptSeries(examId!, schoolId, payload);
        else await upsertAdminIrregularScriptSeries(examId!, schoolId, payload);
        const savedNavKey = seriesNavKey(savePaperNumber, seriesNumber);
        setEditingKey(null);
        flashSeriesSuccess(savedNavKey);
        const fresh = await loadData();
        if (fresh) {
          const items = buildNavItems(fresh, saveSubjectId, savePaperNumber);
          const nextKey = findNextSeriesKey(items, savedNavKey);
          setSuggestedNextSeriesKey(nextKey);
          if (advanceAfterSaveRef.current && nextKey) {
            setMobileOpenSeriesKey(nextKey);
          }
          setSaveNotice("Saved.");
        }
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Save failed");
      } finally {
        advanceAfterSaveRef.current = false;
        setBusy(false);
      }
    },
    [canEdit, examId, loadData, recordType, schoolId],
  );

  const handlers: SeriesEditHandlers = {
    busy,
    onSave: async (saveSubjectId, savePaperNumber, seriesNumber, draftState, meta) => {
      if (!canEdit) return;
      const messages = saveScriptControlConfirmMessages(meta);
      if (messages.length > 0 && !isScriptControlSaveConfirmSkipped()) {
        setPendingSave({
          saveSubjectId,
          savePaperNumber,
          seriesNumber,
          draftState,
          meta,
          advanceSeries: advanceAfterSaveRef.current,
        });
        return;
      }
      await executeSave({ saveSubjectId, savePaperNumber, seriesNumber, draftState });
    },
    onClear: async (saveSubjectId, savePaperNumber, seriesNumber, packing) => {
      if (!canEdit) return;
      const hadVerified = Boolean(packing?.envelopes?.some((e) => e.verified));
      setPendingClear({ saveSubjectId, savePaperNumber, seriesNumber, hadVerified });
    },
  };

  const executeClear = useCallback(
    async ({ saveSubjectId, savePaperNumber, seriesNumber }: PendingClear) => {
      if (!canEdit) return;
      setBusy(true);
      try {
        const params = {
          school_id: schoolId,
          subject_id: saveSubjectId,
          paper_number: savePaperNumber,
          series_number: seriesNumber,
        };
        if (recordType === "regular") await deleteAdminScriptSeries(examId!, params);
        else await deleteAdminIrregularScriptSeries(examId!, params);
        setEditingKey(null);
        flashSeriesSuccess(seriesNavKey(savePaperNumber, seriesNumber));
        const fresh = await loadData();
        if (fresh) {
          const items = buildNavItems(fresh, saveSubjectId, savePaperNumber);
          setSuggestedNextSeriesKey(findNextSeriesKey(items, seriesNavKey(savePaperNumber, seriesNumber)));
          setSaveNotice("Saved.");
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusy(false);
      }
    },
    [canEdit, examId, loadData, recordType, schoolId],
  );

  function openEdit(
    saveSubjectId: number,
    savePaperNumber: number,
    seriesNumber: number,
    packing: ScriptSeriesPackingResponse | null,
  ) {
    setEditingKey(seriesSlotKey(saveSubjectId, savePaperNumber, seriesNumber));
    setDraft(initialDraftForEdit(packing));
    setFormError(null);
    setSaveNotice(null);
  }

  const canNextSeries = Boolean(suggestedNextSeriesKey && canEdit && hasPaper);

  const selectedSubjectMeta = useMemo(() => {
    if (selectedSubject) {
      return {
        subject_id: selectedSubject.subject_id,
        subject_code: selectedSubject.subject_code,
        subject_original_code: selectedSubject.subject_original_code,
        subject_name: selectedSubject.subject_name,
      };
    }
    const cfg = seriesConfig.find((s) => s.subject_id === subjectId);
    if (!cfg) return null;
    return {
      subject_id: cfg.subject_id,
      subject_code: cfg.subject_code,
      subject_original_code: null as string | null,
      subject_name: cfg.subject_name,
    };
  }, [selectedSubject, seriesConfig, subjectId]);

  const selectedSchoolName = useMemo(() => {
    if (!schoolId.trim() || examId === null || !hasSubject || !hasPaper) return null;
    const fromRecent = readRecentSchools(examId, subjectId, paperNumber).find(
      (s) => s.schoolId === schoolId,
    )?.schoolName;
    if (fromRecent?.trim()) return fromRecent.trim();
    const fromSearch = schoolOptions.find((s) => String(s.id) === schoolId);
    return fromSearch?.name?.trim() ?? null;
  }, [examId, hasPaper, hasSubject, paperNumber, schoolId, schoolOptions, subjectId]);

  const filterSummary = useMemo(() => {
    const typeLabel =
      SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.find((o) => o.value === subjectTypeFilter)?.label ?? "All types";
    const subjectLabel = selectedSubjectMeta
      ? displaySubjectCode(selectedSubjectMeta)
      : subjectIdStr || "Subject";
    const schoolLabel =
      data?.school_code && selectedSchoolName
        ? `${data.school_code} · ${selectedSchoolName}`
        : (data?.school_code ?? schoolId) || "School";
    return `${typeLabel} · ${subjectLabel} · Paper ${paperNumberStr || "?"} · ${schoolLabel}`;
  }, [data?.school_code, paperNumberStr, schoolId, selectedSchoolName, selectedSubjectMeta, subjectIdStr, subjectTypeFilter]);

  function FilterSegment<T extends string>({
    label,
    options,
    value,
    onChange,
    className,
  }: {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    className?: string;
  }) {
    return (
      <div className={className}>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                value === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {filtersComplete && !filtersExpanded ? (
          <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 lg:hidden">
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground"
              onClick={() => setFiltersExpanded(true)}
            >
              {filterSummary}
            </button>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-primary"
              onClick={openSchoolPicker}
            >
              Change
            </button>
          </div>
        ) : null}

        <div className={cn(filtersComplete && !filtersExpanded && "hidden lg:block")}>
        {/* Desktop: compact segmented filters */}
        <div className="hidden lg:grid lg:grid-cols-[auto_1fr_auto_1.4fr] lg:items-end lg:gap-4">
          <FilterSegment
            label="Subject type"
            options={SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS}
            value={subjectTypeFilter}
            onChange={(v) => {
              setEditingKey(null);
              patchParams({
                subject_type: v === "all" ? undefined : v,
                subject: undefined,
              });
            }}
          />
          <div className="min-w-[220px]">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={subjectOptions}
              value={subjectIdStr}
              onChange={(v) => {
                setEditingKey(null);
                patchParams({ subject: v });
              }}
              placeholder="Select subject…"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
          <FilterSegment
            label="Paper"
            options={[
              { value: "1", label: "Paper 1" },
              { value: "2", label: "Paper 2" },
            ]}
            value={paperNumberStr || "1"}
            onChange={(v) => {
              setEditingKey(null);
              patchParams({ paper: v });
            }}
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              School <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={schoolComboboxOptions}
              value={schoolId}
              onChange={(v) => {
                setEditingKey(null);
                const match = schoolOptions.find((s) => String(s.id) === v);
                if (match && examId !== null && hasSubject && hasPaper) {
                  pushRecentSchool(examId, subjectId, paperNumber, {
                    schoolId: v,
                    schoolCode: match.code,
                    schoolName: match.name,
                  });
                }
                patchParams({ school: v });
              }}
              onSearchChange={setSchoolSearch}
              placeholder="Search school…"
              searchPlaceholder="Type at least 2 characters…"
              emptyText={schoolSearchLoading ? "Searching…" : "No schools found."}
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
        </div>

        {/* Mobile / tablet: segmented type + combobox grid */}
        <div className="space-y-3 lg:hidden">
          <FilterSegment
            label="Subject type"
            options={SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS}
            value={subjectTypeFilter}
            onChange={(v) => {
              setEditingKey(null);
              patchParams({
                subject_type: v === "all" ? undefined : v,
                subject: undefined,
              });
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={subjectOptions}
              value={subjectIdStr}
              onChange={(v) => {
                setEditingKey(null);
                patchParams({ subject: v });
              }}
              placeholder="Select subject…"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
          <div>
            <FilterSegment
              label="Paper"
              options={[
                { value: "1", label: "Paper 1" },
                { value: "2", label: "Paper 2" },
              ]}
              value={paperNumberStr || "1"}
              onChange={(v) => {
                setEditingKey(null);
                patchParams({ paper: v });
              }}
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              School <span className="text-destructive">*</span>
            </label>
            {schoolId.trim() ? (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <ScriptControlSchoolIdentity
                  schoolCode={data?.school_code ?? schoolId}
                  schoolName={selectedSchoolName}
                  onChangeSchool={openSchoolPicker}
                  showChangeButton
                />
              </div>
            ) : (
              <Button
                type="button"
                className="w-full"
                variant="default"
                disabled={!hasSubject || !hasPaper}
                onClick={openSchoolPicker}
              >
                Find school
              </Button>
            )}
            {!hasSubject || !hasPaper ? (
              <p className="text-xs text-muted-foreground">Select subject and paper first.</p>
            ) : null}
          </div>
          </div>
        </div>

        <ScriptControlSchoolFilters
          mode="edit"
          region={region}
          onRegionChange={(v) => patchParams({ region: v })}
        />

        {filtersComplete ? (
          <div className="flex justify-end lg:hidden">
            <Button type="button" size="sm" variant="outline" onClick={() => setFiltersExpanded(false)}>
              Done
            </Button>
          </div>
        ) : null}
        </div>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {examId === null ? (
        <p className="text-sm text-muted-foreground">Select an examination above.</p>
      ) : !hasSubject || !hasPaper ? (
        <p className="text-sm text-muted-foreground">Select a subject and paper to edit records.</p>
      ) : !schoolId.trim() ? null : busy && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data && selectedSubjectMeta && hasPaper ? (
        <div className="space-y-4">
          <ScriptControlEditContextBar
            data={data}
            subject={selectedSubjectMeta}
            paperNumber={paperNumber}
            recordedSeries={paperProgress?.recordedSeries ?? 0}
            totalSeries={paperProgress?.totalSeries ?? 0}
            canNextSeries={canNextSeries}
            actionBusy={busy}
            onNextSeries={goToNextSeries}
            viewBackHref={viewBackHref}
            saveNotice={saveNotice}
            schoolName={selectedSchoolName}
            onFindSchool={openSchoolPicker}
            onChangeSubject={openSubjectPicker}
            onPaperChange={(n) => {
              setEditingKey(null);
              patchParams({ paper: String(n) });
            }}
          />
          <div className="min-w-0 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-4">
            <ScriptControlSubjectEditor
              data={data}
              subjectId={subjectId}
              recordType={recordType}
              editingKey={editingKey}
              draft={draft}
              formError={formError}
              onOpenEdit={openEdit}
              onCloseEdit={() => setEditingKey(null)}
              onDraftChange={setDraft}
              onFormError={setFormError}
              handlers={handlers}
              paperFilter={hasPaper ? paperNumber : null}
              schoolDisplayName={selectedSchoolName}
              highlightedSeriesKey={highlightedSeriesKey}
              successFlashKey={successFlashKey}
              mobileOpenSeriesKey={mobileOpenSeriesKey}
              onMobileOpenHandled={() => setMobileOpenSeriesKey(null)}
              canSaveAndNext={canNextSeries}
              onBeforeSave={(advance) => {
                advanceAfterSaveRef.current = advance;
              }}
            />
          </div>
        </div>
      ) : null}

      {examId !== null ? (
        <ScriptControlMobileSubjectPicker
          open={subjectPickerOpen}
          onOpenChange={setSubjectPickerOpen}
          seriesConfig={seriesConfig}
          subjectTypeFilter={subjectTypeFilter}
          onSubjectTypeChange={(v) => {
            setEditingKey(null);
            patchParams({
              subject_type: v === "all" ? undefined : v,
              subject: undefined,
            });
          }}
          currentSubjectId={hasSubject ? subjectId : undefined}
          onSelectSubject={(id) => {
            setEditingKey(null);
            patchParams({ subject: String(id) });
          }}
        />
      ) : null}

      {examId !== null && hasSubject && hasPaper ? (
        <ScriptControlMobileSchoolPicker
          open={schoolPickerOpen}
          onOpenChange={setSchoolPickerOpen}
          examId={examId}
          subjectId={subjectId}
          paperNumber={paperNumber}
          recordType={recordType}
          region={region}
          onRegionChange={(v) => patchParams({ region: v })}
          currentSchoolId={schoolId || undefined}
          onSelectSchool={handleSchoolPicked}
        />
      ) : null}

      {pendingSave ? (
        <ConfirmActionModal
          title={SCRIPT_CONTROL_SAVE_CONFIRM_TITLE}
          messages={saveScriptControlConfirmMessages(pendingSave.meta)}
          confirmLabel="Save"
          rememberOptionLabel={SCRIPT_CONTROL_SAVE_CONFIRM_REMEMBER_LABEL}
          busy={busy}
          onCancel={() => setPendingSave(null)}
          onConfirm={({ rememberChoice }) => {
            if (rememberChoice) setScriptControlSaveConfirmSkipped(true);
            const save = pendingSave;
            advanceAfterSaveRef.current = save.advanceSeries ?? false;
            setPendingSave(null);
            void executeSave(save);
          }}
        />
      ) : null}

      {pendingClear ? (
        <ConfirmActionModal
          title="Remove record?"
          messages={
            pendingClear.hadVerified
              ? ["Depot verification for this series will be cleared.", "This packing record will be removed."]
              : ["This packing record will be removed."]
          }
          confirmLabel="Remove"
          busy={busy}
          onCancel={() => setPendingClear(null)}
          onConfirm={() => {
            const clear = pendingClear;
            setPendingClear(null);
            void executeClear(clear);
          }}
        />
      ) : null}
    </div>
  );
}
