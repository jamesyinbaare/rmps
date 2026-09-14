"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Pencil, X } from "lucide-react";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { DiscardChangesConfirmModal } from "@/components/discard-changes-confirm-modal";
import { ExaminerRatesEligibilityPanel } from "@/components/examiner-rates/examiner-rates-eligibility-panel";
import { ExaminerRatesGroupsPanel } from "@/components/examiner-rates/examiner-rates-groups-panel";
import { ExaminerRatesMarkingPanel } from "@/components/examiner-rates/examiner-rates-marking-panel";
import { ExaminerRatesRoleMatrix } from "@/components/examiner-rates/examiner-rates-role-matrix";
import { ExaminerRatesSectionNav } from "@/components/examiner-rates/examiner-rates-section-nav";
import { ExaminerRatesSittingPanel } from "@/components/examiner-rates/examiner-rates-sitting-panel";
import { ExaminerRatesTravelPanel } from "@/components/examiner-rates/examiner-rates-travel-panel";
import { btnPrimary, btnSecondary } from "@/components/examiner-rates/shared";
import { ExaminerRatesFormulaCallout } from "@/components/examiner-rates-formula-callout";
import { OfficialRatesCopyModal } from "@/components/official-rates-copy-modal";
import {
  copyExaminationExaminerAllowanceRates,
  createExaminationAllowanceGroup,
  deleteExaminationAllowanceGroup,
  getExaminationExaminerDefaultDays,
  getExaminationExaminerMarkingRates,
  getExaminationExaminerRoleAllowanceRates,
  getExaminationExaminerSittingAllowanceRates,
  getExaminationExaminerTravelRates,
  getExaminationRosterAllowanceEligibility,
  listExaminationAllowanceGroups,
  putExaminationAllowanceGroupEligibility,
  putExaminationExaminerDefaultDays,
  putExaminationExaminerMarkingRates,
  putExaminationExaminerRoleAllowanceRates,
  putExaminationExaminerSittingAllowanceRates,
  putExaminationExaminerTravelRates,
  putExaminationRosterAllowanceEligibility,
  renameExaminationAllowanceGroup,
  type AllowanceGroupRow,
  type Examination,
  type ExaminerAllowanceSubjectRef,
  type ExaminerTypeApi,
  type RosterAllowanceEligibilityRow,
} from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";
import {
  EXAMINER_ALLOWANCE_TYPE_OPTIONS,
  EXAMINER_RATES_SECTION_ALLOWANCE_GROUPS,
  EXAMINER_RATES_SECTION_MARKING,
  EXAMINER_RATES_SECTION_ROLE,
  EXAMINER_RATES_SECTION_ROSTER_ELIGIBILITY,
  EXAMINER_RATES_SECTION_SITTING,
  EXAMINER_RATES_SECTION_TRAVEL,
  ROSTER_ALLOWANCE_ELIGIBILITY_KEYS,
  applyRegionZoneAssignment,
  buildDefaultDaysSavePayload,
  buildMarkingRatesSavePayload,
  buildRoleRatesSavePayload,
  buildSittingRatesSavePayload,
  buildTravelRatesSavePayload,
  defaultDaysFromApi,
  filterMarkingSubjects,
  filterMarkingSubjectsBySearch,
  filterRegionOptionsBySearch,
  formatExamLabel,
  markingCellKey,
  markingRatesFromApi,
  newTravelZoneId,
  regionZoneAssignmentFromZones,
  roleRatesFromApi,
  serializeExaminerRatesDraft,
  sittingRatesFromApi,
  travelRatesFromApi,
  travelRoleFactorsFromApi,
  travelRoleZoneFactorKey,
  travelZonesFromApi,
  type DefaultDaysDraft,
  type ExaminerRatesSectionId,
  type MarkingDefaultsDraft,
  type MarkingRateDraft,
  type RoleRateDraft,
  type ScriptControlSubjectTypeFilter,
  type SittingRateDraft,
  type TravelRateDraft,
  type TravelRoleFactorDraft,
  type TravelZoneDraft,
} from "@/lib/examiner-rates-draft";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  exam: Examination;
  allExams: Examination[];
  onClose: () => void;
  onSaved?: () => void;
};

function serializeWhoQualifies(
  eligibilityRows: RosterAllowanceEligibilityRow[],
  allowanceGroups: AllowanceGroupRow[],
): string {
  return JSON.stringify({
    eligibility: eligibilityRows.map((r) => ({
      roster_source: r.roster_source,
      allowances: r.allowances,
    })),
    groups: allowanceGroups.map((g) => ({
      id: g.id,
      name: g.name,
      allowances: g.allowances,
    })),
  });
}

