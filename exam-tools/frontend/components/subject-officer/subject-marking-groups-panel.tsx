"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildCohortFormSnapshot,
  cohortDetailsEqual,
  cohortMembershipEqual,
  type CohortFormSnapshot,
} from "@/components/cohorts/cohort-form-snapshot";
import {
  CohortScheduleFields,
  validateCohortSchedule,
} from "@/components/cohorts/cohort-schedule-fields";
import {
  cohortScheduleFromRow,
  cohortScheduleToPayload,
  emptyCohortScheduleDraft,
  type CohortScheduleDraft,
} from "@/components/cohorts/cohort-schedule-utils";
import { CohortCoverageBar } from "@/components/cohorts/cohort-coverage-bar";
import { CohortListColumn } from "@/components/cohorts/cohort-list-column";
import { CohortManageModal } from "@/components/cohorts/cohort-manage-modal";
import { CohortUnassignedModal } from "@/components/cohorts/cohort-unassigned-modal";
import type { CohortListItem, MembershipExaminer } from "@/components/cohorts/types";
import { computeCoverage } from "@/components/cohorts/utils";
import { useCohortMembershipDraft } from "@/components/cohorts/use-cohort-membership-draft";
import { EXAMINERS_PANEL_CLASS } from "@/components/examiners/constants";
import { SubjectScopePicker } from "@/components/subject-scope-picker";
import { Button } from "@/components/ui/button";
import {
  createSubjectMarkingGroup,
  deleteSubjectMarkingGroup,
  listExaminationExaminers,
  listSubjectMarkingGroups,
  replaceSubjectMarkingGroupMembers,
  updateSubjectMarkingGroup,
  type ExaminerRow,
  type SubjectMarkingGroupRow,
  type Subject,
} from "@/lib/api";
function toCohortListItem(g: SubjectMarkingGroupRow): CohortListItem {
  return {
    id: g.id,
    name: g.name,
    is_default: g.is_default,
    examiner_ids: g.examiner_ids,
    source_regions: g.source_regions,
    source_roles: g.source_roles,
    coordinationStartDate: g.coordination_start_date,
    coordinationStartTime: g.coordination_start_time,
    coordinationEndDate: g.coordination_end_date,
    coordinationEndTime: g.coordination_end_time,
    markingStartDate: g.marking_start_date,
    markingEndDate: g.marking_end_date,
    markedScriptSubmissionDeadline: g.marked_script_submission_deadline,
  };
}

function snapshotFromGroup(group: SubjectMarkingGroupRow): CohortFormSnapshot {
  return buildCohortFormSnapshot(group.name, cohortScheduleFromRow(group), {
    source_regions: group.source_regions,
    source_roles: group.source_roles,
    examiner_ids: group.examiner_ids,
  });
}

type Props = {
  examId: number | null;
  subjects: Subject[];
  embedded?: boolean;
  pageScroll?: boolean;
  /** Super Admin / Test Admin Officer can edit default cohort schedules. */
  canManageDefaultCohort?: boolean;
  /** When false, cohorts are view-only (subject officers). */
  canManageCohorts?: boolean;
  /** When set, subject scope is controlled by the page command bar. */
  lockedSubjectId?: number;
};

