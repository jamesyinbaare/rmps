"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { DiscardChangesConfirmModal } from "@/components/discard-changes-confirm-modal";
import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { ExaminerRatesFormulaCallout } from "@/components/examiner-rates-formula-callout";
import { OfficialRatesCopyModal } from "@/components/official-rates-copy-modal";
import {
  copyExaminationExaminerAllowanceRates,
  getExaminationExaminerMarkingRates,
  getExaminationExaminerRoleAllowanceRates,
  getExaminationExaminerTravelRates,
  putExaminationExaminerMarkingRates,
  putExaminationExaminerRoleAllowanceRates,
  putExaminationExaminerTravelRates,
  type Examination,
  type ExaminerAllowanceSubjectRef,
  type ExaminerTypeApi,
} from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  EXAMINER_ALLOWANCE_TYPE_OPTIONS,
  EXAMINER_MARKING_TAB,
  EXAMINER_TRAVEL_TAB,
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  buildMarkingRatesSavePayload,
  buildRoleRatesSavePayload,
  applyRegionZoneAssignment,
  buildTravelRatesSavePayload,
  filterMarkingSubjects,
  filterMarkingSubjectsBySearch,
  filterRegionOptionsBySearch,
  formatExamLabel,
  markingCellKey,
  markingRatesFromApi,
  newTravelZoneId,
  regionZoneAssignmentFromZones,
  roleCellKey,
  roleRatesFromApi,
  serializeExaminerRatesDraft,
  subjectTypeLabel,
  travelRatesFromApi,
  travelRoleFactorsFromApi,
  travelRoleZoneFactorKey,
  travelZonesFromApi,
  type ExaminerAllowanceTypeApi,
  type ExaminerRatesTab,
  type MarkingRateDraft,
  type RoleRateDraft,
  type ScriptControlSubjectTypeFilter,
  type TravelRateDraft,
  type TravelRoleFactorDraft,
  type TravelZoneDraft,
} from "@/lib/examiner-rates-draft";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const rateAmountInputClass =
  "h-9 w-full min-w-[4.5rem] rounded-md border border-input-border bg-input px-2 text-right text-sm tabular-nums text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

const searchInputClass =
  "h-9 w-full rounded-md border border-input-border bg-input pl-9 pr-3 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function RatesSectionHeader({
  step,
  title,
  description,
  action,
}: {
  step: number;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {step}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {description ? <p className="mt-1 pl-8 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function InlineSearchField({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={searchInputClass}
      />
    </div>
  );
}

const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

type Props = {
  exam: Examination;
  allExams: Examination[];
  onClose: () => void;
  onSaved?: () => void;
};

