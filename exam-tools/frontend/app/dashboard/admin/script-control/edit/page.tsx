"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ConfirmActionModal,
  saveScriptControlConfirmMessages,
  SCRIPT_CONTROL_SAVE_CONFIRM_REMEMBER_LABEL,
  SCRIPT_CONTROL_SAVE_CONFIRM_TITLE,
} from "@/components/confirm-action-modal";
import { ScriptControlSchoolFilters } from "@/components/script-control/script-control-school-filters";
import { ScriptControlEditContextBar } from "@/components/script-control/script-control-edit-context-bar";
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
import { localTodayIso } from "@/lib/script-control-completion";
import { draftIsNoScripts, envelopesToPersist, type ScriptControlDraft } from "@/lib/script-control-editor";
import { findNextQueueSchool, subjectStillNeedsWork } from "@/lib/script-control-queue";
import {
  isScriptControlSaveConfirmSkipped,
  setScriptControlSaveConfirmSkipped,
} from "@/lib/script-control-save-confirm";
import {
  filterSeriesConfigBySubjectType,
  parseScriptControlSubjectTypeFilter,
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
} from "@/lib/script-control-subjects";
import { cn } from "@/lib/utils";

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
  const todayIso = useMemo(() => localTodayIso(), []);

  const examId = useMemo(() => {
    const raw = searchParams.get("exam");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const recordType = parseScriptControlRecordType(searchParams.get("type"));
  const schoolId = searchParams.get("school") ?? "";
  const region = searchParams.get("region") ?? "";
  const zone = searchParams.get("zone") ?? "";
  const subjectIdStr = searchParams.get("subject") ?? "";
  const paperNumberStr = searchParams.get("paper") ?? "";
  const subjectTypeFilter = parseScriptControlSubjectTypeFilter(searchParams.get("subject_type"));
  const queueMode = searchParams.get("queue") === "1";
  const queueStatus = (searchParams.get("status") ?? "missing") as ScriptControlSchoolOverallStatus | "all";

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
  const [queueBusy, setQueueBusy] = useState(false);
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
  };
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

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
          status: queueStatus !== "all" ? queueStatus : undefined,
        },
      })}`,
    [examId, paperNumberStr, queueStatus, recordType, subjectIdStr],
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
    if (debouncedSchoolSearch.trim().length < 2) {
      setSchoolOptions([]);
      return;
    }
    let cancelled = false;
    setSchoolSearchLoading(true);
    const q = new URLSearchParams({ skip: "0", limit: "30", q: debouncedSchoolSearch.trim() });
    if (region.trim()) q.set("region", region.trim());
    if (zone.trim()) q.set("zone", zone.trim());
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
  }, [debouncedSchoolSearch, region, zone]);

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

  const goToNextSchool = useCallback(async () => {
    if (!canEdit || !hasPaper) return;
    setQueueBusy(true);
    setSaveNotice(null);
    try {
      const nextSchoolId = await findNextQueueSchool({
        examinationId: examId!,
        subjectId,
        paperNumber,
        schoolId,
        recordType,
        statusFilter: queueStatus,
      });
      if (nextSchoolId) {
        patchParams({ school: nextSchoolId });
        setEditingKey(null);
      } else {
        setSaveNotice("No more schools in the queue for this subject and paper.");
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to find next school");
    } finally {
      setQueueBusy(false);
    }
  }, [canEdit, examId, hasPaper, paperNumber, patchParams, queueStatus, recordType, schoolId, subjectId]);

  const afterSaveQueueStep = useCallback(
    async (freshData: MySchoolScriptControlResponse, savedSubjectId: number) => {
      if (!queueMode) {
        setSaveNotice("Saved.");
        return;
      }
      const subject = freshData.subjects.find((s) => s.subject_id === savedSubjectId);
      if (subject && subjectStillNeedsWork(subject, todayIso)) {
        setSaveNotice("Saved. Continue with remaining series for this school.");
        return;
      }
      if (!hasPaper) {
        setSaveNotice("Saved.");
        return;
      }
      setQueueBusy(true);
      try {
        const nextSchoolId = await findNextQueueSchool({
          examinationId: examId!,
          subjectId,
          paperNumber,
          schoolId,
          recordType,
          statusFilter: queueStatus,
        });
        if (nextSchoolId) {
          patchParams({ school: nextSchoolId });
          setSaveNotice("Saved. Moved to next school in queue.");
        } else {
          setSaveNotice("Saved. Queue complete for this subject and paper.");
        }
      } finally {
        setQueueBusy(false);
      }
    },
    [examId, hasPaper, paperNumber, patchParams, queueMode, queueStatus, recordType, schoolId, subjectId, todayIso],
  );

  const executeSave = useCallback(
    async ({
      saveSubjectId,
      savePaperNumber,
      seriesNumber,
      draftState,
    }: Omit<PendingSave, "meta">) => {
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
        setEditingKey(null);
        const fresh = await loadData();
        if (fresh) await afterSaveQueueStep(fresh, saveSubjectId);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setBusy(false);
      }
    },
    [afterSaveQueueStep, canEdit, examId, loadData, recordType, schoolId],
  );

  const handlers: SeriesEditHandlers = {
    busy,
    onSave: async (saveSubjectId, savePaperNumber, seriesNumber, draftState, meta) => {
      if (!canEdit) return;
      const messages = saveScriptControlConfirmMessages(meta);
      if (messages.length > 0 && !isScriptControlSaveConfirmSkipped()) {
        setPendingSave({ saveSubjectId, savePaperNumber, seriesNumber, draftState, meta });
        return;
      }
      await executeSave({ saveSubjectId, savePaperNumber, seriesNumber, draftState });
    },
    onClear: async (saveSubjectId, savePaperNumber, seriesNumber, packing) => {
      if (!canEdit) return;
      const hadVerified = Boolean(packing?.envelopes?.some((e) => e.verified));
      if (!window.confirm(hadVerified ? "Remove record? Verification will be cleared." : "Remove this packing record?")) return;
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
        const fresh = await loadData();
        if (fresh) await afterSaveQueueStep(fresh, saveSubjectId);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusy(false);
      }
    },
  };

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

  const canQueueNavigate = Boolean(queueMode && canEdit && hasPaper);

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

        {/* Mobile / tablet: combobox grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject type
            </label>
            <SearchableCombobox
              options={SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={subjectTypeFilter}
              onChange={(v) => {
                setEditingKey(null);
                patchParams({
                  subject_type: v === "all" ? undefined : v,
                  subject: undefined,
                });
              }}
              placeholder="All types"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
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
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paper <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={[
                { value: "1", label: "Paper 1" },
                { value: "2", label: "Paper 2" },
              ]}
              value={paperNumberStr}
              onChange={(v) => {
                setEditingKey(null);
                patchParams({ paper: v });
              }}
              placeholder="Select paper…"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              School <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={schoolComboboxOptions}
              value={schoolId}
              onChange={(v) => {
                setEditingKey(null);
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

        <ScriptControlSchoolFilters
          mode="edit"
          region={region}
          zone={zone}
          onRegionChange={(v) => patchParams({ region: v })}
          onZoneChange={(v) => patchParams({ zone: v })}
        />
      </div>

      {queueMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm lg:hidden">
          <span className="font-medium text-primary">Queue mode</span>
          <span className="text-muted-foreground">Work through schools for the selected subject and paper.</span>
          {canQueueNavigate ? (
            <Button type="button" size="sm" variant="outline" disabled={queueBusy} onClick={() => void goToNextSchool()}>
              Next school
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href={viewBackHref}>Back to view</Link>
          </Button>
        </div>
      ) : null}

      {saveNotice ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm lg:hidden">
          <span>{saveNotice}</span>
          {canQueueNavigate && saveNotice.includes("Continue") ? (
            <Button type="button" size="sm" variant="outline" disabled={queueBusy} onClick={() => void goToNextSchool()}>
              Next school
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="link" className="h-auto p-0" asChild>
            <Link href={viewBackHref}>Back to view</Link>
          </Button>
        </div>
      ) : null}

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {examId === null ? (
        <p className="text-sm text-muted-foreground">Select an examination above.</p>
      ) : !hasSubject || !hasPaper || !schoolId.trim() ? (
        <p className="text-sm text-muted-foreground">Select a subject, paper, and school to edit records.</p>
      ) : busy && !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data && selectedSubjectMeta && hasPaper ? (
        <div className="space-y-4">
          <ScriptControlEditContextBar
            className="hidden lg:block"
            data={data}
            subject={selectedSubjectMeta}
            paperNumber={paperNumber}
            recordedSeries={paperProgress?.recordedSeries ?? 0}
            totalSeries={paperProgress?.totalSeries ?? 0}
            queueMode={queueMode}
            canQueueNavigate={canQueueNavigate}
            queueBusy={queueBusy}
            onNextSchool={() => void goToNextSchool()}
            viewBackHref={viewBackHref}
            saveNotice={saveNotice}
          />
          {paperProgress ? (
            <p className="text-sm text-muted-foreground lg:hidden">
              <span className="font-medium text-foreground">{data.school_code}</span>
              {" · "}
              {paperProgress.recordedSeries}/{paperProgress.totalSeries} series recorded
            </p>
          ) : null}
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
            />
          </div>
        </div>
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
            setPendingSave(null);
            void executeSave(save);
          }}
        />
      ) : null}
    </div>
  );
}