export function ExaminerRatesExamModal({ exam, allExams, onClose, onSaved }: Props) {
  const titleId = useId();
  const editToggleId = useId();

  const [subjects, setSubjects] = useState<ExaminerAllowanceSubjectRef[]>([]);
  const [roleRates, setRoleRates] = useState<RoleRateDraft>({});
  const [markingRates, setMarkingRates] = useState<MarkingRateDraft>({});
  const [markingDefaults, setMarkingDefaults] = useState<MarkingDefaultsDraft>({ paper1: "", paper2: "" });
  const [sittingRates, setSittingRates] = useState<SittingRateDraft>({});
  const [defaultDays, setDefaultDays] = useState<DefaultDaysDraft>({});
  const [travelRates, setTravelRates] = useState<TravelRateDraft>({});
  const [travelZones, setTravelZones] = useState<TravelZoneDraft>([]);
  const [travelRoleFactors, setTravelRoleFactors] = useState<TravelRoleFactorDraft>({});
  const [eligibilityRows, setEligibilityRows] = useState<RosterAllowanceEligibilityRow[]>([]);
  const [allowanceGroups, setAllowanceGroups] = useState<AllowanceGroupRow[]>([]);
  const [selectedAllowanceGroupId, setSelectedAllowanceGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [renameGroupName, setRenameGroupName] = useState("");
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [me, setMe] = useState<UserMe | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [savedWhoSnapshot, setSavedWhoSnapshot] = useState("");
  const [activeSection, setActiveSection] = useState<ExaminerRatesSectionId>(EXAMINER_RATES_SECTION_ROLE);
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

  const amountsDirty = useMemo(() => {
    if (!savedSnapshot || !editing) return false;
    return (
      serializeExaminerRatesDraft(
        roleRates,
        markingRates,
        travelRates,
        travelZones,
        travelRoleFactors,
        markingDefaults,
        sittingRates,
        defaultDays,
      ) !== savedSnapshot
    );
  }, [
    roleRates,
    markingRates,
    markingDefaults,
    sittingRates,
    defaultDays,
    travelRates,
    travelZones,
    travelRoleFactors,
    savedSnapshot,
    editing,
  ]);

  const whoDirty = useMemo(() => {
    if (!savedWhoSnapshot || !editing) return false;
    return serializeWhoQualifies(eligibilityRows, allowanceGroups) !== savedWhoSnapshot;
  }, [eligibilityRows, allowanceGroups, savedWhoSnapshot, editing]);

  const dirty = amountsDirty || whoDirty;

  const regionZoneAssignment = useMemo(
    () => regionZoneAssignmentFromZones(travelZones),
    [travelZones],
  );

  const assignedTravelRegionCount = useMemo(
    () => Object.keys(regionZoneAssignment).length,
    [regionZoneAssignment],
  );

  const sectionHints = useMemo(() => {
    const roleFilled = Object.values(roleRates).filter((v) => v.trim()).length;
    const roleTotal = EXAMINER_ALLOWANCE_TYPE_OPTIONS.length * EXAMINER_TYPE_OPTIONS.length;
    const sittingFilled = Object.values(sittingRates).filter((v) => v.trim()).length;
    const markingFilled = Object.values(markingRates).filter((v) => v.trim()).length;
    const customGroups = allowanceGroups.filter((g) => !g.is_general).length;
    return {
      [EXAMINER_RATES_SECTION_ROLE]: `${roleFilled}/${roleTotal} cells set`,
      [EXAMINER_RATES_SECTION_SITTING]:
        sittingFilled > 0 ? `${sittingFilled}/4 rates set` : "Daily rate × days",
      [EXAMINER_RATES_SECTION_MARKING]:
        subjects.length === 0
          ? "No timetable subjects"
          : `${markingFilled} subject rates`,
      [EXAMINER_RATES_SECTION_ROSTER_ELIGIBILITY]: `${eligibilityRows.length} sources`,
      [EXAMINER_RATES_SECTION_ALLOWANCE_GROUPS]:
        customGroups === 0 ? "General only" : `${customGroups} custom group${customGroups === 1 ? "" : "s"}`,
      [EXAMINER_RATES_SECTION_TRAVEL]: `${assignedTravelRegionCount}/16 regions`,
    };
  }, [
    roleRates,
    sittingRates,
    markingRates,
    subjects.length,
    eligibilityRows.length,
    allowanceGroups,
    assignedTravelRegionCount,
  ]);

  const applyRatesFromApi = useCallback(
    (
      roleDraft: RoleRateDraft,
      markingDraft: MarkingRateDraft,
      markingDefaultsDraft: MarkingDefaultsDraft,
      sittingDraft: SittingRateDraft,
      defaultDaysDraft: DefaultDaysDraft,
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
        markingDefaultsDraft,
        sittingDraft,
        defaultDaysDraft,
      );
      setSubjects(subs);
      setRoleRates(roleDraft);
      setMarkingRates(markingDraft);
      setMarkingDefaults(markingDefaultsDraft);
      setSittingRates(sittingDraft);
      setDefaultDays(defaultDaysDraft);
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
      const [roleData, markingData, travelData, sittingData, defaultDaysData, eligibilityData, groupsData] =
        await Promise.all([
          getExaminationExaminerRoleAllowanceRates(exam.id),
          getExaminationExaminerMarkingRates(exam.id),
          getExaminationExaminerTravelRates(exam.id),
          getExaminationExaminerSittingAllowanceRates(exam.id),
          getExaminationExaminerDefaultDays(exam.id),
          getExaminationRosterAllowanceEligibility(exam.id),
          listExaminationAllowanceGroups(exam.id),
        ]);
      const markingParsed = markingRatesFromApi(markingData);
      setEligibilityRows(eligibilityData.rows);
      setAllowanceGroups(groupsData.groups);
      setSelectedAllowanceGroupId((prev) => {
        if (prev && groupsData.groups.some((g) => g.id === prev)) return prev;
        return groupsData.groups[0]?.id ?? null;
      });
      setRenameGroupName(groupsData.groups[0]?.name ?? "");
      setSavedWhoSnapshot(serializeWhoQualifies(eligibilityData.rows, groupsData.groups));
      applyRatesFromApi(
        roleRatesFromApi(roleData),
        markingParsed.rates,
        markingParsed.defaults,
        sittingRatesFromApi(sittingData),
        defaultDaysFromApi(defaultDaysData),
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
      setSavedWhoSnapshot("");
    } finally {
      setBusy(false);
    }
  }, [applyRatesFromApi, exam.id]);

  useEffect(() => {
    void getMe().then(setMe).catch(() => setMe(null));
  }, []);

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
    const markingPayload = buildMarkingRatesSavePayload(markingRates, markingDefaults);
    const sittingPayload = buildSittingRatesSavePayload(sittingRates);
    const defaultDaysPayload = buildDefaultDaysSavePayload(defaultDays);
    const travelPayload = buildTravelRatesSavePayload(travelRates, travelZones, travelRoleFactors);
    const errors = {
      ...rolePayload.roleErrors,
      ...markingPayload.markingErrors,
      ...sittingPayload.sittingErrors,
      ...defaultDaysPayload.defaultDaysErrors,
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
      if (
        markingPayload.payload.items.length > 0 ||
        markingPayload.payload.default_rate_paper_1_ghs != null ||
        markingPayload.payload.default_rate_paper_2_ghs != null
      ) {
        await putExaminationExaminerMarkingRates(exam.id, markingPayload.payload);
      }
      await putExaminationExaminerSittingAllowanceRates(exam.id, sittingPayload.items);
      await putExaminationExaminerDefaultDays(exam.id, defaultDaysPayload.items);
      const eligibilityCells = eligibilityRows.flatMap((row) =>
        ROSTER_ALLOWANCE_ELIGIBILITY_KEYS.map((key) => ({
          roster_source: row.roster_source,
          allowance_key: key,
          enabled: Boolean(row.allowances[key]),
        })),
      );
      await putExaminationRosterAllowanceEligibility(exam.id, eligibilityCells);
      for (const group of allowanceGroups) {
        await putExaminationAllowanceGroupEligibility(
          exam.id,
          group.id,
          ROSTER_ALLOWANCE_ELIGIBILITY_KEYS.map((key) => ({
            allowance_key: key,
            enabled: Boolean(group.allowances[key]),
          })),
        );
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
        markingDefaults,
        sittingRates,
        defaultDays,
      );
      setSavedSnapshot(snapshot);
      setSavedWhoSnapshot(serializeWhoQualifies(eligibilityRows, allowanceGroups));
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

  function markDirty() {
    setSaveSuccess(false);
  }

  function updateRoleCell(key: string, value: string) {
    setRoleRates((prev) => ({ ...prev, [key]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    markDirty();
  }

  function updateMarkingCell(subjectId: number, paperNumber: number, value: string) {
    const key = markingCellKey(subjectId, paperNumber);
    setMarkingRates((prev) => ({ ...prev, [key]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    markDirty();
  }

  function updateTravelCell(region: string, value: string) {
    setTravelRates((prev) => ({ ...prev, [region]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[region];
      return next;
    });
    markDirty();
  }

  function addTravelZone() {
    setTravelZones((prev) => [...prev, { id: newTravelZoneId(), name: `Zone ${prev.length + 1}`, regions: [] }]);
    markDirty();
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
    markDirty();
  }

  function updateTravelZoneName(zoneId: string, value: string) {
    setTravelZones((prev) => prev.map((zone) => (zone.id === zoneId ? { ...zone, name: value } : zone)));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[`zone:${zoneId}`];
      return next;
    });
    markDirty();
  }

  function updateRegionZoneAssignment(region: string, zoneId: string) {
    setTravelZones((prev) => applyRegionZoneAssignment(prev, region, zoneId));
    markDirty();
  }

  function updateTravelRoleZoneFactor(role: ExaminerTypeApi, zoneId: string, value: string) {
    const key = travelRoleZoneFactorKey(role, zoneId);
    setTravelRoleFactors((prev) => ({ ...prev, [key]: value }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    markDirty();
  }

  function formatTravelRoleFactorDisplay(raw: string): string {
    const t = raw.trim();
    if (!t) return "1";
    const n = Number.parseFloat(t);
    if (Number.isNaN(n)) return t;
    return String(n);
  }

  const selectedAllowanceGroup =
    allowanceGroups.find((g) => g.id === selectedAllowanceGroupId) ?? allowanceGroups[0] ?? null;

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupActionBusy(true);
    setSaveError(null);
    try {
      const created = await createExaminationAllowanceGroup(exam.id, name);
      setAllowanceGroups((prev) => [...prev, created]);
      setSelectedAllowanceGroupId(created.id);
      setNewGroupName("");
      setRenameGroupName(created.name);
      markDirty();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not create group.");
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleRenameGroup() {
    if (!selectedAllowanceGroup || selectedAllowanceGroup.is_general) return;
    const name = renameGroupName.trim();
    if (!name || name === selectedAllowanceGroup.name) return;
    setGroupActionBusy(true);
    setSaveError(null);
    try {
      const updated = await renameExaminationAllowanceGroup(exam.id, selectedAllowanceGroup.id, name);
      setAllowanceGroups((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
      markDirty();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not rename group.");
    } finally {
      setGroupActionBusy(false);
    }
  }

  async function handleDeleteGroup() {
    if (!selectedAllowanceGroup || selectedAllowanceGroup.is_general) return;
    if (!window.confirm(`Delete allowance group “${selectedAllowanceGroup.name}”?`)) return;
    setGroupActionBusy(true);
    setSaveError(null);
    try {
      await deleteExaminationAllowanceGroup(exam.id, selectedAllowanceGroup.id);
      setAllowanceGroups((prev) => {
        const next = prev.filter((g) => g.id !== selectedAllowanceGroup.id);
        setSelectedAllowanceGroupId(next[0]?.id ?? null);
        setRenameGroupName(next[0]?.name ?? "");
        return next;
      });
      markDirty();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not delete group.");
    } finally {
      setGroupActionBusy(false);
    }
  }

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
              Set amounts, who can receive them, and travel.
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
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
              <ExaminerRatesSectionNav
                activeSection={activeSection}
                onSelect={setActiveSection}
                hints={sectionHints}
              />
              <div className="min-w-0 flex-1">
                {activeSection === EXAMINER_RATES_SECTION_ROLE ? (
                  <ExaminerRatesRoleMatrix
                    editing={editing}
                    saving={saving}
                    roleRates={roleRates}
                    cellErrors={cellErrors}
                    onChange={updateRoleCell}
                  />
                ) : null}

                {activeSection === EXAMINER_RATES_SECTION_SITTING ? (
                  <ExaminerRatesSittingPanel
                    editing={editing}
                    sittingRates={sittingRates}
                    defaultDays={defaultDays}
                    onSittingChange={(role, value) => {
                      setSittingRates((prev) => ({ ...prev, [role]: value }));
                      markDirty();
                    }}
                    onDefaultDaysChange={(role, value) => {
                      setDefaultDays((prev) => ({ ...prev, [role]: value }));
                      markDirty();
                    }}
                  />
                ) : null}

                {activeSection === EXAMINER_RATES_SECTION_MARKING ? (
                  <ExaminerRatesMarkingPanel
                    editing={editing}
                    saving={saving}
                    subjects={subjects}
                    searchedSubjects={searchedMarkingSubjects}
                    markingRates={markingRates}
                    markingDefaults={markingDefaults}
                    cellErrors={cellErrors}
                    markingSubjectSearch={markingSubjectSearch}
                    markingSubjectTypeFilter={markingSubjectTypeFilter}
                    onDefaultsChange={(next) => {
                      setMarkingDefaults(next);
                      markDirty();
                    }}
                    onSearchChange={setMarkingSubjectSearch}
                    onTypeFilterChange={setMarkingSubjectTypeFilter}
                    onMarkingCellChange={updateMarkingCell}
                    onApplyDefaults={() =>
                      void putExaminationExaminerMarkingRates(exam.id, {
                        items: [],
                        default_rate_paper_1_ghs: markingDefaults.paper1.trim() || null,
                        default_rate_paper_2_ghs: markingDefaults.paper2.trim() || null,
                        apply_defaults_to_unset: true,
                      }).then(() => loadRates())
                    }
                  />
                ) : null}

                {activeSection === EXAMINER_RATES_SECTION_ROSTER_ELIGIBILITY ? (
                  <ExaminerRatesEligibilityPanel
                    editing={editing}
                    saving={saving}
                    eligibilityRows={eligibilityRows}
                    onToggle={(rosterSource, key, enabled) => {
                      setEligibilityRows((prev) =>
                        prev.map((r) =>
                          r.roster_source === rosterSource
                            ? { ...r, allowances: { ...r.allowances, [key]: enabled } }
                            : r,
                        ),
                      );
                      markDirty();
                    }}
                  />
                ) : null}

                {activeSection === EXAMINER_RATES_SECTION_ALLOWANCE_GROUPS ? (
                  <ExaminerRatesGroupsPanel
                    examinationId={exam.id}
                    editing={editing}
                    saving={saving}
                    groupActionBusy={groupActionBusy}
                    canEditGroupAdjustments={me?.role === "SUPER_ADMIN"}
                    allowanceGroups={allowanceGroups}
                    selectedGroup={selectedAllowanceGroup}
                    newGroupName={newGroupName}
                    renameGroupName={renameGroupName}
                    onSelectGroup={(group) => {
                      setSelectedAllowanceGroupId(group.id);
                      setRenameGroupName(group.name);
                    }}
                    onNewGroupNameChange={setNewGroupName}
                    onRenameGroupNameChange={setRenameGroupName}
                    onCreate={() => void handleCreateGroup()}
                    onRename={() => void handleRenameGroup()}
                    onDelete={() => void handleDeleteGroup()}
                    onToggleAllowance={(groupId, key, enabled) => {
                      setAllowanceGroups((prev) =>
                        prev.map((g) =>
                          g.id === groupId
                            ? { ...g, allowances: { ...g.allowances, [key]: enabled } }
                            : g,
                        ),
                      );
                      markDirty();
                    }}
                    onMemberCountChange={(groupId, count) => {
                      setAllowanceGroups((prev) =>
                        prev.map((g) => (g.id === groupId ? { ...g, member_count: count } : g)),
                      );
                    }}
                    onGroupAdjustmentsSaved={(group) => {
                      setAllowanceGroups((prev) =>
                        prev.map((g) => (g.id === group.id ? { ...g, ...group } : g)),
                      );
                    }}
                  />
                ) : null}

                {activeSection === EXAMINER_RATES_SECTION_TRAVEL ? (
                  <ExaminerRatesTravelPanel
                    editing={editing}
                    saving={saving}
                    travelRates={travelRates}
                    travelZones={travelZones}
                    travelRoleFactors={travelRoleFactors}
                    cellErrors={cellErrors}
                    travelRegionSearch={travelRegionSearch}
                    searchedTravelRegions={searchedTravelRegions}
                    regionZoneAssignment={regionZoneAssignment}
                    assignedTravelRegionCount={assignedTravelRegionCount}
                    onTravelRegionSearchChange={setTravelRegionSearch}
                    onAddZone={addTravelZone}
                    onRemoveZone={removeTravelZone}
                    onUpdateZoneName={updateTravelZoneName}
                    onAssignRegion={updateRegionZoneAssignment}
                    onTravelRateChange={updateTravelCell}
                    onRoleFactorChange={updateTravelRoleZoneFactor}
                    formatTravelRoleFactorDisplay={formatTravelRoleFactorDisplay}
                  />
                ) : null}
              </div>
            </div>
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
          onConfirm={() => {
            setPendingClose(false);
            onClose();
          }}
          onCancel={() => setPendingClose(false)}
        />
      ) : null}

      {pendingDisableEdit ? (
        <DiscardChangesConfirmModal
          onConfirm={() => {
            setPendingDisableEdit(false);
            void loadRates();
            setEditing(false);
          }}
          onCancel={() => setPendingDisableEdit(false)}
        />
      ) : null}
    </div>
  );
}