export function ExaminerRatesExamModal({ exam, allExams, onClose, onSaved }: Props) {
  const titleId = useId();
  const editToggleId = useId();

  const [subjects, setSubjects] = useState<ExaminerAllowanceSubjectRef[]>([]);
  const [roleRates, setRoleRates] = useState<RoleRateDraft>({});
  const [markingRates, setMarkingRates] = useState<MarkingRateDraft>({});
  const [travelRates, setTravelRates] = useState<TravelRateDraft>({});
  const [travelZones, setTravelZones] = useState<TravelZoneDraft>([]);
  const [travelRoleFactors, setTravelRoleFactors] = useState<TravelRoleFactorDraft>({});
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [activeTab, setActiveTab] = useState<ExaminerRatesTab>(EXAMINER_ALLOWANCE_TYPE_OPTIONS[0]!.value);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDisableEdit, setPendingDisableEdit] = useState(false);
  const [markingSubjectTypeFilter, setMarkingSubjectTypeFilter] =
    useState<ScriptControlSubjectTypeFilter>("all");
  const [markingSubjectSearch, setMarkingSubjectSearch] = useState("");
  const [travelRegionSearch, setTravelRegionSearch] = useState("");

  const examLabel = formatExamLabel(exam);

  const filteredMarkingSubjects = useMemo(
    () => filterMarkingSubjects(subjects, markingSubjectTypeFilter),
    [subjects, markingSubjectTypeFilter],
  );

  const searchedMarkingSubjects = useMemo(
    () => filterMarkingSubjectsBySearch(filteredMarkingSubjects, markingSubjectSearch),
    [filteredMarkingSubjects, markingSubjectSearch],
  );

  const searchedTravelRegions = useMemo(
    () => filterRegionOptionsBySearch(REGION_OPTIONS, travelRegionSearch),
    [travelRegionSearch],
  );

  const dirty = useMemo(() => {
    if (!savedSnapshot || !editing) return false;
    return (
      serializeExaminerRatesDraft(roleRates, markingRates, travelRates, travelZones, travelRoleFactors) !==
      savedSnapshot
    );
  }, [roleRates, markingRates, travelRates, travelZones, travelRoleFactors, savedSnapshot, editing]);

  const regionZoneAssignment = useMemo(
    () => regionZoneAssignmentFromZones(travelZones),
    [travelZones],
  );

  const assignedTravelRegionCount = useMemo(
    () => Object.keys(regionZoneAssignment).length,
    [regionZoneAssignment],
  );

  const applyRatesFromApi = useCallback(
    (
      roleDraft: RoleRateDraft,
      markingDraft: MarkingRateDraft,
      travelDraft: TravelRateDraft,
      travelZoneDraft: TravelZoneDraft,
      travelFactorDraft: TravelRoleFactorDraft,
      subs: ExaminerAllowanceSubjectRef[],
    ) => {
      const snapshot = serializeExaminerRatesDraft(
        roleDraft,
        markingDraft,
        travelDraft,
        travelZoneDraft,
        travelFactorDraft,
      );
      setSubjects(subs);
      setRoleRates(roleDraft);
      setMarkingRates(markingDraft);
      setTravelRates(travelDraft);
      setTravelZones(travelZoneDraft);
      setTravelRoleFactors(travelFactorDraft);
      setSavedSnapshot(snapshot);
      setCellErrors({});
      setSaveError(null);
    },
    [],
  );

  const loadRates = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const [roleData, markingData, travelData] = await Promise.all([
        getExaminationExaminerRoleAllowanceRates(exam.id),
        getExaminationExaminerMarkingRates(exam.id),
        getExaminationExaminerTravelRates(exam.id),
      ]);
      applyRatesFromApi(
        roleRatesFromApi(roleData),
        markingRatesFromApi(markingData),
        travelRatesFromApi(travelData),
        travelZonesFromApi(travelData),
        travelRoleFactorsFromApi(travelData),
        markingData.subjects,
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We could not load these rates. Please try again.");
      setSubjects([]);
      setRoleRates({});
      setMarkingRates({});
      setTravelRates({});
      setTravelZones([]);
      setTravelRoleFactors({});
      setSavedSnapshot("");
    } finally {
      setBusy(false);
    }
  }, [applyRatesFromApi, exam.id]);

  useEffect(() => {
    void loadRates();
    setEditing(false);
  }, [loadRates, exam.id]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setPendingClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const rolePayload = buildRoleRatesSavePayload(roleRates);
    const markingPayload = buildMarkingRatesSavePayload(markingRates);
    const travelPayload = buildTravelRatesSavePayload(travelRates, travelZones, travelRoleFactors);
    const errors = {
      ...rolePayload.roleErrors,
      ...markingPayload.markingErrors,
      ...travelPayload.travelErrors,
      ...travelPayload.travelZoneErrors,
      ...travelPayload.travelFactorErrors,
    };
    if (Object.keys(errors).length > 0) {
      setCellErrors(errors);
      setSaveError("Fix the highlighted amounts before saving.");
      setSaving(false);
      return;
    }
    try {
      if (rolePayload.items.length > 0) {
        await putExaminationExaminerRoleAllowanceRates(exam.id, rolePayload.items);
      }
      if (markingPayload.items.length > 0) {
        await putExaminationExaminerMarkingRates(exam.id, markingPayload.items);
      }
      if (
        travelPayload.items.length > 0 ||
        travelPayload.zones.length > 0 ||
        travelPayload.role_factors.length > 0
      ) {
        await putExaminationExaminerTravelRates(exam.id, {
          items: travelPayload.items,
          zones: travelPayload.zones,
          role_factors: travelPayload.role_factors,
        });
      }
      const snapshot = serializeExaminerRatesDraft(
        roleRates,
        markingRates,
        travelRates,
        travelZones,
        travelRoleFactors,
      );
      setSavedSnapshot(snapshot);
      setSaveSuccess(true);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "We could not save these rates. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyFrom(sourceExamId: number) {
    setCopyBusy(true);
    setSaveError(null);
    try {
      await copyExaminationExaminerAllowanceRates(exam.id, sourceExamId);
      await loadRates();
      setCopyModalOpen(false);
      setEditing(true);
      setSaveSuccess(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "We could not copy those rates. Please try again.");
    } finally {
      setCopyBusy(false);
    }
  }

  function updateRoleCell(key: string, value: string) {
    setRoleRates((prev) => ({ ...prev, [key]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaveSuccess(false);
  }

  function updateMarkingCell(subjectId: number, paperNumber: number, value: string) {
    const key = markingCellKey(subjectId, paperNumber);
    setMarkingRates((prev) => ({ ...prev, [key]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaveSuccess(false);
  }

  function updateTravelCell(region: string, value: string) {
    setTravelRates((prev) => ({ ...prev, [region]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[region];
      return next;
    });
    setSaveSuccess(false);
  }

  function addTravelZone() {
    setTravelZones((prev) => [...prev, { id: newTravelZoneId(), name: `Zone ${prev.length + 1}`, regions: [] }]);
    setSaveSuccess(false);
  }

  function removeTravelZone(zoneId: string) {
    setTravelZones((prev) => prev.filter((zone) => zone.id !== zoneId));
    setTravelRoleFactors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.endsWith(`|${zoneId}`)) delete next[key];
      }
      return next;
    });
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[`zone:${zoneId}`];
      for (const key of Object.keys(next)) {
        if (key.endsWith(`|${zoneId}`)) delete next[key];
      }
      return next;
    });
    setSaveSuccess(false);
  }

  function updateTravelZoneName(zoneId: string, value: string) {
    setTravelZones((prev) =>
      prev.map((zone) => (zone.id === zoneId ? { ...zone, name: value } : zone)),
    );
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[`zone:${zoneId}`];
      return next;
    });
    setSaveSuccess(false);
  }

  function updateRegionZoneAssignment(region: string, zoneId: string) {
    setTravelZones((prev) => applyRegionZoneAssignment(prev, region, zoneId));
    setSaveSuccess(false);
  }

  function updateTravelRoleZoneFactor(role: ExaminerTypeApi, zoneId: string, value: string) {
    const key = travelRoleZoneFactorKey(role, zoneId);
    setTravelRoleFactors((prev) => ({ ...prev, [key]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaveSuccess(false);
  }

  function formatTravelRoleFactorDisplay(raw: string): string {
    const t = raw.trim();
    if (!t) return "1";
    const n = Number.parseFloat(t);
    if (Number.isNaN(n)) return t;
    return String(n);
  }

  const tabButtons: { id: ExaminerRatesTab; label: string }[] = [
    ...EXAMINER_ALLOWANCE_TYPE_OPTIONS.map((o) => ({ id: o.value, label: o.label })),
    { id: EXAMINER_MARKING_TAB, label: "Marking" },
    { id: EXAMINER_TRAVEL_TAB, label: "T & T" },
  ];

  const activeAllowanceTab = EXAMINER_ALLOWANCE_TYPE_OPTIONS.some((o) => o.value === activeTab)
    ? (activeTab as ExaminerAllowanceTypeApi)
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-foreground/40" onClick={requestClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
              Examiner rates — {examLabel}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Flat role allowances, per-subject marking rates, and regional T &amp; T.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <ExaminerRatesFormulaCallout />

          {loadError ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {loadError}
            </p>
          ) : null}

          {busy ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading rates…
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3">
                {tabButtons.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === EXAMINER_TRAVEL_TAB ? (
                <div className="mt-4 space-y-5">
                  <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">T &amp; T payable</span> = regional base amount × role factor
                      for the examiner&apos;s zone (default 1).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-background px-2.5 py-1">
                        {travelZones.length} {travelZones.length === 1 ? "zone" : "zones"}
                      </span>
                      <span className="rounded-full bg-background px-2.5 py-1">
                        {assignedTravelRegionCount}/{REGION_OPTIONS.length} regions assigned
                      </span>
                    </div>
                  </div>

                  <section className="overflow-hidden rounded-xl border border-border">
                    <RatesSectionHeader
                      step={1}
                      title="T & T zones"
                      description="Group regions into custom zones for role multipliers."
                      action={
                        editing ? (
                          <button
                            type="button"
                            onClick={addTravelZone}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-input-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <Plus className="size-3.5" />
                            Add zone
                          </button>
                        ) : null
                      }
                    />
                    {travelZones.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <MapPin className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
                        <p className="mt-3 text-sm text-muted-foreground">
                          No zones yet. Add at least one zone, then assign regions in step 2.
                        </p>
                        {editing ? (
                          <button
                            type="button"
                            onClick={addTravelZone}
                            disabled={saving}
                            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                          >
                            <Plus className="size-4" />
                            Create first zone
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid gap-3 p-4 sm:grid-cols-2">
                        {travelZones.map((zone) => (
                          <div
                            key={zone.id}
                            className="rounded-lg border border-border bg-muted/20 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              {editing ? (
                                <input
                                  type="text"
                                  disabled={saving}
                                  className={cn(formInputClass, "min-w-0 flex-1")}
                                  value={zone.name}
                                  onChange={(e) => updateTravelZoneName(zone.id, e.target.value)}
                                  aria-invalid={Boolean(cellErrors[`zone:${zone.id}`])}
                                />
                              ) : (
                                <p className="font-medium text-foreground">{zone.name}</p>
                              )}
                              {editing ? (
                                <button
                                  type="button"
                                  onClick={() => removeTravelZone(zone.id)}
                                  disabled={saving}
                                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Remove ${zone.name}`}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              ) : null}
                            </div>
                            {cellErrors[`zone:${zone.id}`] ? (
                              <p className="mt-1 text-xs text-destructive">{cellErrors[`zone:${zone.id}`]}</p>
                            ) : null}
                            <p className="mt-2 text-xs text-muted-foreground">
                              {zone.regions.length} {zone.regions.length === 1 ? "region" : "regions"}
                            </p>
                            {zone.regions.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {zone.regions.map((region) => (
                                  <span
                                    key={region}
                                    className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                                  >
                                    {region}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {travelZones.length > 0 ? (
                    <section className="overflow-hidden rounded-xl border border-border">
                      <RatesSectionHeader
                        step={2}
                        title="Assign regions to zones"
                        description="Each region can belong to one zone. Unassigned regions use factor 1."
                      />
                      <div className="border-b border-border px-4 py-3">
                        <InlineSearchField
                          id="travel-region-search"
                          value={travelRegionSearch}
                          onChange={setTravelRegionSearch}
                          placeholder="Search regions…"
                          className="max-w-sm"
                        />
                        {travelRegionSearch.trim() ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Showing {searchedTravelRegions.length} of {REGION_OPTIONS.length} regions
                          </p>
                        ) : null}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[28rem] text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/40 text-left">
                              <th className="px-4 py-2.5 font-semibold">Region</th>
                              <th className="px-4 py-2.5 font-semibold">T &amp; T zone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchedTravelRegions.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                                  No regions match your search.
                                </td>
                              </tr>
                            ) : (
                              searchedTravelRegions.map((region) => (
                                <tr key={region.value} className="border-b border-border/60 last:border-0">
                                  <td className="px-4 py-2">{region.label}</td>
                                  <td className="px-4 py-2">
                                    {editing ? (
                                      <select
                                        className={cn(formInputClass, "max-w-xs")}
                                        disabled={saving}
                                        value={regionZoneAssignment[region.value] ?? ""}
                                        onChange={(e) =>
                                          updateRegionZoneAssignment(region.value, e.target.value)
                                        }
                                      >
                                        <option value="">Unassigned</option>
                                        {travelZones.map((zone) => (
                                          <option key={zone.id} value={zone.id}>
                                            {zone.name}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {travelZones.find((z) => z.id === regionZoneAssignment[region.value])
                                          ?.name ?? "Unassigned"}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}

                  {travelZones.length > 0 ? (
                    <section className="overflow-hidden rounded-xl border border-border">
                      <RatesSectionHeader
                        step={3}
                        title="Role × zone multipliers"
                        description="Leave blank to use 1. Only affects T & T, not other allowances."
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[32rem] text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/40 text-left">
                              <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 font-semibold">
                                Role
                              </th>
                              {travelZones.map((zone) => (
                                <th key={zone.id} className="px-4 py-2.5 font-semibold text-right">
                                  {zone.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {EXAMINER_TYPE_OPTIONS.map((role) => (
                              <tr key={role.value} className="border-b border-border/60 last:border-0">
                                <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium">
                                  {role.label}
                                </td>
                                {travelZones.map((zone) => {
                                  const key = travelRoleZoneFactorKey(role.value, zone.id);
                                  return (
                                    <td key={zone.id} className="px-4 py-2">
                                      {editing ? (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          disabled={saving}
                                          className={rateAmountInputClass}
                                          placeholder="1"
                                          value={travelRoleFactors[key] ?? ""}
                                          onChange={(e) =>
                                            updateTravelRoleZoneFactor(role.value, zone.id, e.target.value)
                                          }
                                          aria-invalid={Boolean(cellErrors[key])}
                                        />
                                      ) : (
                                        <span className="block text-right tabular-nums">
                                          {formatTravelRoleFactorDisplay(travelRoleFactors[key] ?? "")}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}

                  <section className="overflow-hidden rounded-xl border border-border">
                    <RatesSectionHeader
                      step={travelZones.length > 0 ? 4 : 2}
                      title="Regional base amounts"
                      description="One T & T amount per examiner home region, before the role × zone multiplier."
                    />
                    <div className="border-b border-border px-4 py-3">
                      <InlineSearchField
                        id="travel-base-region-search"
                        value={travelRegionSearch}
                        onChange={setTravelRegionSearch}
                        placeholder="Search regions…"
                        className="max-w-sm"
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[28rem] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left">
                            <th className="px-4 py-2.5 font-semibold">Region</th>
                            <th className="px-4 py-2.5 font-semibold text-right">T &amp; T (GHS)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {searchedTravelRegions.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                                No regions match your search.
                              </td>
                            </tr>
                          ) : (
                            searchedTravelRegions.map((region) => (
                              <tr key={region.value} className="border-b border-border/60 last:border-0">
                                <td className="px-4 py-2">{region.label}</td>
                                <td className="px-4 py-2">
                                  {editing ? (
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      disabled={saving}
                                      className={rateAmountInputClass}
                                      value={travelRates[region.value] ?? ""}
                                      onChange={(e) => updateTravelCell(region.value, e.target.value)}
                                      aria-invalid={Boolean(cellErrors[region.value])}
                                    />
                                  ) : (
                                    <span className="block text-right tabular-nums">
                                      {formatGhsAmount(travelRates[region.value] || null)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : activeTab === EXAMINER_MARKING_TAB ? (
                subjects.length === 0 ? (
                  <p className="mt-6 text-sm text-muted-foreground">
                    No subjects are on this examination timetable yet. Add timetable subjects before configuring
                    marking rates.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="w-full max-w-xs">
                        <label className={formLabelClass} htmlFor="marking-subject-search">
                          Search subjects
                        </label>
                        <InlineSearchField
                          id="marking-subject-search"
                          value={markingSubjectSearch}
                          onChange={setMarkingSubjectSearch}
                          placeholder="Code or name…"
                          className="mt-1"
                        />
                      </div>
                      <div className="w-full max-w-xs">
                        <label className={formLabelClass} htmlFor="marking-subject-type-filter">
                          Subject type
                        </label>
                        <select
                          id="marking-subject-type-filter"
                          className={cn(formInputClass, "mt-1")}
                          value={markingSubjectTypeFilter}
                          onChange={(e) =>
                            setMarkingSubjectTypeFilter(e.target.value as ScriptControlSubjectTypeFilter)
                          }
                        >
                          {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {(markingSubjectSearch.trim() || markingSubjectTypeFilter !== "all") && (
                        <p className="text-xs text-muted-foreground sm:pb-2">
                          Showing {searchedMarkingSubjects.length} of {subjects.length} subjects
                        </p>
                      )}
                    </div>
                    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[36rem] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left">
                            <th className="px-3 py-2.5 font-semibold">Subject</th>
                            <th className="px-3 py-2.5 font-semibold">Type</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Paper 1 (GHS)</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Paper 2 (GHS)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {searchedMarkingSubjects.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                                {markingSubjectSearch.trim()
                                  ? "No subjects match your search."
                                  : "No subjects match this type filter."}
                              </td>
                            </tr>
                          ) : (
                            searchedMarkingSubjects.map((s) => (
                              <tr key={s.id} className="border-b border-border/60 last:border-0">
                                <td className="px-3 py-2">
                                  <span className="font-medium">{s.code || s.name}</span>
                                  {s.code && s.name ? (
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{s.name}</span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{subjectTypeLabel(s.subject_type)}</td>
                                {[1, 2].map((paperNumber) => {
                                  const onTimetable = s.paper_numbers.includes(paperNumber);
                                  const key = markingCellKey(s.id, paperNumber);
                                  return (
                                    <td key={paperNumber} className="px-3 py-2">
                                      {!onTimetable ? (
                                        <span className="block text-right text-muted-foreground">—</span>
                                      ) : editing ? (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          disabled={saving}
                                          className={rateAmountInputClass}
                                          value={markingRates[key] ?? ""}
                                          onChange={(e) => updateMarkingCell(s.id, paperNumber, e.target.value)}
                                          aria-invalid={Boolean(cellErrors[key])}
                                          aria-label={`${s.code || s.name} paper ${paperNumber} rate`}
                                        />
                                      ) : (
                                        <span className="block text-right tabular-nums">
                                          {formatGhsAmount(markingRates[key] || null)}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              ) : activeAllowanceTab ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[24rem] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className="px-3 py-2.5 font-semibold">Role</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Amount (GHS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EXAMINER_TYPE_OPTIONS.map((role) => {
                        const key = roleCellKey(activeAllowanceTab, role.value);
                        return (
                          <tr key={role.value} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2 font-medium">{role.label}</td>
                            <td className="px-3 py-2">
                              {editing ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={saving}
                                  className={rateAmountInputClass}
                                  value={roleRates[key] ?? ""}
                                  onChange={(e) => updateRoleCell(key, e.target.value)}
                                  aria-invalid={Boolean(cellErrors[key])}
                                />
                              ) : (
                                <span className="block text-right tabular-nums">
                                  {formatGhsAmount(roleRates[key] || null)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-6">
          {saveError ? (
            <p className="mb-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="mb-3 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" />
              Rates saved.
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={busy || copyBusy || saving}
                onClick={() => setCopyModalOpen(true)}
              >
                <Copy className="mr-2 size-4" />
                Copy from exam
              </button>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {!editing ? (
                <button
                  type="button"
                  id={editToggleId}
                  className={cn(btnPrimary, officialAccountsBtnPrimary)}
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="mr-2 size-4" />
                  Edit rates
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={saving}
                    onClick={() => {
                      if (dirty) {
                        setPendingDisableEdit(true);
                        return;
                      }
                      setEditing(false);
                    }}
                  >
                    Cancel edit
                  </button>
                  <button
                    type="button"
                    className={cn(btnPrimary, officialAccountsBtnPrimary)}
                    disabled={saving || !dirty}
                    onClick={() => void handleSave()}
                  >
                    {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Save rates
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {copyModalOpen ? (
        <OfficialRatesCopyModal
          exams={allExams}
          currentExamId={exam.id}
          busy={copyBusy}
          onCancel={() => setCopyModalOpen(false)}
          onConfirm={(sourceId) => void handleCopyFrom(sourceId)}
        />
      ) : null}

      {pendingClose ? (
        <DiscardChangesConfirmModal
          onDiscard={() => {
            setPendingClose(false);
            onClose();
          }}
          onKeepEditing={() => setPendingClose(false)}
        />
      ) : null}

      {pendingDisableEdit ? (
        <DiscardChangesConfirmModal
          onDiscard={() => {
            setPendingDisableEdit(false);
            void loadRates();
            setEditing(false);
          }}
          onKeepEditing={() => setPendingDisableEdit(false)}
        />
      ) : null}
    </div>
  );
}