export function SubjectMarkingGroupsPanel({
  examId,
  subjects,
  embedded = false,
  pageScroll = false,
  canManageDefaultCohort = false,
  canManageCohorts = true,
  lockedSubjectId,
}: Props) {
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [groups, setGroups] = useState<SubjectMarkingGroupRow[]>([]);
  const [examiners, setExaminers] = useState<ExaminerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [unassignedModalOpen, setUnassignedModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [nameInput, setNameInput] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<CohortScheduleDraft>(emptyCohortScheduleDraft);
  const [savedSnapshot, setSavedSnapshot] = useState<CohortFormSnapshot | null>(null);
  const pendingPreselectedRef = useRef<string[]>([]);
  const [captureCreateBaseline, setCaptureCreateBaseline] = useState(false);

  function membershipPayloadFromDrafts() {
    return {
      source_regions: Object.entries(membership.regionsDraft)
        .filter(([, v]) => v)
        .map(([k]) => k),
      source_roles: Object.entries(membership.rolesDraft)
        .filter(([, v]) => v)
        .map(([k]) => k),
      examiner_ids: Object.entries(membership.membersDraft)
        .filter(([, v]) => v)
        .map(([id]) => id),
    };
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedId(null);
    setIsCreating(false);
    setDeleteConfirmOpen(false);
    pendingPreselectedRef.current = [];
    setSavedSnapshot(null);
    setDetailsError(null);
    setMembershipError(null);
  }

  const cohortList = useMemo(() => groups.map(toCohortListItem), [groups]);

  const subjectExaminers = useMemo((): MembershipExaminer[] => {
    if (subjectId == null) return [];
    return examiners
      .filter((e) => e.subject_ids.includes(subjectId))
      .map((e) => ({
        id: e.id,
        name: e.name,
        region: e.region,
        examiner_type: e.examiner_type,
      }));
  }, [examiners, subjectId]);

  const editingCohortId = isCreating ? null : selectedId;

  const membership = useCohortMembershipDraft(subjectExaminers, cohortList, editingCohortId);

  const coverage = useMemo(
    () => computeCoverage(subjectExaminers, cohortList),
    [cohortList, subjectExaminers],
  );

  const scheduleValidation = useMemo(() => validateCohortSchedule(scheduleDraft), [scheduleDraft]);

  const detailsDirty =
    savedSnapshot != null &&
    !cohortDetailsEqual(
      { name: nameInput, schedule: scheduleDraft },
      { name: savedSnapshot.name, schedule: savedSnapshot.schedule },
    );

  const membershipDirty =
    savedSnapshot != null &&
    !cohortMembershipEqual(membershipPayloadFromDrafts(), savedSnapshot.membership);

  const isDirty = detailsDirty || membershipDirty;

  const selectedGroup = useMemo(
    () => (selectedId ? groups.find((g) => g.id === selectedId) : undefined),
    [groups, selectedId],
  );
  const isDefaultCohort = selectedGroup?.is_default === true;
  const defaultCohortDetailsEditable =
    canManageCohorts && (!isDefaultCohort || canManageDefaultCohort);
  const cohortDetailsEditable = canManageCohorts && defaultCohortDetailsEditable;

  const canSaveMembership = canManageCohorts && (!isCreating || selectedId != null) && !isDefaultCohort;

  const loadGroups = useCallback(async (eid: number, sid: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      setGroups(await listSubjectMarkingGroups(eid, sid));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load cohorts");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExaminers = useCallback(async (eid: number) => {
    try {
      setExaminers(await listExaminationExaminers(eid));
    } catch {
      setExaminers([]);
    }
  }, []);

  useEffect(() => {
    if (lockedSubjectId != null) {
      setSubjectId(lockedSubjectId);
    }
  }, [lockedSubjectId]);

  useEffect(() => {
    if (examId == null) {
      setGroups([]);
      setExaminers([]);
      return;
    }
    loadExaminers(examId);
  }, [examId, loadExaminers]);

  useEffect(() => {
    if (examId == null || subjectId == null) {
      setGroups([]);
      closeModal();
      setUnassignedModalOpen(false);
      return;
    }
    loadGroups(examId, subjectId);
  }, [examId, loadGroups, subjectId]);

  useEffect(() => {
    if (!modalOpen) return;
    if (isCreating) {
      setNameInput("");
      setScheduleDraft(emptyCohortScheduleDraft());
      const pending = pendingPreselectedRef.current;
      pendingPreselectedRef.current = [];
      if (pending.length > 0) {
        membership.initWithExaminerIds(pending);
      } else {
        membership.resetEmpty();
      }
      setDeleteConfirmOpen(false);
      setCaptureCreateBaseline(true);
      return;
    }
    if (!selectedGroup) return;
    setNameInput(selectedGroup.name);
    setScheduleDraft(cohortScheduleFromRow(selectedGroup));
    membership.initFromCohort({
      examiner_ids: selectedGroup.examiner_ids,
      source_regions: selectedGroup.source_regions,
      source_roles: selectedGroup.source_roles,
    });
    setDeleteConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init when modal opens / selection changes
  }, [modalOpen, isCreating, selectedGroup?.id]);

  useEffect(() => {
    if (!modalOpen || !isCreating || !captureCreateBaseline) return;
    setSavedSnapshot(buildCohortFormSnapshot(nameInput, scheduleDraft, membershipPayloadFromDrafts()));
    setCaptureCreateBaseline(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture baseline once after create init
  }, [modalOpen, isCreating, captureCreateBaseline, nameInput, scheduleDraft, membership.membersDraft, membership.regionsDraft, membership.rolesDraft]);

  function openCreate(examinerIds: string[] = []) {
    setSelectedId(null);
    setIsCreating(true);
    setSavedSnapshot(null);
    pendingPreselectedRef.current = examinerIds;
    setModalOpen(true);
    setDetailsError(null);
    setMembershipError(null);
  }

  function openSelect(id: string) {
    const group = groups.find((g) => g.id === id);
    if (group) {
      setSavedSnapshot(snapshotFromGroup(group));
    }
    setSelectedId(id);
    setIsCreating(false);
    setModalOpen(true);
    setDetailsError(null);
    setMembershipError(null);
  }

  function openUnassigned() {
    setUnassignedModalOpen(true);
  }

  async function handleAddToCohort(cohortId: string, examinerIds: string[]) {
    if (examId == null || subjectId == null) return;
    const group = groups.find((g) => g.id === cohortId);
    if (!group) return;

    setBusy(true);
    setLoadError(null);
    try {
      const mergedIds = [...new Set([...group.examiner_ids, ...examinerIds])];
      await replaceSubjectMarkingGroupMembers(examId, subjectId, cohortId, {
        source_regions: group.source_regions,
        source_roles: group.source_roles,
        examiner_ids: mergedIds,
      });
      await loadGroups(examId, subjectId);
      setUnassignedModalOpen(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to add examiners");
    } finally {
      setBusy(false);
    }
  }

  function handleCreateWithSelected(examinerIds: string[]) {
    setUnassignedModalOpen(false);
    openCreate(examinerIds);
  }

  function cancelDetailsEdit() {
    if (savedSnapshot) {
      setNameInput(savedSnapshot.name);
      setScheduleDraft({ ...savedSnapshot.schedule });
    }
    setDetailsError(null);
  }

  async function handleSaveDetails(): Promise<boolean> {
    if (examId == null || subjectId == null) return false;
    const name = nameInput.trim();
    if (!name) {
      setDetailsError("Cohort name is required.");
      return false;
    }
    if (scheduleValidation.hasBlockingErrors) {
      setDetailsError("Fix schedule errors before saving.");
      return false;
    }

    setBusy(true);
    setDetailsError(null);
    try {
      const detailsPayload = {
        name,
        ...cohortScheduleToPayload(scheduleDraft),
      };
      const membershipPayload = membershipPayloadFromDrafts();

      if (isCreating) {
        const created = await createSubjectMarkingGroup(examId, subjectId, detailsPayload);
        await loadGroups(examId, subjectId);
        setIsCreating(false);
        setSelectedId(created.id);
        setSavedSnapshot(buildCohortFormSnapshot(name, scheduleDraft, membershipPayload));
      } else if (selectedId) {
        await updateSubjectMarkingGroup(examId, subjectId, selectedId, detailsPayload);
        await loadGroups(examId, subjectId);
        setSavedSnapshot((prev) =>
          buildCohortFormSnapshot(
            name,
            scheduleDraft,
            prev?.membership ?? membershipPayload,
          ),
        );
      }
      return true;
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : "Failed to save details");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMembership(): Promise<boolean> {
    if (examId == null || subjectId == null) return false;
    if (isCreating && !selectedId) {
      setMembershipError("Save details first to create this cohort.");
      return false;
    }
    if (!selectedId) return false;

    setBusy(true);
    setMembershipError(null);
    try {
      const membershipPayload = membership.buildPayload();
      await replaceSubjectMarkingGroupMembers(
        examId,
        subjectId,
        selectedId,
        membershipPayload,
      );
      await loadGroups(examId, subjectId);
      setSavedSnapshot((prev) =>
        buildCohortFormSnapshot(
          prev?.name ?? nameInput.trim(),
          prev?.schedule ?? scheduleDraft,
          membershipPayload,
        ),
      );
      return true;
    } catch (e) {
      setMembershipError(e instanceof Error ? e.message : "Failed to save membership");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (examId == null || subjectId == null || !selectedId) return;
    setBusy(true);
    setMembershipError(null);
    try {
      await deleteSubjectMarkingGroup(examId, subjectId, selectedId);
      closeModal();
      await loadGroups(examId, subjectId);
    } catch (e) {
      setMembershipError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const softWarning =
    membership.selectedCount === 0 ? "This cohort has no examiners yet." : null;

  const panelClass =
    embedded && !pageScroll
      ? "flex min-h-0 flex-1 flex-col overflow-hidden"
      : embedded
        ? "flex flex-col"
        : EXAMINERS_PANEL_CLASS;

  return (
    <div className={panelClass}>
      {lockedSubjectId == null ? (
      <div className="shrink-0 border-b border-border/80 px-4 py-4 sm:px-5">
        <SubjectScopePicker
          subjects={subjects}
          selectedSubjectId={subjectId}
          onSelectedSubjectIdChange={(id) => {
            setSubjectId(id);
            closeModal();
            setUnassignedModalOpen(false);
          }}
          subjectComboboxId="smg-subject"
          resetKey={examId}
          disabled={loading || busy}
        />
      </div>
      ) : null}

      {subjectId == null ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {canManageCohorts ? "Select a subject to manage cohorts." : "Select a subject to view cohorts."}
          </p>
        </div>
      ) : (
        <>
          <CohortCoverageBar
            coverage={coverage}
            entityLabel="cohort"
            onShowUnassigned={openUnassigned}
            trailing={
              canManageCohorts ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => openCreate()}>
                  New cohort
                </Button>
              ) : null
            }
          />

          <CohortListColumn
            cohorts={cohortList}
            onSelect={openSelect}
            onNew={() => openCreate()}
            loading={loading}
            unassignedCount={coverage.unassignedCount}
            showUnassignedCount
            showScheduleColumn
            emptyLabel={
              canManageCohorts
                ? "No cohorts yet. Create one to assign examiners and set dates."
                : "No cohorts yet."
            }
            hideNewButton
          />

          <CohortUnassignedModal
            open={unassignedModalOpen}
            onClose={() => setUnassignedModalOpen(false)}
            entityLabel="cohort"
            examiners={subjectExaminers}
            unassignedIds={coverage.unassignedIds}
            cohorts={cohortList}
            busy={busy}
            readOnly={!canManageCohorts}
            onCreateWithSelected={handleCreateWithSelected}
            onAddToCohort={(cohortId, ids) => void handleAddToCohort(cohortId, ids)}
          />

          <CohortManageModal
            open={modalOpen}
            mode={isCreating ? "create" : "edit"}
            entityLabel="cohort"
            description={
              !canManageCohorts
                ? "View-only. Only Test Admin and Super Admin can create or edit cohorts."
                : isDefaultCohort
                  ? canManageDefaultCohort
                    ? "All subject examiners are always in the default cohort. You can edit the schedule; membership is synced from the roster."
                    : "All subject examiners are always in the default cohort. Only administrators can edit the default schedule; membership is synced from the roster."
                  : undefined
            }
            name={nameInput}
            onNameChange={setNameInput}
            isDirty={isDirty}
            detailsDirty={detailsDirty}
            membershipDirty={membershipDirty}
            detailsSection={({ locked, busy: detailsBusy }) => (
              <CohortScheduleFields
                draft={scheduleDraft}
                onChange={setScheduleDraft}
                disabled={busy || detailsBusy || locked}
              />
            )}
            showRolesTab
            activeTab={membership.activeTab}
            onTabChange={membership.setActiveTab}
            regionOptions={membership.regionOptions}
            roleOptions={membership.roleOptions}
            regionsDraft={membership.regionsDraft}
            rolesDraft={membership.rolesDraft}
            membersDraft={membership.membersDraft}
            claimedRegions={membership.claimedRegions}
            claimedRoles={membership.claimedRoles}
            examiners={subjectExaminers}
            unassignedIds={coverage.unassignedIds}
            peopleFilterUnassignedOnly={membership.peopleFilterUnassignedOnly}
            onPeopleFilterUnassignedOnlyChange={membership.setPeopleFilterUnassignedOnly}
            selectedCount={membership.selectedCount}
            busy={busy}
            detailsError={detailsError}
            membershipError={membershipError}
            softWarning={softWarning}
            scheduleWarnings={scheduleValidation.warnings}
            detailsSaveDisabled={scheduleValidation.hasBlockingErrors}
            canSaveMembership={canSaveMembership}
            membershipLocked={!canManageCohorts || isDefaultCohort}
            nameDisabled={!canManageCohorts || isDefaultCohort}
            detailsEditable={cohortDetailsEditable}
            deleteConfirmOpen={deleteConfirmOpen}
            onDeleteConfirmOpenChange={setDeleteConfirmOpen}
            onToggleRegion={membership.toggleRegion}
            onToggleRole={membership.toggleRole}
            onToggleExaminer={membership.toggleExaminer}
            onSaveDetails={() => handleSaveDetails()}
            onCancelDetailsEdit={cancelDetailsEdit}
            onSaveMembership={() => void handleSaveMembership()}
            onDelete={
              !canManageCohorts || isCreating || isDefaultCohort ? undefined : () => void handleDelete()
            }
            onClose={closeModal}
          />
        </>
      )}
    </div>
  );
}
